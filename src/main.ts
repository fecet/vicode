import * as vscode from "vscode";
import { WebSocketHandler } from "./websocket";
import debounce from "debounce";
import {
  lastCursorPosition,
  updateLastCursorPosition,
} from "./utils";
import { VSCodeAdapter } from "./vscode_adapter";
import { createCursorPosMessage, createSelectionPosMessage } from "../shared/messages";

let wsHandler: WebSocketHandler;
let outputChannel: vscode.OutputChannel;
let adapter: VSCodeAdapter; // Declare adapter variable

// Create debounced version of cursor position sender
const debouncedSendCursorPos = debounce(
  (
    document: vscode.TextDocument,
    cursorPosition: ReturnType<VSCodeAdapter["getCursorPosPayload"]>,
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

    // Create cursor position message using factory function
    const message = createCursorPosMessage(
      "vscode",
      document.uri.fsPath,
      cursorPosition.line,
      cursorPosition.col
    );
    wsHandler.sendMessage(message);
  },
  50, // Debounce time unchanged
);

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("vicode");
  adapter = new VSCodeAdapter(); // Instantiate the adapter first
  wsHandler = new WebSocketHandler(outputChannel, adapter); // Pass adapter to WebSocketHandler

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

    // Check if the event's editor is the primary editor managed by WebSocketHandler
    const primaryEditor = wsHandler.getPrimaryEditor();
    const isActive = primaryEditor === event.textEditor && adapter.isEditorFocused();

    if (!isActive) {
      return;
    }

    if (isEmpty) {
      const cursorPosition = adapter.getCursorPosPayload();
      debouncedSendCursorPos(document, cursorPosition);
    } else {
      // Create selection position message using factory function
      const message = createSelectionPosMessage(
        "vscode",
        document.uri.fsPath,
        selection.start.line,
        selection.start.character,
        selection.end.line,
        selection.end.character
      );

      wsHandler.sendMessage(message);
    }
  });

  context.subscriptions.push(connCmd, disconnCmd, legacyConnCmd, legacyDisconnCmd);

  // Check for auto-connect environment variables
  const addressEnv = process.env.VICODE_ADDRESS;

  // Automatically connect on activation if:
  // VICODE_ADDRESS environment variable is detected
  if (addressEnv) {
    outputChannel.appendLine("Auto-connecting due to VICODE_ADDRESS environment variable");
    vscode.commands.executeCommand("vicode.connect");
  }
}

export function deactivate() {
  wsHandler?.close();
}
