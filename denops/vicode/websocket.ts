import { Denops } from "jsr:@denops/core@7.0.1/type";
// Import protobuf generated types
import type {
  VicodeMessage,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload,
} from "../gen/vicode_pb.ts";

// Define sync request/response type
interface CommandRequest {
  id: string;
  command: string;
  args: string[];
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: number | null;
}
import {
  getCurrentCol,
  getCurrentLine,
  getCurrentPath,
  getLastLine,
  getSpecificLineLength,
} from "./utils.ts";


// Declare Deno namespace for TypeScript compiler
declare namespace Deno {
  function upgradeWebSocket(req: Request): { socket: WebSocket; response: Response };
  function serve(options: { port: number }, handler: (req: Request) => Response): {
    addr: { port: number };
    shutdown(): Promise<void>;
  };
}

// private field in WebSocketManager is not working
const sockets = new Set<WebSocket>();

// Store pending command requests
const pendingRequests = new Map<string, CommandRequest>();

export class WebSocketManager {
  private lastCursorPos: { path: string; line: number; col: number } | null =
    null;

  addSocket(socket: WebSocket) {
    sockets.add(socket);
  }

  removeSocket(socket: WebSocket) {
    sockets.delete(socket);
  }

  // Check if there are active WebSocket connections
  hasActiveConnections(): boolean {
    if (sockets.size === 0) {
      return false;
    }

    // Check if any connections are in OPEN state
    let hasActive = false;
    sockets.forEach((s) => {
      if (s.readyState === WebSocket.OPEN) {
        hasActive = true;
      }
    });

    return hasActive;
  }

  broadcast(data: VicodeMessage) {
    // Ensure sender is always 'vim' when broadcasting from Vim
    const messageToSend = { ...data, sender: "vim" };

    // Check if any sockets are available
    if (sockets.size === 0) {
      console.warn("Vicode: No connected clients to broadcast to");
      return;
    }

    // Check status of each socket
    let activeSockets = 0;
    sockets.forEach((s) => {
      if (s.readyState === WebSocket.OPEN) {
        try {
          s.send(JSON.stringify(messageToSend));
          activeSockets++;
        } catch (error) {
          console.error("Vicode: Error sending message:", error);
        }
      } else {
        console.warn(`Vicode: Socket not in OPEN state (state: ${s.readyState}), removing it`);
        this.removeSocket(s);
      }
    });

    if (activeSockets === 0) {
      console.warn("Vicode: No active sockets to broadcast to");
    }
  }

  getLastCursorPos() {
    return this.lastCursorPos;
  }

  setLastCursorPos(pos: { path: string; line: number; col: number }) {
    this.lastCursorPos = pos;
  }

  // Send command and wait for response
  async sendCommandAndWaitForResponse(command: string, args: string[], timeout: number): Promise<unknown> {
    if (sockets.size === 0) {
      throw new Error("No connected clients");
    }

    return new Promise((resolve, reject) => {
      // Generate unique request ID
      const requestId = crypto.randomUUID();

      // Create command execution message with request ID
      const message: VicodeMessage = {
        sender: "vim",
        payload: {
          case: "executeCommand",
          value: {
            command,
            args,
            requestId: requestId,
          }
        }
      };

      // Set timeout handler
      const timer = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error(`Command '${command}' timed out after ${timeout}ms`));
        }
      }, timeout);

      // Store request information
      pendingRequests.set(requestId, {
        id: requestId,
        command,
        args,
        resolve,
        reject,
        timer: timer as unknown as number, // Type cast to resolve TypeScript error
      });

      // Send request
      this.broadcast(message);
    });
  }

  // Handle command response
  handleCommandResponse(requestId: string, result: unknown, isError: boolean): void {
    const request = pendingRequests.get(requestId);
    if (!request) {
      console.warn(`Vicode: Received response for unknown request: ${requestId}`);
      return;
    }

    // Clear timeout timer
    if (request.timer !== null) {
      clearTimeout(request.timer);
    }

    // Remove from pending requests
    pendingRequests.delete(requestId);

    // Call appropriate callback
    if (isError) {
      request.reject(result);
    } else {
      request.resolve(result);
    }
  }

  async handleCursorPosMessage(denops: Denops, payload: CursorPosPayload) {
    let newCursorPos: { path: string; line: number; col: number } = {
      path: payload.path,
      line: payload.line,
      col: payload.col
    };
    const currentLine = await getCurrentLine(denops);
    const currentCol = await getCurrentCol(denops);
    const currentPath = await getCurrentPath(denops);
    const lastLine = await getLastLine(denops);
    const lastColOfNewLine = await getSpecificLineLength(
      denops,
      newCursorPos.line,
    );

    if (
      currentPath === newCursorPos.path &&
      (lastLine < newCursorPos.line || lastColOfNewLine < newCursorPos.col)
    ) {
      newCursorPos = {
        path: currentPath,
        line: currentLine,
        col: currentCol,
      };
    }

    const lastCursorPos = this.getLastCursorPos();
    if (
      lastCursorPos &&
      lastCursorPos.path === newCursorPos.path &&
      lastCursorPos.line === newCursorPos.line &&
      lastCursorPos.col === newCursorPos.col
    ) {
      return;
    }
    const buftype = (await denops.eval("&buftype")) as string;
    if (buftype === "terminal") {
      await denops.cmd(`tabnew ${newCursorPos.path}`);
    } else if (currentPath !== newCursorPos.path) {
      await denops.cmd(`edit ${newCursorPos.path}`);
    }

    this.setLastCursorPos({
      path: newCursorPos.path,
      line: newCursorPos.line,
      col: newCursorPos.col,
    });

    await denops.cmd(
      `execute "noautocmd call cursor(${newCursorPos.line}, ${newCursorPos.col})"`,
    );
  }
}

