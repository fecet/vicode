import * as vscode from "vscode";
import { WebSocket, MessageEvent } from "ws";
import {
  VicodeMessage,
  TextContentPayload,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload
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
    const message = JSON.parse(ev.data.toString()) as VicodeMessage;
    this.outputChannel.appendLine(`message ${JSON.stringify(message)}`);

    const editor = vscode.window.activeTextEditor;

    // Check which payload type is set
    if (message.payload.case === "textContent" && message.payload.value && editor) {
      await this.handleTextContent(message.payload.value, editor);
    }
    else if (message.payload.case === "cursorPos" && message.payload.value && editor) {
      await this.handleCursorPos(message.sender, message.payload.value, editor);
    }
    else if (message.payload.case === "selectionPos" && message.payload.value && editor) {
      await this.handleSelectionPos(message.payload.value, editor);
    }
    else if (message.payload.case === "executeCommand" && message.payload.value) {
      await this.handleExecuteCommand(message.payload.value);
    }
    else if (message.payload.case === "closeBuffer" && message.payload.value) {
      await this.handleCloseBuffer(message.payload.value);
    }
  }

  private async handleTextContent(
    payload: TextContentPayload,
    editor: vscode.TextEditor,
  ): Promise<void> {
    if (payload.path === editor.document.uri.fsPath) {
      replaceFileContent(payload.text);
      setCursorPosition(payload.cursorLine, payload.cursorCol);
    }
  }

  private async handleCursorPos(
    sender: string,
    payload: CursorPosPayload,
    editor: vscode.TextEditor,
  ): Promise<void> {
    this.outputChannel.appendLine(
      `${sender} ${payload.path} ${payload.line} ${payload.col}`,
    );
    if (isFocused()) {
      return;
    }
    const document = await vscode.workspace.openTextDocument(payload.path);
    await vscode.window.showTextDocument(document);

    const newCursorPos = { line: payload.line, col: payload.col };
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
      lastCursorPosition.path === payload.path &&
      lastCursorPosition.line === cursorPos.line &&
      lastCursorPosition.col === cursorPos.col
    ) {
      return;
    }

    updateLastCursorPosition(payload.path, payload.line, payload.col); // Update last position

    setCursorPosition(payload.line, payload.col);
  }

  private async handleSelectionPos(
    payload: SelectionPosPayload,
    editor: vscode.TextEditor,
  ): Promise<void> {
    if (payload.path === editor.document.uri.fsPath) {
      selectRange(
        payload.startLine - 1,
        payload.startCol - 1,
        payload.endLine - 1,
        payload.endCol - 1,
      );
    }
  }

  // 处理 ExecuteCommand 消息的方法
  private async handleExecuteCommand(payload: ExecuteCommandPayload): Promise<void> {
    try {
      this.outputChannel.appendLine(
        `Executing command: ${payload.command} with args: ${JSON.stringify(payload.args)}`,
      );

      // 确保 args 是数组，并将其传递给 executeCommand
      const args = Array.isArray(payload.args) ? payload.args : [];
      await vscode.commands.executeCommand(payload.command, ...args);

      this.outputChannel.appendLine(`Command ${payload.command} executed successfully.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `Error executing command ${payload.command}: ${errorMessage}`,
      );
      vscode.window.showErrorMessage(
        `Failed to execute command '${payload.command}': ${errorMessage}`,
      );
    }
  }

  // 处理关闭buffer消息的方法
  private async handleCloseBuffer(payload: CloseBufferPayload): Promise<void> {
    try {
      this.outputChannel.appendLine(`Received request to close tab for file: ${payload.path}`);

      // 查找匹配路径的文档
      const documents = vscode.workspace.textDocuments.filter(
        doc => doc.uri.fsPath === payload.path
      );

      if (documents.length > 0) {
        // 找到匹配的文档，关闭它
        for (const doc of documents) {
          // 使用内置命令关闭编辑器
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          this.outputChannel.appendLine(`Successfully closed tab for file: ${payload.path}`);
        }
      } else {
        this.outputChannel.appendLine(`No open tab found for file: ${payload.path}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error closing tab: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to close tab: ${errorMessage}`);
    }
  }

  public sendMessage(message: VicodeMessage): void {
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
