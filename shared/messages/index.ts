/**
 * Message factory functions for creating protocol messages
 * This layer abstracts the direct use of protobuf types
 */

// For Deno environment, we'll use a simple implementation
// that just returns the plain objects without protobuf serialization
function createPlainObject(_schema: any, data: any): any {
  return data;
}

// In Deno, we need to use .ts extension
import type {
  VicodeMessage,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload,
  TextContentPayload
} from "../vicode_pb.ts";

/**
 * Create a cursor position message
 */
export function createCursorPosMessage(
  sender: string,
  path: string,
  line: number,
  col: number
): VicodeMessage {
  return createPlainObject(null, {
    sender,
    payload: {
      case: "cursorPos",
      value: createPlainObject(null, {
        path,
        line,
        col,
      })
    }
  });
}

/**
 * Create a selection position message
 */
export function createSelectionPosMessage(
  sender: string,
  path: string,
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number
): VicodeMessage {
  return createPlainObject(null, {
    sender,
    payload: {
      case: "selectionPos",
      value: createPlainObject(null, {
        path,
        startLine,
        startCol,
        endLine,
        endCol,
      })
    }
  });
}

/**
 * Create a command execution message
 */
export function createExecuteCommandMessage(
  sender: string,
  command: string,
  args: string[] = [],
  requestId: string = "",
  callbackId: string = "",
  isError: boolean = false,
  result: string = ""
): VicodeMessage {
  return createPlainObject(null, {
    sender,
    payload: {
      case: "executeCommand",
      value: createPlainObject(null, {
        command,
        args,
        requestId,
        callbackId,
        isError,
        result,
      })
    }
  });
}

/**
 * Create a close buffer message
 */
export function createCloseBufferMessage(
  sender: string,
  path: string
): VicodeMessage {
  return createPlainObject(null, {
    sender,
    payload: {
      case: "closeBuffer",
      value: createPlainObject(null, {
        path,
      })
    }
  });
}

/**
 * Create a text content message
 */
export function createTextContentMessage(
  sender: string,
  path: string,
  text: string,
  cursorLine: number,
  cursorCol: number
): VicodeMessage {
  return createPlainObject(null, {
    sender,
    payload: {
      case: "textContent",
      value: createPlainObject(null, {
        path,
        text,
        cursorLine,
        cursorCol,
      })
    }
  });
}

/**
 * Type guard for checking if a message is a cursor position message
 */
export function isCursorPosMessage(message: VicodeMessage): message is VicodeMessage & {
  payload: { case: "cursorPos"; value: CursorPosPayload }
} {
  return message.payload.case === "cursorPos";
}

/**
 * Type guard for checking if a message is a selection position message
 */
export function isSelectionPosMessage(message: VicodeMessage): message is VicodeMessage & {
  payload: { case: "selectionPos"; value: SelectionPosPayload }
} {
  return message.payload.case === "selectionPos";
}

/**
 * Type guard for checking if a message is a command execution message
 */
export function isExecuteCommandMessage(message: VicodeMessage): message is VicodeMessage & {
  payload: { case: "executeCommand"; value: ExecuteCommandPayload }
} {
  return message.payload.case === "executeCommand";
}

/**
 * Type guard for checking if a message is a close buffer message
 */
export function isCloseBufferMessage(message: VicodeMessage): message is VicodeMessage & {
  payload: { case: "closeBuffer"; value: CloseBufferPayload }
} {
  return message.payload.case === "closeBuffer";
}

/**
 * Type guard for checking if a message is a text content message
 */
export function isTextContentMessage(message: VicodeMessage): message is VicodeMessage & {
  payload: { case: "textContent"; value: TextContentPayload }
} {
  return message.payload.case === "textContent";
}

// Re-export types for convenience
export type {
  VicodeMessage,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload,
  TextContentPayload
} from "../vicode_pb.ts";
