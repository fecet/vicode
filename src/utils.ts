import * as vscode from "vscode";
import type { CursorPosPayload } from "../shared/vicode_pb"; // Corrected import path

// Shared state
export let lastCursorPosition: CursorPosPayload | null = null;

export function updateLastCursorPosition(
  path: string,
  line: number,
  col: number,
): void {
  lastCursorPosition = {
    $typeName: "vicode.CursorPosPayload", // Add $typeName property
    path,
    line,
    col
  };
}
