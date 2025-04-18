import * as vscode from "vscode";
import { WebSocket, MessageEvent } from "ws";
import {
  Message,
  TextContent,
  CursorPos,
  SelectionPos,
  ExecuteCommand, // Import the new type
} from "../types/messages";
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

export class WebSocketHandler {
  private socket: WebSocket | null = null;
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async connect(): Promise<void> {
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
    const message = JSON.parse(ev.data.toString()) as Message;
    this.outputChannel.appendLine(`message ${JSON.stringify(message)}`);

    const editor = vscode.window.activeTextEditor;
    // Note: ExecuteCommand might not need an active editor
    // if (!editor && message.type !== "ExecuteCommand") {
    //   return;
    // }

    switch (message.type) {
      case "TextContent":
        if (editor) {
          await this.handleTextContent(message, editor);
        }
        break;
      case "CursorPos":
        if (editor) {
          await this.handleCursorPos(message, editor);
        }
        break;
      case "SelectionPos":
        if (editor) {
          await this.handleSelectionPos(message, editor);
        }
        break;
      case "ExecuteCommand": // Add case for the new type
        await this.handleExecuteCommand(message);
        break;
    }
  }

  private async handleTextContent(
    message: TextContent,
    editor: vscode.TextEditor,
  ): Promise<void> {
    if (message.path === editor.document.uri.fsPath) {
      replaceFileContent(message.text);
      setCursorPosition(message.cursorLine, message.cursorCol);
    }
  }

  private async handleCursorPos(
    message: CursorPos,
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
    message: SelectionPos,
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

  // Add a new handler method for ExecuteCommand
  private async handleExecuteCommand(message: ExecuteCommand): Promise<void> {
    try {
      this.outputChannel.appendLine(
        `Executing command: ${message.command} with args: ${JSON.stringify(message.args)}`,
      );
      await vscode.commands.executeCommand(message.command, ...(message.args || []));
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

  public sendMessage(message: Message): void {
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
