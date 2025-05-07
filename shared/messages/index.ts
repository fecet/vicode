/**
 * Message factory functions for creating protocol messages
 * This layer abstracts the direct use of protobuf types
 */

// Import protobuf methods for message creation and serialization
import { create, toBinary, fromBinary } from "npm:@bufbuild/protobuf";

// Import message schemas from generated protobuf file
import {
  VicodeMessage,
  VicodeMessageSchema,
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
  // Create the message with payload directly in one call
  return create(VicodeMessageSchema, {
    sender,
    payload: {
      case: "cursorPos",
      value: {
        path,
        line,
        col,
      }
    }
  }) as VicodeMessage;
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
  // Create the message with payload directly in one call
  return create(VicodeMessageSchema, {
    sender,
    payload: {
      case: "selectionPos",
      value: {
        path,
        startLine,
        startCol,
        endLine,
        endCol,
      }
    }
  }) as VicodeMessage;
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
  // Create the message with payload directly in one call
  return create(VicodeMessageSchema, {
    sender,
    payload: {
      case: "executeCommand",
      value: {
        command,
        args,
        requestId,
        callbackId,
        isError,
        result,
      }
    }
  }) as VicodeMessage;
}

/**
 * Create a close buffer message
 */
export function createCloseBufferMessage(
  sender: string,
  path: string
): VicodeMessage {
  // Create the message with payload directly in one call
  return create(VicodeMessageSchema, {
    sender,
    payload: {
      case: "closeBuffer",
      value: {
        path,
      }
    }
  }) as VicodeMessage;
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
  // Create the message with payload directly in one call
  return create(VicodeMessageSchema, {
    sender,
    payload: {
      case: "textContent",
      value: {
        path,
        text,
        cursorLine,
        cursorCol,
      }
    }
  }) as VicodeMessage;
}

/**
 * Serialize a message to binary format
 */
export function serializeMessage(message: VicodeMessage): Uint8Array {
  return toBinary(VicodeMessageSchema, message);
}

/**
 * Deserialize a binary message
 */
export function deserializeMessage(binary: Uint8Array): VicodeMessage {
  return fromBinary(VicodeMessageSchema, binary) as VicodeMessage;
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

// Re-export types and schemas for convenience
export type {
  VicodeMessageSchema,
  VicodeMessage,
  CursorPosPayload,
  SelectionPosPayload,
  ExecuteCommandPayload,
  CloseBufferPayload,
  TextContentPayload
} from "../vicode_pb.ts";
