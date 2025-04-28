import * as vscode from "vscode";
import { WebSocketHandler } from "./websocket/handler";
import { CursorPos, SelectionPos } from "./types/messages";
import { getCursorPosition, isFocused } from "./utils/editor";
import debounce from "debounce";
import {
  lastCursorPosition,
  updateLastCursorPosition,
} from "./utils/sharedState";

let wsHandler: WebSocketHandler;
let outputChannel: vscode.OutputChannel;

// 创建光标位置发送器的防抖版本
const debouncedSendCursorPos = debounce(
  (
    document: vscode.TextDocument,
    cursorPosition: ReturnType<typeof getCursorPosition>,
  ) => {
    // 如果位置没有变化，则不发送
    if (
      lastCursorPosition &&
      lastCursorPosition.path === cursorPosition.path &&
      lastCursorPosition.line === cursorPosition.line &&
      lastCursorPosition.col === cursorPosition.col
    ) {
      return;
    }

    // 更新最后的光标位置
    updateLastCursorPosition(
      cursorPosition.path,
      cursorPosition.line,
      cursorPosition.col,
    );

    // 创建符合 protobuf 类型的消息
    const cursorPos: CursorPos = {
      type: "CursorPos",
      sender: "vscode",
      path: document.uri.fsPath,
      line: cursorPosition.line,
      col: cursorPosition.col,
    };
    wsHandler.sendMessage(cursorPos);
  },
  50, // 防抖时间保持不变
);

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("shareedit");
  wsHandler = new WebSocketHandler(outputChannel);

  const connCmd = vscode.commands.registerCommand("shareedit.connect", () =>
    wsHandler.connect(),
  );

  const disconnCmd = vscode.commands.registerCommand(
    "shareedit.disconnect",
    () => wsHandler.disconnect(),
  );

  vscode.window.onDidChangeTextEditorSelection((event) => {
    const document = event.textEditor.document;
    const selection = event.selections[0]; // Get the primary selection
    const isEmpty = selection.isEmpty;
    const isActive =
      isFocused() && vscode.window.activeTextEditor === event.textEditor;

    if (!isActive) {
      return;
    }

    if (isEmpty) {
      const cursorPosition = getCursorPosition();
      debouncedSendCursorPos(document, cursorPosition);
    } else {
      // 创建选择位置消息
      const selectionPos: SelectionPos = {
        type: "SelectionPos",
        startCol: selection.start.character,
        startLine: selection.start.line,
        endCol: selection.end.character,
        endLine: selection.end.line,
        path: document.uri.fsPath,
      };

      wsHandler.sendMessage(selectionPos);
    }
  });

  context.subscriptions.push(connCmd, disconnCmd);

  // Check for auto-connect environment variables
  const autoConnect = process.env.SHAREEDIT_AUTOCONNECT;
  const addressEnv = process.env.SHAREEDIT_ADDRESS;

  // Automatically connect on activation if:
  // 1. SHAREEDIT_AUTOCONNECT is set to a truthy value, or
  // 2. SHAREEDIT_ADDRESS environment variable is detected
  if (
    autoConnect === "1" ||
    autoConnect === "true" ||
    autoConnect === "yes" ||
    addressEnv
  ) {
    if (addressEnv) {
      outputChannel.appendLine("Auto-connecting due to SHAREEDIT_ADDRESS environment variable");
    } else {
      outputChannel.appendLine("Auto-connecting due to SHAREEDIT_AUTOCONNECT environment variable");
    }
    vscode.commands.executeCommand("shareedit.connect");
  }
}

export function deactivate() {
  wsHandler?.close();
}
