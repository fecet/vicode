// 导入 protobuf 生成的类型
// 注意：我们仍然使用 shareedit_pb 因为 gen 文件夹不需要修改
import type {
  TextContentMessage,
  CursorPosMessage,
  SelectionPosMessage,
  ExecuteCommandMessage,
} from "../../gen/shareedit_pb";

// 定义适配层类型，使用接口而不是交叉类型
export interface TextContent {
  type: "TextContent";
  sender: string;
  path: string;
  text: string;
  cursorLine: number;
  cursorCol: number;
}

export interface CursorPos {
  type: "CursorPos";
  sender: string;
  path: string;
  line: number;
  col: number;
}

export interface SelectionPos {
  type: "SelectionPos";
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  path: string;
}

export interface ExecuteCommand {
  type: "ExecuteCommand";
  command: string;
  args?: string[] | unknown[];
}

// 更新 Message 联合类型
export type Message = TextContent | CursorPos | SelectionPos | ExecuteCommand;

// 转换函数，用于将 protobuf 类型转换为我们的消息类型
export function toTextContent(msg: TextContentMessage, sender: string): TextContent {
  return {
    type: "TextContent",
    sender,
    path: msg.path,
    text: msg.text,
    cursorLine: msg.cursorLine,
    cursorCol: msg.cursorCol
  };
}

export function toCursorPos(msg: CursorPosMessage, sender: string): CursorPos {
  return {
    type: "CursorPos",
    sender,
    path: msg.path,
    line: msg.line,
    col: msg.col
  };
}

export function toSelectionPos(msg: SelectionPosMessage): SelectionPos {
  return {
    type: "SelectionPos",
    startLine: msg.startLine,
    startCol: msg.startCol,
    endLine: msg.endLine,
    endCol: msg.endCol,
    path: msg.path
  };
}

export function toExecuteCommand(msg: ExecuteCommandMessage): ExecuteCommand {
  return {
    type: "ExecuteCommand",
    command: msg.command,
    args: msg.args
  };
}
