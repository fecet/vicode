import { Denops } from "jsr:@denops/std";
import { debounce } from "https://deno.land/std@0.224.0/async/mod.ts";
import { runWsServer, stopWsServer, WebSocketManager } from "./websocket.ts";
import {
  ensureNumber,
  ensureString,
  getCurrentCol,
  getCurrentLine,
  getCurrentPath,
  getCurrentText,
} from "./utils.ts";
// 导入 protobuf 生成的类型
import type {
  TextContentMessage,
  CursorPosMessage,
  SelectionPosMessage,
  ExecuteCommandMessage,
} from "../gen/vicode_pb.ts";

// Define a type for messages with a type field for JSON serialization
type MessageWithType =
  | (TextContentMessage & { type: "TextContent" })
  | (CursorPosMessage & { type: "CursorPos" })
  | (SelectionPosMessage & { type: "SelectionPos" })
  | (ExecuteCommandMessage & { type: "ExecuteCommand" });

const wsManager = new WebSocketManager();

export function main(denops: Denops): Promise<void> {
  const debouncedSyncCursor = debounce(
    async (line: unknown, col: unknown) => {
      const lineNum = ensureNumber(line);
      const colNum = ensureNumber(col);
      const path = ensureString(await denops.call("expand", "%:p"));

      // 创建光标位置消息
      const json: CursorPosMessage & { type: "CursorPos" } = {
        type: "CursorPos",
        sender: "vim",
        path,
        line: lineNum,
        col: colNum,
      };
      wsManager.broadcast(json);
    },
    50, // 防抖时间保持不变
  );

  denops.dispatcher = {
    async syncText(): Promise<void> {
      const currentBuffer = await getCurrentPath(denops);
      const line = await getCurrentLine(denops);
      const col = await getCurrentCol(denops);

      // 创建文本内容消息
      const body: TextContentMessage & { type: "TextContent" } = {
        type: "TextContent",
        sender: "vim",
        path: currentBuffer,
        text: await getCurrentText(denops),
        cursorLine: line,
        cursorCol: col,
      };

      wsManager.broadcast(body);
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
      const json: SelectionPosMessage & { type: "SelectionPos" } = {
        type: "SelectionPos",
        startLine: ensureNumber(startLine),
        startCol: ensureNumber(startCol),
        endLine: ensureNumber(endLine),
        endCol: ensureNumber(endCol),
        path: await getCurrentPath(denops),
      };
      wsManager.broadcast(json);
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
      const json: ExecuteCommandMessage & { type: "ExecuteCommand" } = {
        type: "ExecuteCommand",
        command: commandStr,
        args: commandArgs,
      };
      wsManager.broadcast(json);
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
  };

  return Promise.resolve();
}
