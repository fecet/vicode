import * as vscode from "vscode";
import type { EnvironmentAdapter } from "../shared/adapters/environment";

/**
 * VSCode environment adapter implementation
 * Provides access to VSCode environment
 */
export class VSCodeAdapter implements EnvironmentAdapter {
  /**
   * Get the current file path
   */
  getCurrentPath(): string {
    const editor = vscode.window.activeTextEditor;
    return editor ? editor.document.uri.fsPath : "";
  }

  /**
   * Get the current cursor line (1-based)
   */
  getCurrentLine(): number {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 1;
    return editor.selection.active.line + 1; // Convert to 1-based
  }

  /**
   * Get the current cursor column (1-based)
   */
  getCurrentCol(): number {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 1;
    return editor.selection.active.character + 1; // Convert to 1-based
  }

  /**
   * Get the last line number of the current buffer (1-based)
   */
  getLastLine(): number {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 1;
    return editor.document.lineCount;
  }

  /**
   * Get the length of a specific line
   */
  getSpecificLineLength(line: number): number {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 0;

    // Adjust for 0-based line numbers in VSCode
    const zeroBasedLine = line - 1;

    // Check if line is valid
    if (zeroBasedLine < 0 || zeroBasedLine >= editor.document.lineCount) {
      return 0;
    }

    return editor.document.lineAt(zeroBasedLine).text.length;
  }

  /**
   * Get the text content of the current buffer
   */
  getCurrentText(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return "";
    return editor.document.getText();
  }
}
