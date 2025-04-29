import { Denops } from "jsr:@denops/core@7.0.1/type";
// 导入 protobuf 生成的类型
import type {
  TextContentMessage,
  CursorPosMessage,
  SelectionPosMessage,
  ExecuteCommandMessage,
} from "../gen/vicode_pb.ts";
import {
  getCurrentCol,
  getCurrentLine,
  getCurrentPath,
  getLastLine,
  getSpecificLineLength,
} from "./utils.ts";
import { cleanupSessions, saveSession, getConfigDir } from "./session.ts";

// Define a type for all message types
type Message = TextContentMessage | CursorPosMessage | SelectionPosMessage | ExecuteCommandMessage;

// 声明 Deno 命名空间，以便 TypeScript 编译器识别
declare namespace Deno {
  function upgradeWebSocket(req: Request): { socket: WebSocket; response: Response };
  function serve(options: { port: number }, handler: (req: Request) => Response): {
    addr: { port: number };
    shutdown(): Promise<void>;
  };
}

// private field in WebSocketManager is not working
const sockets = new Set<WebSocket>();

export class WebSocketManager {
  private lastCursorPos: { path: string; line: number; col: number } | null =
    null;

  addSocket(socket: WebSocket) {
    sockets.add(socket);
  }

  removeSocket(socket: WebSocket) {
    sockets.delete(socket);
  }

  broadcast(data: Message) {
    // Ensure sender is always 'vim' when broadcasting from Vim
    const messageToSend = { ...data, sender: "vim" };
    sockets.forEach((s) => s.send(JSON.stringify(messageToSend)));
  }

  getLastCursorPos() {
    return this.lastCursorPos;
  }

  setLastCursorPos(pos: { path: string; line: number; col: number }) {
    this.lastCursorPos = pos;
  }

  async handleCursorPosMessage(denops: Denops, msg: CursorPosMessage) {
    let newCursorPos: { path: string; line: number; col: number } = { ...msg };
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

// 定义 Deno 服务器类型
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
  await cleanupSessions();
  currentServer = null;
  console.log("Vicode: Server stopped");
}

const wsManager = new WebSocketManager();
console.log("initialize wsmanager");

// 定义请求和响应类型
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

  // 使用 Deno 的 upgradeWebSocket 函数
  const { socket, response } = Deno.upgradeWebSocket(req as Request);
  wsManager.addSocket(socket);

  socket.onopen = () => {
    console.log("Vicode: Client connected");
  };

  socket.onclose = () => {
    console.log("Vicode: Client disconnected");
    wsManager.removeSocket(socket);
  };

  socket.onmessage = async (e: MessageEvent) => {
    // 解析消息并处理已知类型
    try {
      const msg = JSON.parse(e.data as string) as Message; // 使用联合类型
      console.log(`Vicode: Received message type: ${msg.type}`); // 记录接收到的类型

      switch (msg.type) {
        case "CursorPos":
          // 只处理来自 vscode 的消息
          if (msg.sender === "vscode") {
            await wsManager.handleCursorPosMessage(denops, msg as CursorPosMessage);
          }
          break;
        // 添加其他类型的处理逻辑（如果需要）
        case "TextContent":
          // Vim 当前不处理来自 VSCode 的 TextContent，但记录它
          console.log("Vicode: Received TextContent (ignored)");
          break;
        case "SelectionPos":
          // Vim 当前不处理来自 VSCode 的 SelectionPos，但记录它
          console.log("Vicode: Received SelectionPos (ignored)");
          break;
        case "ExecuteCommand":
          // Vim 接收此命令但不执行它。记录它。
          const execMsg = msg as ExecuteCommandMessage;
          console.log(`Vicode: Received ExecuteCommand: ${execMsg.command} (ignored)`);
          break;
        default:
          console.warn("Vicode: Received unknown message type:", msg);
      }
    } catch (error) {
      console.error("Vicode: Error processing message:", error, e.data);
    }
  };

  socket.onerror = (e: Event) => console.error("Vicode error:", e);
  return response;
}

export async function runWsServer(denops: Denops) {
  console.log("Vicode: Starting WebSocket server...");

  // 关闭现有服务器（如果存在）
  if (currentServer) {
    console.log("Vicode: Closing existing server");
    await currentServer.shutdown();
    currentServer = null;
  }

  try {
    // 在启动新服务器之前清理过期会话
    console.log("Vicode: Cleaning up expired sessions...");
    await cleanupSessions();

    // 使用 Deno.serve 启动服务器
    console.log("Vicode: Creating new WebSocket server...");
    const server = Deno.serve({ port: 0 }, (req: Request) => handleWs(denops, req));
    currentServer = server as unknown as DenoHttpServer;
    const port = server.addr.port;
    console.log(`Vicode: Server started on port ${port}`);

    // Save session information
    console.log("Vicode: Saving session information...");
    try {
      const configDir = getConfigDir();
      console.log(`Vicode: Using config directory: ${configDir}`);
      await saveSession(port);
      console.log("Vicode: Session information saved successfully");
    } catch (error) {
      console.error("Vicode: Failed to save session information:", error);
    }

    return port;
  } catch (error) {
    console.error("Vicode: Error starting WebSocket server:", error);
    throw error;
  }
}
