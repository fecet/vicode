export type TextContent = {
  type: "TextContent";
  sender: "vscode" | "vim";
  path: string;
  text: string;
  cursorLine: number;
  cursorCol: number;
};

export type CursorPos = {
  type: "CursorPos";
  sender: "vscode" | "vim";
  path: string;
  line: number;
  col: number;
};

export type SelectionPos = {
  type: "SelectionPos";
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  path: string;
};

// Add the new command type
export type ExecuteCommand = {
  type: "ExecuteCommand";
  command: string;
  args?: unknown[];
};

// Update the Message union type
export type Message = TextContent | CursorPos | SelectionPos | ExecuteCommand;