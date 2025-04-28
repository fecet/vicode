import * as vscode from "vscode";
import { WebSocket, MessageEvent } from "ws";
import {
  TextContentMessage,
  CursorPosMessage,
  SelectionPosMessage,
  ExecuteCommandMessage
} from "../../gen/vicode_pb";
import {
  setCursorPosition,
  selectRange,
  replaceFileContent,
  isFocused,
} from "../utils/editor";
import {
  lastCursorPosition,
  updateLastCursorPosition,
} from "../utils/sharedState";
import { showSessionSelector } from "./session";

// Define a type for messages with a type field for JSON serialization
type MessageWithType =
  | (TextContentMessage & { type: "TextContent" })
  | (CursorPosMessage & { type: "CursorPos" })
  | (SelectionPosMessage & { type: "SelectionPos" })
  | (ExecuteCommandMessage & { type: "ExecuteCommand" });

export class WebSocketHandler {
  private socket: WebSocket | null = null;
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Get server address from environment variable
   * @returns {string | undefined} Server address in format "host:port" or undefined if not set
   */
  private getServerAddressFromEnv(): string | undefined {
    // Check for VICODE_SERVER environment variable
    const serverAddress = process.env.VICODE_SERVER;
    if (serverAddress) {
      this.outputChannel.appendLine(`Found server address in environment VICODE_SERVER: ${serverAddress}`);
      return serverAddress;
    }

    // Also check for VICODE_ADDRESS environment variable (alternative name)
    const addressEnv = process.env.VICODE_ADDRESS;
    if (addressEnv) {
      this.outputChannel.appendLine(`Found server address in environment VICODE_ADDRESS: ${addressEnv}`);
      return addressEnv;
    }

    // For backward compatibility, check legacy environment variables
    const legacyServerAddress = process.env.SHAREEDIT_SERVER;
    if (legacyServerAddress) {
      this.outputChannel.appendLine(`Found server address in legacy environment SHAREEDIT_SERVER: ${legacyServerAddress}`);
      return legacyServerAddress;
    }

    // Also check for legacy SHAREEDIT_ADDRESS environment variable
    const legacyAddressEnv = process.env.SHAREEDIT_ADDRESS;
    if (legacyAddressEnv) {
      this.outputChannel.appendLine(`Found server address in legacy environment SHAREEDIT_ADDRESS: ${legacyAddressEnv}`);
      return legacyAddressEnv;
    }

    return undefined;
  }

  async connect(): Promise<void> {
    // First check if server address is set in environment variable
    const serverAddress = this.getServerAddressFromEnv();

    if (serverAddress) {
      // If server address is set in environment, use it directly
      if (this.socket) {
        this.disconnect();
      }

      this.outputChannel.appendLine(`Connecting to server from environment: ${serverAddress}`);
      this.socket = new WebSocket(`ws://${serverAddress}`);
      this.setupSocketListeners();
      return;
    }

    // If no server address in environment, fall back to session selector
    const selectedPort = await showSessionSelector();

    if (!selectedPort) {
      return;
    }

    if (this.socket) {
      this.disconnect();
    }

    this.socket = new WebSocket(`ws://localhost:${selectedPort}`);
    this.setupSocketListeners();
  }

  public disconnect(): void {
    this.socket?.close();
    this.socket = null;
    vscode.window.showInformationMessage(`Disconnected from WebSocket server`);
  }

  private setupSocketListeners(): void {
    if (!this.socket) {
      return;
    }

    this.socket.onopen = () => {
      this.outputChannel.appendLine("Connected to server");
      vscode.window.showInformationMessage(`Connected to WebSocket server`);
    };
    this.socket.onclose = () => {
      this.outputChannel.appendLine("Disconnected from server");
    };

    this.socket.onerror = (error) => {
      this.outputChannel.appendLine(`Error: ${error}`);
    };

    this.socket.addEventListener("message", this.handleMessage.bind(this));
  }

