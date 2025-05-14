import * as vscode from "vscode";
import { WebSocket, MessageEvent } from "ws";
import {
  lastCursorPosition, // Kept for use in handleCursorPos
  updateLastCursorPosition, // Kept for use in handleCursorPos
} from "./utils";
import { VSCodeAdapter } from "./vscode_adapter"; // Added import
import {
  VicodeMessage,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload,
  createExecuteCommandMessage,
  isExecuteCommandMessage,
  isCursorPosMessage,
  isSelectionPosMessage,
  isCloseBufferMessage,
  serializeMessage,
  deserializeMessage
} from "../shared/messages";

export class WebSocketHandler {
  private socket: WebSocket | null = null;
  private outputChannel: vscode.OutputChannel;
  private connectionReady: boolean = false;
  private pendingMessages: VicodeMessage[] = [];
  private adapter: VSCodeAdapter; // Added adapter property
  private primaryTextEditor: vscode.TextEditor | undefined;
  private primaryViewColumn: vscode.ViewColumn | undefined;

  constructor(outputChannel: vscode.OutputChannel, adapter: VSCodeAdapter) {
    this.outputChannel = outputChannel;
    this.adapter = adapter; // Use the passed adapter
  }

  public getPrimaryEditor(): vscode.TextEditor | undefined {
    return this.primaryTextEditor;
  }

  /**
   * Get server address from environment variable
   * @returns {string | undefined} Server address in format "host:port" or undefined if not set
   */
  private getServerAddressFromEnv(): string | undefined {
    const serverAddress = process.env.VICODE_SERVER;
    if (serverAddress) {
      this.outputChannel.appendLine(`Found server address in environment VICODE_SERVER: ${serverAddress}`);
      return serverAddress;
    }

    const addressEnv = process.env.VICODE_ADDRESS;
    if (addressEnv) {
      this.outputChannel.appendLine(`Found server address in environment VICODE_ADDRESS: ${addressEnv}`);
      return addressEnv;
    }

    const legacyServerAddress = process.env.SHAREEDIT_SERVER;
    if (legacyServerAddress) {
      this.outputChannel.appendLine(`Found server address in legacy environment SHAREEDIT_SERVER: ${legacyServerAddress}`);
      return legacyServerAddress;
    }

    const legacyAddressEnv = process.env.SHAREEDIT_ADDRESS;
    if (legacyAddressEnv) {
      this.outputChannel.appendLine(`Found server address in legacy environment SHAREEDIT_ADDRESS: ${legacyAddressEnv}`);
      return legacyAddressEnv;
    }

    return undefined;
  }

  async connect(maxRetries = 5, retryInterval = 1000): Promise<void> {
    const serverAddress = this.getServerAddressFromEnv();

    if (!serverAddress) {
      vscode.window.showErrorMessage("No Vicode server address found in environment variables. Please set VICODE_ADDRESS.");
      return;
    }

    if (this.socket) {
      this.disconnect();
    }

    this.outputChannel.appendLine(`Connecting to server from environment: ${serverAddress}`);

    let retryCount = 0;
    const connectWithRetry = () => {
      this.outputChannel.appendLine(`Connection attempt ${retryCount + 1}/${maxRetries + 1}`);

      this.socket = new WebSocket(`ws://${serverAddress}`);

      const connectionTimeout = setTimeout(() => {
        if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
          this.outputChannel.appendLine(`Connection attempt ${retryCount + 1} timed out`);
          this.socket.close();
          retryOrFail();
        }
      }, 5000);

      this.socket.onerror = (error) => {
        clearTimeout(connectionTimeout);
        this.outputChannel.appendLine(`Connection error on attempt ${retryCount + 1}: ${error}`);
        retryOrFail();
      };

      this.socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.outputChannel.appendLine(`Connected to server on attempt ${retryCount + 1}`);
        vscode.window.showInformationMessage(`Connected to WebSocket server`);
        this.setupSocketListeners();

        this.connectionReady = true;
        this.outputChannel.appendLine("Connection marked as ready");

        if (this.pendingMessages.length > 0) {
          this.outputChannel.appendLine(`Sending ${this.pendingMessages.length} queued messages`);

          const cursorPosMessages = this.pendingMessages.filter(m => m.payload.case === "cursorPos");
          const selectionPosMessages = this.pendingMessages.filter(m => m.payload.case === "selectionPos");

          if (cursorPosMessages.length > 0) {
            const latestCursorPos = cursorPosMessages[cursorPosMessages.length - 1];
            this.outputChannel.appendLine(`Sending latest cursor position message (discarding ${cursorPosMessages.length - 1} older ones)`);
            const binaryData = serializeMessage(latestCursorPos);
            this.socket?.send(binaryData);
          }

          if (selectionPosMessages.length > 0) {
            const latestSelectionPos = selectionPosMessages[selectionPosMessages.length - 1];
            this.outputChannel.appendLine(`Sending latest selection position message (discarding ${selectionPosMessages.length - 1} older ones)`);
            const binaryData = serializeMessage(latestSelectionPos);
            this.socket?.send(binaryData);
          }

          this.pendingMessages = [];
        }
      };

