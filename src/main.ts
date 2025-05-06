import * as vscode from "vscode";
import { WebSocketHandler } from "./websocket";
import type { VicodeMessage } from "../shared/vicode_pb";
import { getCursorPosition, isFocused } from "./utils";
import debounce from "debounce";
import {
  lastCursorPosition,
  updateLastCursorPosition,
} from "./utils";
import { VSCodeAdapter } from "./vscode_adapter";

let wsHandler: WebSocketHandler;
let outputChannel: vscode.OutputChannel;
let adapter: VSCodeAdapter; // Declare adapter variable

// Create debounced version of cursor position sender
const debouncedSendCursorPos = debounce(
  (
    document: vscode.TextDocument,
    cursorPosition: ReturnType<typeof getCursorPosition>,
  ) => {
    // Don't send if position hasn't changed
    if (
      lastCursorPosition &&
      lastCursorPosition.path === cursorPosition.path &&
      lastCursorPosition.line === cursorPosition.line &&
      lastCursorPosition.col === cursorPosition.col
    ) {
      return;
    }

    // Update last cursor position
    updateLastCursorPosition(
      cursorPosition.path,
      cursorPosition.line,
      cursorPosition.col,
    );

    // Create message conforming to protobuf type
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
  50, // Debounce time unchanged
);

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("vicode");
  wsHandler = new WebSocketHandler(outputChannel);
  adapter = new VSCodeAdapter(); // Instantiate the adapter

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
      // Create selection position message
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
