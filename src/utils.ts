import * as vscode from "vscode";
import { generateRandomString } from "../../shared/utils"; // Import from shared
import type { CursorPosPayload } from "../gen/vicode_pb";

// Shared state
export let lastCursorPosition: CursorPosPayload | null = null;

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

/**
 * Set cursor position in VSCode editor
 * @param vimLine 1-based line number
 * @param vimCol 1-based column number
 */
export function setCursorPosition(vimLine: number, vimCol: number): void {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const newPosition = new vscode.Position(vimLine - 1, vimCol - 1);
    const newSelection = new vscode.Selection(newPosition, newPosition);
    editor.selection = newSelection;
    editor.revealRange(newSelection);
  }
}

/**
 * Select a range in VSCode editor
 * @param startLine 0-based line number
 * @param startCharacter 0-based character position
 * @param endLine 0-based line number
 * @param endCharacter 0-based character position
 */
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

/**
 * Get current cursor position
 * @returns Object with path, line (1-based), and col (1-based)
 * Note: This function is kept for backward compatibility
 * New code should use VSCodeAdapter implementation instead
 */
export function getCursorPosition(): CursorPosPayload {
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