      this.socket.onclose = (event) => {
        clearTimeout(connectionTimeout);

        this.connectionReady = false;

        this.outputChannel.appendLine(`Connection closed on attempt ${retryCount + 1}:`);
        this.outputChannel.appendLine(`- Close code: ${event.code}`);
        this.outputChannel.appendLine(`- Close reason: ${event.reason || "No reason provided"}`);
        this.outputChannel.appendLine(`- Was clean: ${event.wasClean ? "Yes" : "No"}`);

        if (event.code === 1000) {
          this.outputChannel.appendLine("- Diagnosis: Normal closure, connection successfully completed");
        } else if (event.code === 1001) {
          this.outputChannel.appendLine("- Diagnosis: Endpoint going away, server is shutting down");
        } else if (event.code === 1006) {
          this.outputChannel.appendLine("- Diagnosis: Abnormal closure, connection was closed abnormally");
        } else if (event.code === 1011) {
          this.outputChannel.appendLine("- Diagnosis: Server error, server encountered an unexpected condition");
        }

        if (retryCount < maxRetries && !this.isConnected() && event.code !== 1000 && event.code !== 1001) {
          this.outputChannel.appendLine("- Action: Will retry connection");
          retryOrFail();
        } else {
          this.outputChannel.appendLine("- Action: Will not retry connection");
          if (this.pendingMessages.length > 0) {
            this.outputChannel.appendLine(`- Discarding ${this.pendingMessages.length} queued messages`);
            this.pendingMessages = [];
          }
        }
      };
    };

    const retryOrFail = () => {
      if (retryCount < maxRetries) {
        retryCount++;
        this.outputChannel.appendLine(`Retrying connection in ${retryInterval}ms (${retryCount}/${maxRetries})...`);
        setTimeout(connectWithRetry, retryInterval);
      } else {
        this.outputChannel.appendLine(`Failed to connect after ${maxRetries + 1} attempts`);
        vscode.window.showErrorMessage(`Failed to connect to Vicode server after ${maxRetries + 1} attempts`);
        this.socket = null;
      }
    };

    connectWithRetry();
  }

  private isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionReady = false;
    this.pendingMessages = [];
    vscode.window.showInformationMessage(`Disconnected from WebSocket server`);
  }

  private setupSocketListeners(): void {
    if (!this.socket) {
      return;
    }

    this.socket.addEventListener("message", this.handleMessage.bind(this));

    this.outputChannel.appendLine("Socket listeners set up");
  }

  private async handleMessage(ev: MessageEvent): Promise<void> {
    try {
      const binaryData = new Uint8Array(ev.data as ArrayBuffer);
      const message = deserializeMessage(binaryData);

      this.outputChannel.appendLine(`Received message type: ${message.payload.case}`);

      if (isCursorPosMessage(message)) {
        const editor = await this.ensureEditorForPath(message.payload.value.path);
        if (editor) {
          await this.handleCursorPos(message.sender, message.payload.value, editor);
        }
      }
      else if (isSelectionPosMessage(message)) {
        const editor = await this.ensureEditorForPath(message.payload.value.path);
        if (editor) {
          await this.handleSelectionPos(message.payload.value, editor);
        }
      }
      else if (isExecuteCommandMessage(message)) {
        await this.handleExecuteCommand(message.payload.value);
      }
      else if (isCloseBufferMessage(message)) {
        await this.handleCloseBuffer(message.payload.value);
      }
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.outputChannel.appendLine(`Error processing message: ${errorStack}`);
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

    if (this.adapter.isEditorFocused()) {
      return;
    }

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

    updateLastCursorPosition(payload.path, payload.line, payload.col);

    this.adapter.setCursorPosition(payload.line, payload.col);
  }

  private async handleSelectionPos(
    payload: SelectionPosPayload,
    editor: vscode.TextEditor,
  ): Promise<void> {
    if (payload.path === editor.document.uri.fsPath) {
      this.adapter.selectRange(
        payload.startLine - 1,
        payload.startCol - 1,
        payload.endLine - 1,
        payload.endCol - 1,
      );
    }
  }

  private async handleExecuteCommand(payload: ExecuteCommandPayload): Promise<void> {
    try {
      if (payload.command === "_ping") {
        this.outputChannel.appendLine("Received ping from Neovim, sending pong response");
        if (payload.requestId) {
          this.sendCommandResponse(payload.requestId, "pong", false);
        }
        return;
      }

      if (payload.command === "eval" && Array.isArray(payload.args) && payload.args.length > 0) {
        await this.handleEvalCommand(payload);
        return;
      }

      this.outputChannel.appendLine(
        `Executing command: ${payload.command} with args: ${JSON.stringify(payload.args)} ` +
        `${payload.requestId ? `(request_id: ${payload.requestId})` : ''}` +
        `${payload.callbackId ? `(callback_id: ${payload.callbackId})` : ''}`
      );

      const args = Array.isArray(payload.args) ? payload.args : [];

      const result = await vscode.commands.executeCommand(payload.command, ...args);

      this.outputChannel.appendLine(`Command ${payload.command} executed successfully.`);

      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, result, false);
      }

      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, result, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.outputChannel.appendLine(
        `Error executing command ${payload.command}: ${errorMessage}\nStacktrace: ${errorStack}`,
      );

      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, errorMessage, true);
      }

      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, errorMessage, true);
      } else {
        vscode.window.showErrorMessage(
          `Failed to execute command '${payload.command}': ${errorMessage}`,
        );
      }
    }
  }

  private async handleEvalCommand(payload: ExecuteCommandPayload): Promise<void> {
    try {
      if (!Array.isArray(payload.args) || payload.args.length === 0) {
        throw new Error("Invalid eval command: missing code argument");
      }

      const code = payload.args[0];
      const args = payload.args.length > 1 ? payload.args[1] : undefined;

      this.outputChannel.appendLine(`Evaluating JavaScript code: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);

      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('vscode', 'args', 'logger', code);

      const result = await fn(vscode, args, this.outputChannel);

      this.outputChannel.appendLine(`JavaScript evaluation completed successfully.`);

      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, result, false);
      }

      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, result, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.outputChannel.appendLine(`Error evaluating JavaScript: ${errorMessage}\nStacktrace: ${errorStack}`);

      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, errorMessage, true);
      }

      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, errorMessage, true);
      } else {
        vscode.window.showErrorMessage(`Failed to evaluate JavaScript: ${errorMessage}`);
      }
    }
  }

  private sendCommandResponse(requestId: string, result: any, isError: boolean): void {
    const message = createExecuteCommandMessage(
      "vscode",
      "_response",
      [],
      requestId,
      "",
      isError,
      result
    );

    this.sendMessage(message);
  }

  private sendCallbackResult(callbackId: string, result: any, isError: boolean): void {
    const message = createExecuteCommandMessage(
      "vscode",
      "_callback",
      [],
      "",
      callbackId,
      isError,
      result
    );

    this.sendMessage(message);
  }

  private async handleCloseBuffer(payload: CloseBufferPayload): Promise<void> {
    try {
      this.outputChannel.appendLine(`Received request to close tab for file: ${payload.path}`);

      const editorsToClose = vscode.window.visibleTextEditors.filter(
        editor => editor.document.uri.fsPath === payload.path
      );

      if (editorsToClose.length > 0) {
        for (const editor of editorsToClose) {
          if (this.primaryTextEditor === editor) {
            this.primaryTextEditor = undefined;
            this.primaryViewColumn = undefined;
            this.adapter.setPrimaryEditor(undefined);
            this.outputChannel.appendLine(`Primary editor for ${payload.path} is being closed.`);
          }
          await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          this.outputChannel.appendLine(`Successfully closed tab for file: ${payload.path} in view column ${editor.viewColumn}`);
        }
      } else {
        this.outputChannel.appendLine(`No open tab found for file: ${payload.path}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.outputChannel.appendLine(`Error closing tab: ${errorMessage}\nStacktrace: ${errorStack}`);
      vscode.window.showErrorMessage(`Failed to close tab: ${errorMessage}`);
    }
  }

  private getSocketStateString(state: number): string {
    switch (state) {
      case WebSocket.CONNECTING:
        return "CONNECTING";
      case WebSocket.OPEN:
        return "OPEN";
      case WebSocket.CLOSING:
        return "CLOSING";
      case WebSocket.CLOSED:
        return "CLOSED";
      default:
        return `UNKNOWN (${state})`;
    }
  }

  public sendMessage(message: VicodeMessage): void {
    if (!this.connectionReady) {
      if (message.payload.case === "cursorPos" || message.payload.case === "selectionPos") {
        if (this.pendingMessages.length < 50) {
          this.pendingMessages.push(message);
          this.outputChannel.appendLine(`Message queued (connection not ready): ${message.payload.case}`);
        }
      } else {
        this.outputChannel.appendLine(`Message discarded (connection not ready): ${message.payload.case}`);
      }
      return;
    }

    if (!this.socket) {
      this.outputChannel.appendLine("Cannot send message: socket is null but connection is marked as ready");
      this.connectionReady = false;
      return;
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      this.outputChannel.appendLine(`Cannot send message: socket not in OPEN state (${this.getSocketStateString(this.socket.readyState)})`);

      if (this.socket.readyState !== WebSocket.CONNECTING) {
        this.connectionReady = false;
      }
      return;
    }

    try {
      const binaryData = serializeMessage(message);
      this.socket.send(binaryData);
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.outputChannel.appendLine(`Error sending message: ${errorStack}`);
      this.connectionReady = false;
    }
  }

  public close(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionReady = false;
    this.pendingMessages = [];
    this.primaryTextEditor = undefined;
    this.primaryViewColumn = undefined;
    this.adapter.setPrimaryEditor(undefined);
  }

  private async ensureEditorForPath(filePath: string): Promise<vscode.TextEditor | undefined> {
    if (this.primaryTextEditor && this.primaryTextEditor.document.uri.fsPath === filePath) {
      if (this.primaryViewColumn && this.primaryTextEditor.viewColumn !== this.primaryViewColumn) {
        try {
          await vscode.window.showTextDocument(this.primaryTextEditor.document, { viewColumn: this.primaryViewColumn, preserveFocus: false, preview: false });
        } catch (e) {
          this.outputChannel.appendLine(`Error trying to re-show primary editor in stored view column: ${e}`);
        }
      }
      await vscode.window.showTextDocument(this.primaryTextEditor.document, { viewColumn: this.primaryTextEditor.viewColumn, preserveFocus: false, preview: false });
      return this.primaryTextEditor;
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.fsPath === filePath) {
        this.outputChannel.appendLine(`Found existing editor for ${filePath} in view column ${editor.viewColumn}. Setting as primary.`);
        this.primaryTextEditor = editor;
        this.primaryViewColumn = editor.viewColumn;
        this.adapter.setPrimaryEditor(this.primaryTextEditor);
        await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false, preview: false });
        return this.primaryTextEditor;
      }
    }

    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const targetViewColumn = this.primaryViewColumn || vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
      this.outputChannel.appendLine(`Opening ${filePath} in view column ${targetViewColumn}.`);
      this.primaryTextEditor = await vscode.window.showTextDocument(document, {
        viewColumn: targetViewColumn,
        preserveFocus: false,
        preview: false,
      });
      this.primaryViewColumn = this.primaryTextEditor.viewColumn;
      this.adapter.setPrimaryEditor(this.primaryTextEditor);
      return this.primaryTextEditor;
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.outputChannel.appendLine(`Error opening document ${filePath}: ${errorStack}`);
      vscode.window.showErrorMessage(`Error opening file ${filePath}: ${error instanceof Error ? error.message : error}`);
      this.primaryTextEditor = undefined;
      this.primaryViewColumn = undefined;
      this.adapter.setPrimaryEditor(undefined);
      return undefined;
    }
  }
}
