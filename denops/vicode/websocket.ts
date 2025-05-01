import { Denops } from "jsr:@denops/core@7.0.1/type";
// 导入 protobuf 生成的类型
import type {
  VicodeMessage,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload,
} from "../gen/vicode_pb.ts";

// 定义同步请求/响应类型
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

// 存储待处理的命令请求
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

  broadcast(data: VicodeMessage) {
    // Ensure sender is always 'vim' when broadcasting from Vim
    const messageToSend = { ...data, sender: "vim" };

    // 检查是否有可用的socket
    if (sockets.size === 0) {
      console.warn("Vicode: No connected clients to broadcast to");
      return;
    }

    // 检查每个socket的状态
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
    } else {
      console.log(`Vicode: Broadcasted message to ${activeSockets} clients`);
    }
  }

  getLastCursorPos() {
    return this.lastCursorPos;
  }

  setLastCursorPos(pos: { path: string; line: number; col: number }) {
    this.lastCursorPos = pos;
  }

  // 发送命令并等待响应
  async sendCommandAndWaitForResponse(command: string, args: string[], timeout: number): Promise<unknown> {
    if (sockets.size === 0) {
      throw new Error("No connected clients");
    }

    return new Promise((resolve, reject) => {
      // 生成唯一请求ID
      const requestId = crypto.randomUUID();

      // 创建命令执行消息，包含请求ID
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

      // 设置超时处理
      const timer = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error(`Command '${command}' timed out after ${timeout}ms`));
        }
      }, timeout);

      // 存储请求信息
      pendingRequests.set(requestId, {
        id: requestId,
        command,
        args,
        resolve,
        reject,
        timer: timer as unknown as number, // 类型转换以解决TypeScript错误
      });

      // 发送请求
      this.broadcast(message);
    });
  }

  // 处理命令响应
  handleCommandResponse(requestId: string, result: unknown, isError: boolean): void {
    const request = pendingRequests.get(requestId);
    if (!request) {
      console.warn(`Vicode: Received response for unknown request: ${requestId}`);
      return;
    }

    // 清除超时计时器
    if (request.timer !== null) {
      clearTimeout(request.timer);
    }

    // 从待处理请求中移除
    pendingRequests.delete(requestId);

    // 调用相应的回调
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

    // 发送一个ping消息，确保连接正常
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
    // 解析消息并处理已知类型
    try {
      const msg = JSON.parse(e.data as string) as VicodeMessage;
      console.log(`Vicode: Received message payload type: ${msg.payload?.case}`);

      // 只处理来自 vscode 的消息
      if (msg.sender === "vscode") {
        if (msg.payload.case === "cursorPos" && msg.payload.value) {
          await wsManager.handleCursorPosMessage(denops, msg.payload.value);
        }

        else if (msg.payload.case === "selectionPos") {
          // Vim 当前不处理来自 VSCode 的 SelectionPos，但记录它
          console.log("Vicode: Received SelectionPos (ignored)");
        }
        else if (msg.payload.case === "executeCommand" && msg.payload.value) {
          // 检查是否是命令响应
          if (msg.payload.value.requestId) {
            console.log(`Vicode: Received command response for request: ${msg.payload.value.requestId}`);
            wsManager.handleCommandResponse(
              msg.payload.value.requestId,
              msg.payload.value.result,
              msg.payload.value.isError || false
            );
          }
          // 检查是否是回调响应
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
          // 普通命令（不处理）
          else {
            console.log(`Vicode: Received ExecuteCommand: ${msg.payload.value.command} (ignored)`);
          }
        }
        else if (msg.payload.case === "closeBuffer" && msg.payload.value) {
          // 暂时注释掉处理来自VSCode的关闭buffer请求的代码
          console.log(`Vicode: Received CloseBuffer request for path: ${msg.payload.value.path} (ignored)`);
          // 以下代码被注释掉，因为我们暂时只需要Neovim到VSCode的单向同步
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

    // 记录错误，但不尝试重新连接，因为客户端会自动重连
    console.log("Vicode: WebSocket error occurred, client will reconnect automatically");
  };
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
    // 使用 Deno.serve 启动服务器
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
