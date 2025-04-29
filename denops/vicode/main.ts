import { Denops } from "jsr:@denops/std";
import { debounce } from "https://deno.land/std@0.224.0/async/mod.ts";
import { runWsServer, stopWsServer, WebSocketManager } from "./websocket.ts";
import {
  ensureNumber,
  ensureObject,
  ensureString,
  getCurrentCol,
  getCurrentLine,
  getCurrentPath,
  getCurrentText,
} from "./utils.ts";
// 导入 protobuf 生成的类型
import type {
  VicodeMessage,
  TextContentPayload,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload,
} from "../gen/vicode_pb.ts";

const wsManager = new WebSocketManager();

export function main(denops: Denops): Promise<void> {
  const debouncedSyncCursor = debounce(
    async (line: unknown, col: unknown) => {
      const lineNum = ensureNumber(line);
      const colNum = ensureNumber(col);
      const path = ensureString(await denops.call("expand", "%:p"));

      // 创建光标位置消息
      const message: VicodeMessage = {
        sender: "vim",
        payload: {
          case: "cursorPos",
          value: {
            path,
            line: lineNum,
            col: colNum,
          }
        }
      };
      wsManager.broadcast(message);
    },
    50, // 防抖时间保持不变
  );

  denops.dispatcher = {
    async syncText(): Promise<void> {
      const currentBuffer = await getCurrentPath(denops);
      const line = await getCurrentLine(denops);
      const col = await getCurrentCol(denops);

      // 创建文本内容消息
      const message: VicodeMessage = {
        sender: "vim",
        payload: {
          case: "textContent",
          value: {
            path: currentBuffer,
            text: await getCurrentText(denops),
            cursorLine: line,
            cursorCol: col,
          }
        }
      };

      wsManager.broadcast(message);
      return Promise.resolve();
    },

    syncCursorPos: async () => {
      const lineNum = await getCurrentLine(denops);
      const colNum = await getCurrentCol(denops);
      const currentPath = await getCurrentPath(denops);
      const lastCursorPos = wsManager.getLastCursorPos();

      if (
        lastCursorPos &&
        lastCursorPos.path === currentPath &&
        lastCursorPos.line === lineNum &&
        lastCursorPos.col === colNum
      ) {
        return;
      }

      wsManager.setLastCursorPos({
        path: currentPath,
        line: lineNum,
        col: colNum,
      });
      debouncedSyncCursor(lineNum, colNum);
    },

    async syncSelectionPos(
      startLine: unknown,
      startCol: unknown,
      endLine: unknown,
      endCol: unknown,
    ): Promise<void> {
      // 创建选择位置消息
      const message: VicodeMessage = {
        sender: "vim",
        payload: {
          case: "selectionPos",
          value: {
            path: await getCurrentPath(denops),
            startLine: ensureNumber(startLine),
            startCol: ensureNumber(startCol),
            endLine: ensureNumber(endLine),
            endCol: ensureNumber(endCol),
          }
        }
      };
      wsManager.broadcast(message);
      return Promise.resolve();
    },

    // 执行 VSCode 命令的方法
    async executeVSCodeCommand(
      command: unknown,
      args?: unknown,
    ): Promise<void> {
      const commandStr = ensureString(command);
      // 确保参数是字符串数组，符合 protobuf 类型要求
      let commandArgs: string[] = [];

      if (args !== undefined && args !== null) {
        if (Array.isArray(args)) {
          // 确保数组中的所有元素都是字符串
          commandArgs = args.map(arg => String(arg));
        } else {
          // 将单个非数组参数包装为字符串数组
          commandArgs = [String(args)];
        }
      }

      console.log(
        `Vicode: Sending command '${commandStr}' with args: ${JSON.stringify(commandArgs)}`,
      );

      // 创建命令执行消息
      const message: VicodeMessage = {
        sender: "vim",
        payload: {
          case: "executeCommand",
          value: {
            command: commandStr,
            args: commandArgs,
          }
        }
      };
      wsManager.broadcast(message);
      return Promise.resolve();
    },

    async start() {
      console.log("Vicode: start method called in dispatcher");
      try {
        // 添加超时处理
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Vicode: WebSocket server start timed out"));
          }, 10000); // 10秒超时
        });

        // 竞争条件：哪个先完成就返回哪个结果
        const port = await Promise.race([
          runWsServer(denops),
          timeoutPromise
        ]);

        console.log(`Vicode: WebSocket server started successfully on port ${port}`);
        return { success: true, port };
      } catch (error) {
        console.error("Vicode: Failed to start WebSocket server:", error);
        return { success: false, error: String(error) };
      }
    },

    async stop() {
      await stopWsServer();
    },

    // 处理关闭buffer的方法
    async closeBuffer(path: unknown): Promise<void> {
      const filePath = ensureString(path);
      console.log(`Vicode: Sending close buffer message for path: ${filePath}`);

      // 创建关闭buffer消息
      const message: VicodeMessage = {
        sender: "vim",
        payload: {
          case: "closeBuffer",
          value: {
            path: filePath,
          }
        }
      };
      wsManager.broadcast(message);
      return Promise.resolve();
    },

    // 处理来自VSCode的关闭buffer请求 (暂时注释掉)
    async closeBufferFromVSCode(path: unknown): Promise<void> {
      const filePath = ensureString(path);
      console.log(`Vicode: Received request to close buffer for path: ${filePath} (function disabled)`);
      return Promise.resolve();
    },

    // 异步执行VSCode命令并支持回调
    async executeVSCodeCommandAsync(
      command: unknown,
      args: unknown,
      callback_id: unknown
    ): Promise<void> {
      const commandStr = ensureString(command);
      // 确保参数是字符串数组
      let commandArgs: string[] = [];

      if (args !== undefined && args !== null) {
        if (Array.isArray(args)) {
          commandArgs = args.map(arg => String(arg));
        } else {
          commandArgs = [String(args)];
        }
      }

      console.log(
        `Vicode: Sending async command '${commandStr}' with args: ${JSON.stringify(commandArgs)} and callback_id: ${callback_id}`,
      );

      // 创建命令执行消息，包含回调ID
      const message: VicodeMessage = {
        sender: "vim",
        payload: {
          case: "executeCommand",
          value: {
            command: commandStr,
            args: commandArgs,
            callbackId: callback_id ? String(callback_id) : undefined,
          }
        }
      };
      wsManager.broadcast(message);
      return Promise.resolve();
    },

    // 同步执行VSCode命令
    async executeVSCodeCommandSync(
      command: unknown,
      args: unknown,
      timeout: unknown
    ): Promise<Record<string, unknown>> {
      const commandStr = ensureString(command);
      const timeoutMs = ensureNumber(timeout || 5000);

      // 确保参数是字符串数组
      let commandArgs: string[] = [];

      if (args !== undefined && args !== null) {
        if (Array.isArray(args)) {
          commandArgs = args.map(arg => String(arg));
        } else {
          commandArgs = [String(args)];
        }
      }

      console.log(
        `Vicode: Sending sync command '${commandStr}' with args: ${JSON.stringify(commandArgs)} and timeout: ${timeoutMs}ms`,
      );

      try {
        // 使用WebSocket管理器发送同步请求
        const result = await wsManager.sendCommandAndWaitForResponse(commandStr, commandArgs, timeoutMs);
        return { success: true, data: result };
      } catch (error) {
        console.error(`Vicode: Error executing command ${commandStr}:`, error);
        return { success: false, error: String(error) };
      }
    },

    // 处理来自VSCode的命令执行结果回调
    async handleCommandResult(params: unknown): Promise<void> {
      const { callback_id, result, is_error } = ensureObject(params);
      const id = ensureNumber(callback_id);

      console.log(`Vicode: Received command result for callback_id: ${id}, is_error: ${is_error}`);

      // 调用Lua回调函数
      await denops.call("luaeval", "require('vicode.api').invoke_callback(_A[1], _A[2], _A[3])", [id, result, is_error]);

      return Promise.resolve();
    },
  };

  return Promise.resolve();
}