// Define Deno server type
type DenoHttpServer = {
  addr: { port: number };
  shutdown(): Promise<void>;
};

let currentServer: DenoHttpServer | null = null;

export async function stopWsServer() {
  if (!currentServer) {
    console.log("Vicode: No server to stop");
    return;
  }
  await currentServer.shutdown();
  currentServer = null;
  console.log("Vicode: Server stopped");
}

const wsManager = new WebSocketManager();
console.log("initialize wsmanager");

// Define request and response types
type WebSocketRequest = {
  headers: {
    get(name: string): string | null;
  };
};

type WebSocketResponse = Response;

function handleWs(denops: Denops, req: WebSocketRequest): WebSocketResponse {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("not trying to upgrade as websocket.");
  }

  // Use Deno's upgradeWebSocket function
  const { socket, response } = Deno.upgradeWebSocket(req as Request);
  wsManager.addSocket(socket);

  socket.onopen = () => {
    console.log("Vicode: Client connected");

    // Send a ping message to ensure connection is working
    try {
      const pingMessage: VicodeMessage = {
        sender: "vim",
        payload: {
          case: "executeCommand",
          value: {
            command: "_ping",
            args: [],
          }
        }
      };
      socket.send(JSON.stringify(pingMessage));
      console.log("Vicode: Sent ping message to VSCode");
    } catch (error) {
      console.error("Vicode: Error sending ping message:", error);
    }
  };

  socket.onclose = (event) => {
    console.log(`Vicode: Client disconnected (code: ${event.code}, reason: ${event.reason || "none"})`);
    wsManager.removeSocket(socket);
  };

  socket.onmessage = async (e: MessageEvent) => {
    // Parse message and handle known types
    try {
      const msg = JSON.parse(e.data as string) as VicodeMessage;

      // Only process messages from vscode
      if (msg.sender === "vscode") {
        if (msg.payload.case === "cursorPos" && msg.payload.value) {
          await wsManager.handleCursorPosMessage(denops, msg.payload.value);
        }

        else if (msg.payload.case === "selectionPos") {
          // Vim currently doesn't handle SelectionPos from VSCode, but log it
          console.log("Vicode: Received SelectionPos (ignored)");
        }
        else if (msg.payload.case === "executeCommand" && msg.payload.value) {
          // Check if it's a command response
          if (msg.payload.value.requestId) {
            console.log(`Vicode: Received command response for request: ${msg.payload.value.requestId}`);
            wsManager.handleCommandResponse(
              msg.payload.value.requestId,
              msg.payload.value.result,
              msg.payload.value.isError || false
            );
          }
          // Check if it's a callback response
          else if (msg.payload.value.callbackId) {
            console.log(`Vicode: Received command result for callback: ${msg.payload.value.callbackId}`);
            await denops.dispatch(
              "vicode",
              "handleCommandResult",
              {
                callback_id: msg.payload.value.callbackId,
                result: msg.payload.value.result,
                is_error: msg.payload.value.isError || false
              }
            );
          }
          // Regular command (not handled)
          else {
            console.log(`Vicode: Received ExecuteCommand: ${msg.payload.value.command} (ignored)`);
          }
        }
        else if (msg.payload.case === "closeBuffer" && msg.payload.value) {
          // Temporarily commented out code for handling CloseBuffer requests from VSCode
          console.log(`Vicode: Received CloseBuffer request for path: ${msg.payload.value.path} (ignored)`);
          // Code below is commented out because we only need one-way sync from Neovim to VSCode for now
          // await denops.dispatch("vicode", "closeBufferFromVSCode", msg.payload.value.path);
        }
        else {
          console.warn("Vicode: Received unknown message payload type:", msg);
        }
      }
    } catch (error) {
      console.error("Vicode: Error processing message:", error, e.data);
    }
  };

  socket.onerror = (e: Event) => {
    console.error("Vicode error:", e);
    wsManager.removeSocket(socket);

    // Log error but don't try to reconnect, as client will auto-reconnect
    console.log("Vicode: WebSocket error occurred, client will reconnect automatically");
  };
  return response;
}

export async function runWsServer(denops: Denops) {
  console.log("Vicode: Starting WebSocket server...");

  // Close existing server if any
  if (currentServer) {
    console.log("Vicode: Closing existing server");
    await currentServer.shutdown();
    currentServer = null;
  }

  try {
    // Start server using Deno.serve
    console.log("Vicode: Creating new WebSocket server...");
    const server = Deno.serve({ port: 0 }, (req: Request) => handleWs(denops, req));
    currentServer = server as unknown as DenoHttpServer;
    const port = server.addr.port;
    console.log(`Vicode: Server started on port ${port}`);

    return port;
  } catch (error) {
    console.error("Vicode: Error starting WebSocket server:", error);
    throw error;
  }
}
