import * as vscode from "vscode";
import type { EnvironmentAdapter } from "../shared/adapters/environment";
import type { CursorPosPayload } from "../shared/vicode_pb"; // Corrected import path

/**
 * VSCode environment adapter implementation
 * Provides access to VSCode environment
 */
export class VSCodeAdapter implements EnvironmentAdapter {
  private primaryEditor: vscode.TextEditor | undefined;

  public setPrimaryEditor(editor: vscode.TextEditor | undefined): void {
    this.primaryEditor = editor;
  }

  /**
   * Get the current file path
   */
  getCurrentPath(): string {
    const editor = this.primaryEditor;
    return editor ? editor.document.uri.fsPath : "";
  }

  /**
   * Get the current cursor line (1-based)
   */
  getCurrentLine(): number {
    const editor = this.primaryEditor;
    if (!editor) {
      return 1;
    }
    return editor.selection.active.line + 1; // Convert to 1-based
  }

  /**
   * Get the current cursor column (1-based)
   */
  getCurrentCol(): number {
    const editor = this.primaryEditor;
    if (!editor) {
      return 1;
    }
    return editor.selection.active.character + 1; // Convert to 1-based
  }

  /**
   * Get the last line number of the current buffer (1-based)
   */
  getLastLine(): number {
    const editor = this.primaryEditor;
    if (!editor) {
      return 1;
    }
    return editor.document.lineCount;
  }

  /**
   * Get the length of a specific line
   */
  getSpecificLineLength(line: number): number {
    const editor = this.primaryEditor;
    if (!editor) {
      return 0;
    }

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
    const editor = this.primaryEditor;
    if (!editor) {
      return "";
    }
    return editor.document.getText();
  }

  /**
   * Check if the editor is focused
   */
  isEditorFocused(): boolean {
    if (this.primaryEditor) {
      // Check if the active editor is our primary editor AND the window is focused.
      return vscode.window.activeTextEditor === this.primaryEditor && vscode.window.state.focused;
    }
    return vscode.window.state.focused; // Fallback if no primary editor is set
  }

  /**
   * Set the cursor position
   */
  setCursorPosition(vimLine: number, vimCol: number): void {
    const editor = this.primaryEditor;
    if (editor) {
      const newPosition = new vscode.Position(vimLine - 1, vimCol - 1);
      const newSelection = new vscode.Selection(newPosition, newPosition);
      editor.selection = newSelection;
      editor.revealRange(newSelection);
    }
  }

  /**
   * Select a range of text
   */
  selectRange(
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
  ): void {
    const editor = this.primaryEditor;
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
   * Get the cursor position payload
   */
  getCursorPosPayload(): CursorPosPayload {
    const editor = this.primaryEditor;
    const filePath = editor ? editor.document.uri.fsPath : "";
    if (!editor) {
      return {
        $typeName: "vicode.CursorPosPayload", // Add $typeName property
        path: filePath,
        line: 1,
        col: 1,
      };
    }
    const position = editor.selection.active;
    return {
      $typeName: "vicode.CursorPosPayload", // Add $typeName property
      path: filePath,
      line: position.line + 1, // 1-based
      col: position.character + 1, // 1-based
    };
  }
}
