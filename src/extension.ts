import * as vscode from "vscode";
import { WebSocketHandler } from "./websocket/handler";
import {
  VicodeMessage,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload
} from "../gen/vicode_pb";
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
    const message: VicodeMessage = {
      sender: "vscode",
      payload: {
        case: "cursorPos",
        value: {
          path: document.uri.fsPath,
          line: cursorPosition.line,
          col: cursorPosition.col,
        }
      }
    };
    wsHandler.sendMessage(message);
  },
  50, // 防抖时间保持不变
);

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("vicode");
  wsHandler = new WebSocketHandler(outputChannel);

  const connCmd = vscode.commands.registerCommand("vicode.connect", () =>
    wsHandler.connect(),
  );

  const disconnCmd = vscode.commands.registerCommand(
    "vicode.disconnect",
    () => wsHandler.disconnect(),
  );

  // For backward compatibility
  const legacyConnCmd = vscode.commands.registerCommand("shareedit.connect", () => {
    vscode.window.showWarningMessage("The shareedit.connect command is deprecated. Please use vicode.connect instead.");
    wsHandler.connect();
  });

  const legacyDisconnCmd = vscode.commands.registerCommand("shareedit.disconnect", () => {
    vscode.window.showWarningMessage("The shareedit.disconnect command is deprecated. Please use vicode.disconnect instead.");
    wsHandler.disconnect();
  });

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
      const message: VicodeMessage = {
        sender: "vscode",
        payload: {
          case: "selectionPos",
          value: {
            path: document.uri.fsPath,
            startCol: selection.start.character,
            startLine: selection.start.line,
            endCol: selection.end.character,
            endLine: selection.end.line,
          }
        }
      };

      wsHandler.sendMessage(message);
    }
  });

  context.subscriptions.push(connCmd, disconnCmd, legacyConnCmd, legacyDisconnCmd);

  // Check for auto-connect environment variables
  const autoConnect = process.env.VICODE_AUTOCONNECT || process.env.SHAREEDIT_AUTOCONNECT;
  const addressEnv = process.env.VICODE_ADDRESS || process.env.SHAREEDIT_ADDRESS;

  // Automatically connect on activation if:
  // 1. VICODE_AUTOCONNECT is set to a truthy value, or
  // 2. VICODE_ADDRESS environment variable is detected
  // 3. Legacy SHAREEDIT_* variables are also supported for backward compatibility
  if (
    autoConnect === "1" ||
    autoConnect === "true" ||
    autoConnect === "yes" ||
    addressEnv
  ) {
    if (addressEnv) {
      if (process.env.VICODE_ADDRESS) {
        outputChannel.appendLine("Auto-connecting due to VICODE_ADDRESS environment variable");
      } else {
        outputChannel.appendLine("Auto-connecting due to SHAREEDIT_ADDRESS environment variable (legacy)");
      }
    } else {
      if (process.env.VICODE_AUTOCONNECT) {
        outputChannel.appendLine("Auto-connecting due to VICODE_AUTOCONNECT environment variable");
      } else {
        outputChannel.appendLine("Auto-connecting due to SHAREEDIT_AUTOCONNECT environment variable (legacy)");
      }
    }
    vscode.commands.executeCommand("vicode.connect");
  }
}

export function deactivate() {
  wsHandler?.close();
}
