import * as vscode from "vscode";
import { WebSocket, MessageEvent } from "ws";
import {
  VicodeMessage,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload
} from "../../gen/vicode_pb";
import {
  setCursorPosition,
  selectRange,
  isFocused,
} from "../utils/editor";
import {
  lastCursorPosition,
  updateLastCursorPosition,
} from "../utils/sharedState";


export class WebSocketHandler {
  private socket: WebSocket | null = null;
  private outputChannel: vscode.OutputChannel;
  private connectionReady: boolean = false; // 新增连接就绪标志
  private pendingMessages: VicodeMessage[] = []; // 存储连接建立前的消息

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

    // 添加重试逻辑
    let retryCount = 0;
    const connectWithRetry = () => {
      this.outputChannel.appendLine(`Connection attempt ${retryCount + 1}/${maxRetries + 1}`);

      this.socket = new WebSocket(`ws://${serverAddress}`);

      // 设置连接超时
      const connectionTimeout = setTimeout(() => {
        if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
          this.outputChannel.appendLine(`Connection attempt ${retryCount + 1} timed out`);
          this.socket.close();
          retryOrFail();
        }
      }, 5000); // 5秒连接超时

      // 设置错误处理
      this.socket.onerror = (error) => {
        clearTimeout(connectionTimeout);
        this.outputChannel.appendLine(`Connection error on attempt ${retryCount + 1}: ${error}`);
        retryOrFail();
      };

      // 设置连接成功处理
      this.socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.outputChannel.appendLine(`Connected to server on attempt ${retryCount + 1}`);
        vscode.window.showInformationMessage(`Connected to WebSocket server`);
        this.setupSocketListeners();

        // 设置连接就绪状态
        this.connectionReady = true;
        this.outputChannel.appendLine("Connection marked as ready");