  private async handleMessage(ev: MessageEvent): Promise<void> {
    const message = JSON.parse(ev.data.toString()) as MessageWithType;
    this.outputChannel.appendLine(`message ${JSON.stringify(message)}`);

    const editor = vscode.window.activeTextEditor;
    // Note: ExecuteCommand might not need an active editor

    switch (message.type) {
      case "TextContent":
        if (editor) {
          await this.handleTextContent(message as TextContentMessage & { type: "TextContent" }, editor);
        }
        break;
      case "CursorPos":
        if (editor) {
          await this.handleCursorPos(message as CursorPosMessage & { type: "CursorPos" }, editor);
        }
        break;
      case "SelectionPos":
        if (editor) {
          await this.handleSelectionPos(message as SelectionPosMessage & { type: "SelectionPos" }, editor);
        }
        break;
      case "ExecuteCommand":
        await this.handleExecuteCommand(message as ExecuteCommandMessage & { type: "ExecuteCommand" });
        break;
    }
  }

  private async handleTextContent(
    message: TextContentMessage & { type: "TextContent" },
    editor: vscode.TextEditor,
  ): Promise<void> {
    if (message.path === editor.document.uri.fsPath) {
      replaceFileContent(message.text);
      setCursorPosition(message.cursorLine, message.cursorCol);
    }
  }

  private async handleCursorPos(
    message: CursorPosMessage & { type: "CursorPos" },
    editor: vscode.TextEditor,
  ): Promise<void> {
    this.outputChannel.appendLine(
      `${message.sender} ${message.path} ${message.line} ${message.col}`,
    );
    if (isFocused()) {
      return;
    }
    const document = await vscode.workspace.openTextDocument(message.path);
    await vscode.window.showTextDocument(document);

    const newCursorPos = { line: message.line, col: message.col };
    let cursorPos: { line: number; col: number } = newCursorPos;
    const currentLine = editor.selection.active.line;
    const currentCol = editor.selection.active.character;
    const lastLine = editor.document.lineCount - 1;
    const lastColOfNewLine = editor.document.lineAt(newCursorPos.line).text
      .length;

    if (lastLine < newCursorPos.line || lastColOfNewLine < newCursorPos.col) {
      cursorPos = { line: currentLine, col: currentCol };
    }

    if (
      lastCursorPosition &&
      lastCursorPosition.path === message.path &&
      lastCursorPosition.line === cursorPos.line &&
      lastCursorPosition.col === cursorPos.col
    ) {
      return;
    }

    updateLastCursorPosition(message.path, message.line, message.col); // Update last position

    setCursorPosition(message.line, message.col);
  }

  private async handleSelectionPos(
    message: SelectionPosMessage & { type: "SelectionPos" },
    editor: vscode.TextEditor,
  ): Promise<void> {
    if (message.path === editor.document.uri.fsPath) {
      selectRange(
        message.startLine - 1,
        message.startCol - 1,
        message.endLine - 1,
        message.endCol - 1,
      );
    }
  }

  // 处理 ExecuteCommand 消息的方法
  private async handleExecuteCommand(message: ExecuteCommandMessage & { type: "ExecuteCommand" }): Promise<void> {
    try {
      this.outputChannel.appendLine(
        `Executing command: ${message.command} with args: ${JSON.stringify(message.args)}`,
      );

      // 确保 args 是数组，并将其传递给 executeCommand
      const args = Array.isArray(message.args) ? message.args : [];
      await vscode.commands.executeCommand(message.command, ...args);

      this.outputChannel.appendLine(`Command ${message.command} executed successfully.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `Error executing command ${message.command}: ${errorMessage}`,
      );
      vscode.window.showErrorMessage(
        `Failed to execute command '${message.command}': ${errorMessage}`,
      );
    }
  }

  public sendMessage(message: MessageWithType): void {
    if (!this.socket) {
      return;
    }
    if (this.socket?.readyState !== WebSocket.OPEN) {
      vscode.window.showErrorMessage(
        `Not connected, status: ${this.socket?.readyState}`,
      );
      this.socket?.close();
      this.socket = null;
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  public close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
