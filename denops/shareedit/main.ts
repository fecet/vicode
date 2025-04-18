import { Denops } from "jsr:@denops/std";
import { debounce } from "https://deno.land/std@0.224.0/async/mod.ts";
import { runWsServer, stopWsServer, WebSocketManager } from "./websocket.ts";
import {
  ensureNumber,
  ensureString,
  // ensureArray, // Add if needed, or handle unknown[] directly
  getCurrentCol,
  getCurrentLine,
  getCurrentPath,
  getCurrentText,
} from "./utils.ts";
// Import the new type
import type {
  CursorPos,
  SelectionPos,
  TextContent,
  ExecuteCommand,
} from "./types.ts";

const wsManager = new WebSocketManager();

export function main(denops: Denops): Promise<void> {
  const debouncedSyncCursor = debounce(
    async (line: unknown, col: unknown) => {
      const lineNum = ensureNumber(line);
      const colNum = ensureNumber(col);
      const path = ensureString(await denops.call("expand", "%:p"));
      const json: CursorPos = {
        type: "CursorPos",
        sender: "vim",
        path,
        line: lineNum,
        col: colNum,
      };
      wsManager.broadcast(json);
    },
    50,
  );

  denops.dispatcher = {
    async syncText(): Promise<void> {
      const currentBuffer = await getCurrentPath(denops);
      const line = await getCurrentLine(denops);
      const col = await getCurrentCol(denops);
      const body: TextContent = {
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
      const json: SelectionPos = {
        type: "SelectionPos",
        // sender: "vim", // Sender is added in broadcast
        startLine: ensureNumber(startLine),
        startCol: ensureNumber(startCol),
        endLine: ensureNumber(endLine),
        endCol: ensureNumber(endCol),
        path: await getCurrentPath(denops),
      };
      wsManager.broadcast(json);
      return Promise.resolve();
    },

    // Add the new dispatcher method
    async executeVSCodeCommand(
      command: unknown,
      args?: unknown,
    ): Promise<void> {
      const commandStr = ensureString(command);
      // Ensure args is an array if provided, otherwise undefined
      const commandArgs = args === undefined || args === null
        ? undefined
        : Array.isArray(args)
        ? args
        : [args]; // Wrap single non-array arg in an array

      console.log(
        `ShareEdit: Sending command '${commandStr}' with args: ${JSON.stringify(commandArgs)}`,
      );

      const json: ExecuteCommand = {
        type: "ExecuteCommand",
        // sender: "vim", // Sender is added in broadcast
        command: commandStr,
        args: commandArgs,
      };
      wsManager.broadcast(json);
      return Promise.resolve();
    },

    async start() {
      await runWsServer(denops);
    },

    async stop() {
      await stopWsServer();
    },
  };

  return Promise.resolve();
}