        // 发送所有待处理的消息
        if (this.pendingMessages.length > 0) {
          this.outputChannel.appendLine(`Sending ${this.pendingMessages.length} queued messages`);

          // 只发送最新的光标位置消息，避免发送过多历史位置
          const cursorPosMessages = this.pendingMessages.filter(m => m.payload.case === "cursorPos");
          const selectionPosMessages = this.pendingMessages.filter(m => m.payload.case === "selectionPos");

          // 如果有光标位置消息，只发送最后一条
          if (cursorPosMessages.length > 0) {
            const latestCursorPos = cursorPosMessages[cursorPosMessages.length - 1];
            this.outputChannel.appendLine(`Sending latest cursor position message (discarding ${cursorPosMessages.length - 1} older ones)`);
            this.socket?.send(JSON.stringify(latestCursorPos));
          }

          // 如果有选择位置消息，只发送最后一条
          if (selectionPosMessages.length > 0) {
            const latestSelectionPos = selectionPosMessages[selectionPosMessages.length - 1];
            this.outputChannel.appendLine(`Sending latest selection position message (discarding ${selectionPosMessages.length - 1} older ones)`);
            this.socket?.send(JSON.stringify(latestSelectionPos));
          }

          // 清空待处理消息队列
          this.pendingMessages = [];
        }
      };

      // 设置关闭处理
      this.socket.onclose = (event) => {
        clearTimeout(connectionTimeout);

        // 重置连接状态
        this.connectionReady = false;

        // 记录详细的关闭信息
        this.outputChannel.appendLine(`Connection closed on attempt ${retryCount + 1}:`);
        this.outputChannel.appendLine(`- Close code: ${event.code}`);
        this.outputChannel.appendLine(`- Close reason: ${event.reason || "No reason provided"}`);
        this.outputChannel.appendLine(`- Was clean: ${event.wasClean ? "Yes" : "No"}`);

        // 根据关闭代码提供诊断信息
        if (event.code === 1000) {
          this.outputChannel.appendLine("- Diagnosis: Normal closure, connection successfully completed");
        } else if (event.code === 1001) {
          this.outputChannel.appendLine("- Diagnosis: Endpoint going away, server is shutting down");
        } else if (event.code === 1006) {
          this.outputChannel.appendLine("- Diagnosis: Abnormal closure, connection was closed abnormally");
        } else if (event.code === 1011) {
          this.outputChannel.appendLine("- Diagnosis: Server error, server encountered an unexpected condition");
        }

        // 只有在初始连接阶段才重试，避免正常关闭时也重试
        // 如果是正常关闭(1000)或服务器关闭(1001)，则不重试
        if (retryCount < maxRetries && !this.isConnected() && event.code !== 1000 && event.code !== 1001) {
          this.outputChannel.appendLine("- Action: Will retry connection");
          retryOrFail();
        } else {
          this.outputChannel.appendLine("- Action: Will not retry connection");
          // 如果不再重试，清空待处理消息队列
          if (this.pendingMessages.length > 0) {
            this.outputChannel.appendLine(`- Discarding ${this.pendingMessages.length} queued messages`);
            this.pendingMessages = [];
          }
        }
      };
    };

    // 重试或失败处理
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

    // 开始第一次连接尝试
    connectWithRetry();
  }

  // 检查是否已连接
  private isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionReady = false; // 重置连接状态
    this.pendingMessages = []; // 清空待处理消息
    vscode.window.showInformationMessage(`Disconnected from WebSocket server`);
  }

  private setupSocketListeners(): void {
    if (!this.socket) {
      return;
    }

    // 只添加消息处理程序，其他事件处理程序已在connect方法中设置
    this.socket.addEventListener("message", this.handleMessage.bind(this));

    this.outputChannel.appendLine("Socket listeners set up");
  }

  private async handleMessage(ev: MessageEvent): Promise<void> {
    const message = JSON.parse(ev.data.toString()) as VicodeMessage;
    this.outputChannel.appendLine(`message ${JSON.stringify(message)}`);

    const editor = vscode.window.activeTextEditor;

    // Check which payload type is set
    if (message.payload.case === "cursorPos" && message.payload.value && editor) {
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
      // 处理ping命令
      if (payload.command === "_ping") {
        this.outputChannel.appendLine("Received ping from Neovim, sending pong response");
        // 如果有请求ID，发送响应
        if (payload.requestId) {
          this.sendCommandResponse(payload.requestId, "pong", false);
        }
        return;
      }

      // 检查是否有特殊命令
      if (payload.command === "eval" && Array.isArray(payload.args) && payload.args.length > 0) {
        await this.handleEvalCommand(payload);
        return;
      }

      this.outputChannel.appendLine(
        `Executing command: ${payload.command} with args: ${JSON.stringify(payload.args)} ` +
        `${payload.requestId ? `(request_id: ${payload.requestId})` : ''}` +
        `${payload.callbackId ? `(callback_id: ${payload.callbackId})` : ''}`
      );

      // 确保 args 是数组，并将其传递给 executeCommand
      const args = Array.isArray(payload.args) ? payload.args : [];

      // 执行命令并获取结果
      const result = await vscode.commands.executeCommand(payload.command, ...args);

      this.outputChannel.appendLine(`Command ${payload.command} executed successfully.`);

      // 如果有请求ID，发送响应
      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, result, false);
      }

      // 如果有回调ID，发送回调结果
      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, result, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `Error executing command ${payload.command}: ${errorMessage}`,
      );

      // 如果有请求ID，发送错误响应
      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, errorMessage, true);
      }

      // 如果有回调ID，发送错误回调结果
      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, errorMessage, true);
      } else {
        vscode.window.showErrorMessage(
          `Failed to execute command '${payload.command}': ${errorMessage}`,
        );
      }
    }
  }

  // 处理eval命令
  private async handleEvalCommand(payload: ExecuteCommandPayload): Promise<void> {
    try {
      if (!Array.isArray(payload.args) || payload.args.length === 0) {
        throw new Error("Invalid eval command: missing code argument");
      }

      const code = payload.args[0];
      const args = payload.args.length > 1 ? payload.args[1] : undefined;

      this.outputChannel.appendLine(`Evaluating JavaScript code: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);

      // 创建一个异步函数来执行代码
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('vscode', 'args', 'logger', code);

      // 执行代码
      const result = await fn(vscode, args, this.outputChannel);

      this.outputChannel.appendLine(`JavaScript evaluation completed successfully.`);

      // 如果有请求ID，发送响应
      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, result, false);
      }

      // 如果有回调ID，发送回调结果
      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, result, false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error evaluating JavaScript: ${errorMessage}`);

      // 如果有请求ID，发送错误响应
      if (payload.requestId) {
        this.sendCommandResponse(payload.requestId, errorMessage, true);
      }

      // 如果有回调ID，发送错误回调结果
      if (payload.callbackId) {
        this.sendCallbackResult(payload.callbackId, errorMessage, true);
      } else {
        vscode.window.showErrorMessage(`Failed to evaluate JavaScript: ${errorMessage}`);
      }
    }
  }

  // 发送命令响应
  private sendCommandResponse(requestId: string, result: any, isError: boolean): void {
    const message: VicodeMessage = {
      sender: "vscode",
      payload: {
        case: "executeCommand",
        value: {
          command: "_response",
          args: [],
          requestId: requestId,
          result: result,
          isError: isError
        }
      }
    };

    this.sendMessage(message);
  }

  // 发送回调结果
  private sendCallbackResult(callbackId: string, result: any, isError: boolean): void {
    const message: VicodeMessage = {
      sender: "vscode",
      payload: {
        case: "executeCommand",
        value: {
          command: "_callback",
          args: [],
          callbackId: callbackId,
          result: result,
          isError: isError
        }
      }
    };

    this.sendMessage(message);
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
    // 如果连接尚未就绪，将消息存储到待发送队列中
    if (!this.connectionReady) {
      // 只存储光标位置和选择位置消息，其他消息（如命令执行）直接丢弃
      if (message.payload.case === "cursorPos" || message.payload.case === "selectionPos") {
        // 限制队列大小，避免内存泄漏
        if (this.pendingMessages.length < 50) {
          this.pendingMessages.push(message);
          this.outputChannel.appendLine(`Message queued (connection not ready): ${message.payload.case}`);
        }
      } else {
        this.outputChannel.appendLine(`Message discarded (connection not ready): ${message.payload.case}`);
      }
      return;
    }

    // 连接就绪但socket不存在，这是一个异常情况
    if (!this.socket) {
      this.outputChannel.appendLine("Cannot send message: socket is null but connection is marked as ready");
      this.connectionReady = false; // 重置连接状态
      return;
    }

    // 连接就绪但socket未打开，这可能是连接断开或正在关闭
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.outputChannel.appendLine(`Cannot send message: socket not in OPEN state (${this.getSocketStateString(this.socket.readyState)})`);

      // 如果是CONNECTING状态，可能是连接正在建立中，不做特殊处理
      if (this.socket.readyState !== WebSocket.CONNECTING) {
        this.connectionReady = false; // 重置连接状态
      }
      return;
    }

    // 连接就绪且socket打开，发送消息
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      this.outputChannel.appendLine(`Error sending message: ${error}`);
      this.connectionReady = false; // 发送失败，重置连接状态
    }
  }

  public close(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionReady = false; // 重置连接状态
    this.pendingMessages = []; // 清空待处理消息
  }
}
