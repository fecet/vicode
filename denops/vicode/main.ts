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
} from "./utils.ts";
// Import protobuf generated types
import type {
  VicodeMessage,
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

      // Create cursor position message
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
    50, // Debounce time in ms
  );

  denops.dispatcher = {
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
      // Create selection position message
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

    // Execute VSCode command method
    async executeVSCodeCommand(
      command: unknown,
      args?: unknown,
    ): Promise<void> {
      const commandStr = ensureString(command);
      // Ensure args are string array to match protobuf type requirements
      let commandArgs: string[] = [];

      if (args !== undefined && args !== null) {
        if (Array.isArray(args)) {
          // Ensure all array elements are strings
          commandArgs = args.map(arg => String(arg));
        } else {
          // Wrap single non-array argument as string array
          commandArgs = [String(args)];
        }
      }

      console.log(
        `Vicode: Sending command '${commandStr}' with args: ${JSON.stringify(commandArgs)}`,
      );

      // Create command execution message
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
        // Add timeout handling
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Vicode: WebSocket server start timed out"));
          }, 10000); // 10 second timeout
        });

        // Race condition: return result of whichever completes first
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

    // Add ping method to verify server is ready
    async ping() {
      console.log("Vicode: ping method called in dispatcher");

      // Check if there are active WebSocket connections
      const hasActiveConnections = wsManager.hasActiveConnections();

      if (hasActiveConnections) {
        console.log("Vicode: Server is ready with active connections");
        return { success: true };
      } else {
        console.log("Vicode: Server is running but no active connections");
        return { success: false, error: "No active WebSocket connections" };
      }
    },

    // Handle buffer close method
    async closeBuffer(path: unknown): Promise<void> {
      const filePath = ensureString(path);
      console.log(`Vicode: Sending close buffer message for path: ${filePath}`);

      // Create close buffer message
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

    // Handle close buffer request from VSCode (temporarily disabled)
    async closeBufferFromVSCode(path: unknown): Promise<void> {
      const filePath = ensureString(path);
      console.log(`Vicode: Received request to close buffer for path: ${filePath} (function disabled)`);
      return Promise.resolve();
    },

    // Execute VSCode command asynchronously with callback support
    async executeVSCodeCommandAsync(
      command: unknown,
      args: unknown,
      callback_id: unknown
    ): Promise<void> {
      const commandStr = ensureString(command);
      // Ensure args are string array
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

      // Create command execution message with callback ID
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

    // Execute VSCode command synchronously
    async executeVSCodeCommandSync(
      command: unknown,
      args: unknown,
      timeout: unknown
    ): Promise<Record<string, unknown>> {
      const commandStr = ensureString(command);
      const timeoutMs = ensureNumber(timeout || 5000);

      // Ensure args are string array
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
        // Use WebSocket manager to send synchronous request
        const result = await wsManager.sendCommandAndWaitForResponse(commandStr, commandArgs, timeoutMs);
        return { success: true, data: result };
      } catch (error) {
        console.error(`Vicode: Error executing command ${commandStr}:`, error);
        return { success: false, error: String(error) };
      }
    },

    // Handle command execution result callback from VSCode
    async handleCommandResult(params: unknown): Promise<void> {
      const { callback_id, result, is_error } = ensureObject(params);
      const id = ensureNumber(callback_id);

      console.log(`Vicode: Received command result for callback_id: ${id}, is_error: ${is_error}`);

      // Call Lua callback function
      await denops.call("luaeval", "require('vicode.api').invoke_callback(_A[1], _A[2], _A[3])", [id, result, is_error]);

      return Promise.resolve();
    },
  };

  return Promise.resolve();
}
