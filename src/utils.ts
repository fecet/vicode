import * as vscode from "vscode";
import { generateRandomString } from "../../shared/utils"; // Import from shared

// Shared state
export let lastCursorPosition: {
  path: string;
  line: number;
  col: number;
} | null = null;

export function updateLastCursorPosition(
  path: string,
  line: number,
  col: number,
): void {
  lastCursorPosition = { path, line, col };
}

// Editor utilities
export function isFocused(): boolean {
  return vscode.window.state.focused;
}

export function setCursorPosition(vimLine: number, vimCol: number): void {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const newPosition = new vscode.Position(vimLine - 1, vimCol - 1);
    const newSelection = new vscode.Selection(newPosition, newPosition);
    editor.selection = newSelection;
    editor.revealRange(newSelection);
  }
}

export function selectRange(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const startPosition = new vscode.Position(startLine, startCharacter);
  const endPosition = new vscode.Position(endLine, endCharacter);
  const selection = new vscode.Selection(startPosition, endPosition);
  editor.selection = selection;
  editor.revealRange(selection);
}

export function getCursorPosition(): {
  path: string;
  line: number;
  col: number;
} {
  const editor = vscode.window.activeTextEditor;
  const filePath = editor ? editor.document.uri.fsPath : "";
  if (!editor) {
    return {
      path: filePath,
      line: 1,
      col: 1,
    };
  }
  const position = editor.selection.active;
  return {
    path: filePath,
    line: position.line + 1,
    col: position.character + 1,
  };
}
