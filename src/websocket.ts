import * as vscode from "vscode";
import { WebSocket, MessageEvent } from "ws";
import {
  setCursorPosition,
  selectRange,
  isFocused,
  lastCursorPosition,
  updateLastCursorPosition,
} from "./utils";
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
  isCloseBufferMessage
} from "../shared/messages";

export class WebSocketHandler {
  private socket: WebSocket | null = null;
  private outputChannel: vscode.OutputChannel;
  private connectionReady: boolean = false;
  private pendingMessages: VicodeMessage[] = [];

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

  async connect(maxRetries = 5, retryInterval = 1000): Promise<void> {
    // Check if server address is set in environment variable
    const serverAddress = this.getServerAddressFromEnv();

    if (!serverAddress) {
      vscode.window.showErrorMessage("No Vicode server address found in environment variables. Please set VICODE_ADDRESS.");
      return;
    }

    // If server address is set in environment, use it directly
    if (this.socket) {
      this.disconnect();
    }

    this.outputChannel.appendLine(`Connecting to server from environment: ${serverAddress}`);

    // Add retry logic
    let retryCount = 0;
    const connectWithRetry = () => {
      this.outputChannel.appendLine(`Connection attempt ${retryCount + 1}/${maxRetries + 1}`);

      this.socket = new WebSocket(`ws://${serverAddress}`);

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
          this.outputChannel.appendLine(`Connection attempt ${retryCount + 1} timed out`);
          this.socket.close();
          retryOrFail();
        }
      }, 5000); // 5 second connection timeout

      // Set error handler
      this.socket.onerror = (error) => {
        clearTimeout(connectionTimeout);
        this.outputChannel.appendLine(`Connection error on attempt ${retryCount + 1}: ${error}`);
        retryOrFail();
      };

      // Set connection success handler
      this.socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.outputChannel.appendLine(`Connected to server on attempt ${retryCount + 1}`);
        vscode.window.showInformationMessage(`Connected to WebSocket server`);
        this.setupSocketListeners();

        // Set connection ready state
        this.connectionReady = true;
        this.outputChannel.appendLine("Connection marked as ready");

        // Send all pending messages
        if (this.pendingMessages.length > 0) {
          this.outputChannel.appendLine(`Sending ${this.pendingMessages.length} queued messages`);

          // Only send the latest cursor position message to avoid sending too many historical positions
          const cursorPosMessages = this.pendingMessages.filter(m => m.payload.case === "cursorPos");
          const selectionPosMessages = this.pendingMessages.filter(m => m.payload.case === "selectionPos");

          // If there are cursor position messages, only send the last one
          if (cursorPosMessages.length > 0) {
            const latestCursorPos = cursorPosMessages[cursorPosMessages.length - 1];
            this.outputChannel.appendLine(`Sending latest cursor position message (discarding ${cursorPosMessages.length - 1} older ones)`);
            this.socket?.send(JSON.stringify(latestCursorPos));
          }

          // If there are selection position messages, only send the last one
          if (selectionPosMessages.length > 0) {
            const latestSelectionPos = selectionPosMessages[selectionPosMessages.length - 1];
            this.outputChannel.appendLine(`Sending latest selection position message (discarding ${selectionPosMessages.length - 1} older ones)`);
            this.socket?.send(JSON.stringify(latestSelectionPos));
          }

          // Clear pending message queue
          this.pendingMessages = [];
        }
      };

      // Set close handler
      this.socket.onclose = (event) => {
        clearTimeout(connectionTimeout);

        // Reset connection state
        this.connectionReady = false;

        // Log detailed close information
        this.outputChannel.appendLine(`Connection closed on attempt ${retryCount + 1}:`);
        this.outputChannel.appendLine(`- Close code: ${event.code}`);
        this.outputChannel.appendLine(`- Close reason: ${event.reason || "No reason provided"}`);
        this.outputChannel.appendLine(`- Was clean: ${event.wasClean ? "Yes" : "No"}`);

        // Provide diagnostic information based on close code
        if (event.code === 1000) {
          this.outputChannel.appendLine("- Diagnosis: Normal closure, connection successfully completed");
        } else if (event.code === 1001) {
          this.outputChannel.appendLine("- Diagnosis: Endpoint going away, server is shutting down");
        } else if (event.code === 1006) {
          this.outputChannel.appendLine("- Diagnosis: Abnormal closure, connection was closed abnormally");
        } else if (event.code === 1011) {
          this.outputChannel.appendLine("- Diagnosis: Server error, server encountered an unexpected condition");
        }

        // Only retry during initial connection phase, avoid retrying on normal closure
        // If it's a normal close (1000) or server shutdown (1001), don't retry
        if (retryCount < maxRetries && !this.isConnected() && event.code !== 1000 && event.code !== 1001) {
          this.outputChannel.appendLine("- Action: Will retry connection");
          retryOrFail();
        } else {
          this.outputChannel.appendLine("- Action: Will not retry connection");
          // If no more retries, clear pending message queue
          if (this.pendingMessages.length > 0) {
            this.outputChannel.appendLine(`- Discarding ${this.pendingMessages.length} queued messages`);
            this.pendingMessages = [];
          }
        }
      };
    };

    // Retry or fail handler
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

    // Start first connection attempt
    connectWithRetry();
  }

  // Check if connected
  private isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionReady = false; // Reset connection state
    this.pendingMessages = []; // Clear pending messages
    vscode.window.showInformationMessage(`Disconnected from WebSocket server`);
  }

  private setupSocketListeners(): void {
    if (!this.socket) {
      return;
    }

    // Only add message handler, other event handlers are set in connect method
    this.socket.addEventListener("message", this.handleMessage.bind(this));

    this.outputChannel.appendLine("Socket listeners set up");
  }

  private async handleMessage(ev: MessageEvent): Promise<void> {
    const message = JSON.parse(ev.data.toString()) as VicodeMessage;
    this.outputChannel.appendLine(`message ${JSON.stringify(message)}`);

    const editor = vscode.window.activeTextEditor;

    // Use type guards to check message type
    if (isCursorPosMessage(message) && editor) {
      await this.handleCursorPos(message.sender, message.payload.value, editor);
    }
    else if (isSelectionPosMessage(message) && editor) {
      await this.handleSelectionPos(message.payload.value, editor);
    }
    else if (isExecuteCommandMessage(message)) {
      await this.handleExecuteCommand(message.payload.value);
    }
    else if (isCloseBufferMessage(message)) {
      await this.handleCloseBuffer(message.payload.value);
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

  // Handle ExecuteCommand message
  private async handleExecuteCommand(payload: ExecuteCommandPayload): Promise<void> {
    try {
      // Handle ping command
      if (payload.command === "_ping") {
        this.outputChannel.appendLine("Received ping from Neovim, sending pong response");
        // If there's a request ID, send response
        if (payload.requestId) {
          this.sendCommandResponse(payload.requestId, "pong", false);
        }
        return;
      }

      // Check for special commands
      if (payload.command === "eval" && Array.isArray(payload.args) && payload.args.length > 0) {
        await this.handleEvalCommand(payload);
        return;
      }

      this.outputChannel.appendLine(
        `Executing command: ${payload.command} with args: ${JSON.stringify(payload.args)} ` +
        `${payload.requestId ? `(request_id: ${payload.requestId})` : ''}` +
        `${payload.callbackId ? `(callback_id: ${payload.callbackId})` : ''}`
      );

      // Ensure args is an array and pass it to executeCommand
      const args = Array.isArray(payload.args) ? payload.args : [];

      // Execute command and get result
      const result = await vscode.commands.executeCommand(payload.command, ...args);

      this.outputChannel.appendLine(`Command ${payload.command} executed successfully.`);

      // If there's a request ID, send response
      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, result, false);
      }

      // If there's a callback ID, send callback result
      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, result, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `Error executing command ${payload.command}: ${errorMessage}`,
      );

      // If there's a request ID, send error response
      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, errorMessage, true);
      }

      // If there's a callback ID, send error callback result
      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, errorMessage, true);
      } else {
        vscode.window.showErrorMessage(
          `Failed to execute command '${payload.command}': ${errorMessage}`,
        );
      }
    }
  }

  // Handle eval command
  private async handleEvalCommand(payload: ExecuteCommandPayload): Promise<void> {
    try {
      if (!Array.isArray(payload.args) || payload.args.length === 0) {
        throw new Error("Invalid eval command: missing code argument");
      }

      const code = payload.args[0];
      const args = payload.args.length > 1 ? payload.args[1] : undefined;

      this.outputChannel.appendLine(`Evaluating JavaScript code: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);

      // Create an async function to execute code
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('vscode', 'args', 'logger', code);

      // Execute code
      const result = await fn(vscode, args, this.outputChannel);

      this.outputChannel.appendLine(`JavaScript evaluation completed successfully.`);

      // If there's a request ID, send response
      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, result, false);
      }

      // If there's a callback ID, send callback result
      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, result, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error evaluating JavaScript: ${errorMessage}`);

      // If there's a request ID, send error response
      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, errorMessage, true);
      }

      // If there's a callback ID, send error callback result
      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, errorMessage, true);
      } else {
        vscode.window.showErrorMessage(`Failed to evaluate JavaScript: ${errorMessage}`);
      }
    }
  }

  // Send command response
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

  // Send callback result
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

  // Handle close buffer message
  private async handleCloseBuffer(payload: CloseBufferPayload): Promise<void> {
    try {
      this.outputChannel.appendLine(`Received request to close tab for file: ${payload.path}`);

      // Find documents matching the path
      const documents = vscode.workspace.textDocuments.filter(
        doc => doc.uri.fsPath === payload.path
      );

      if (documents.length > 0) {
        // Found matching document, close it
        for (const doc of documents) {
          // Use built-in command to close editor
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

  // Helper method to get socket state as string
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
    // If connection not ready, store message in pending queue
    if (!this.connectionReady) {
      // Only store cursor position and selection position messages, discard others (like command execution)
      if (message.payload.case === "cursorPos" || message.payload.case === "selectionPos") {
        // Limit queue size to avoid memory leaks
        if (this.pendingMessages.length < 50) {
          this.pendingMessages.push(message);
          this.outputChannel.appendLine(`Message queued (connection not ready): ${message.payload.case}`);
        }
      } else {
        this.outputChannel.appendLine(`Message discarded (connection not ready): ${message.payload.case}`);
      }
      return;
    }

    // Connection ready but socket doesn't exist, this is an exceptional condition
    if (!this.socket) {
      this.outputChannel.appendLine("Cannot send message: socket is null but connection is marked as ready");
      this.connectionReady = false; // Reset connection state
      return;
    }

    // Connection ready but socket not open, this could be connection dropped or closing
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.outputChannel.appendLine(`Cannot send message: socket not in OPEN state (${this.getSocketStateString(this.socket.readyState)})`);

      // If it's CONNECTING state, it might be connection establishing, don't do special handling
      if (this.socket.readyState !== WebSocket.CONNECTING) {
        this.connectionReady = false; // Reset connection state
      }
      return;
    }

    // Connection ready and socket open, send message
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      this.outputChannel.appendLine(`Error sending message: ${error}`);
      this.connectionReady = false; // Send failed, reset connection state
    }
  }

  public close(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionReady = false; // Reset connection state
    this.pendingMessages = []; // Clear pending message queue
  }
}
