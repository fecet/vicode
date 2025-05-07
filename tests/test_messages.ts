#!/usr/bin/env deno run --allow-read --allow-net

/**
 * Test script for verifying message creation functionality
 * 
 * Usage:
 *   deno run --allow-read --allow-net test_messages.ts
 */

// Import message creation functions from shared
import {
  createCursorPosMessage,
  createSelectionPosMessage,
  createExecuteCommandMessage,
  createCloseBufferMessage,
  createTextContentMessage,
  serializeMessage,
  deserializeMessage,
  isTextContentMessage,
  isCursorPosMessage
} from "./shared/messages/index.ts";

// Import types for type checking
import type { VicodeMessage } from "./shared/vicode_pb.ts";

// Colors for console output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BLUE = "\x1b[34m";

/**
 * Test helper function
 */
function testCase(name: string, testFn: () => boolean | Promise<boolean>): Promise<void> {
  console.log(`${BLUE}Testing: ${name}${RESET}`);
  
  return Promise.resolve()
    .then(() => testFn())
    .then((result) => {
      if (result) {
        console.log(`${GREEN}✓ PASS: ${name}${RESET}`);
      } else {
        console.log(`${RED}✗ FAIL: ${name}${RESET}`);
      }
    })
    .catch((error) => {
      console.log(`${RED}✗ ERROR: ${name}${RESET}`);
      console.error(`  ${error.message}`);
      if (error.stack) {
        console.error(`  ${error.stack.split("\n").slice(1).join("\n  ")}`);
      }
    });
}

/**
 * Main test function
 */
async function runTests() {
  console.log("Starting message creation tests...\n");

  // Test 1: Create cursor position message
  await testCase("Create cursor position message", () => {
    try {
      const message = createCursorPosMessage(
        "test-sender",
        "/path/to/file.ts",
        10,
        5
      );
      
      console.log("  Created message:", JSON.stringify(message, null, 2));
      
      return (
        message.sender === "test-sender" &&
        message.payload.case === "cursorPos" &&
        message.payload.value.path === "/path/to/file.ts" &&
        message.payload.value.line === 10 &&
        message.payload.value.col === 5
      );
    } catch (error) {
      console.error("  Error creating cursor position message:", error);
      return false;
    }
  });

  // Test 2: Create selection position message
  await testCase("Create selection position message", () => {
    try {
      const message = createSelectionPosMessage(
        "test-sender",
        "/path/to/file.ts",
        10,
        5,
        12,
        20
      );
      
      console.log("  Created message:", JSON.stringify(message, null, 2));
      
      return (
        message.sender === "test-sender" &&
        message.payload.case === "selectionPos" &&
        message.payload.value.path === "/path/to/file.ts" &&
        message.payload.value.startLine === 10 &&
        message.payload.value.startCol === 5 &&
        message.payload.value.endLine === 12 &&
        message.payload.value.endCol === 20
      );
    } catch (error) {
      console.error("  Error creating selection position message:", error);
      return false;
    }
  });

  // Test 3: Create execute command message
  await testCase("Create execute command message", () => {
    try {
      const message = createExecuteCommandMessage(
        "test-sender",
        "test-command",
        ["arg1", "arg2"],
        "req-123",
        "callback-456",
        false,
        "result-data"
      );
      
      console.log("  Created message:", JSON.stringify(message, null, 2));
      
      return (
        message.sender === "test-sender" &&
        message.payload.case === "executeCommand" &&
        message.payload.value.command === "test-command" &&
        message.payload.value.args.length === 2 &&
        message.payload.value.args[0] === "arg1" &&
        message.payload.value.requestId === "req-123" &&
        message.payload.value.callbackId === "callback-456" &&
        message.payload.value.isError === false &&
        message.payload.value.result === "result-data"
      );
    } catch (error) {
      console.error("  Error creating execute command message:", error);
      return false;
    }
  });

  // Test 4: Serialize and deserialize message
  await testCase("Serialize and deserialize message", () => {
    try {
      const originalMessage = createTextContentMessage(
        "test-sender",
        "/path/to/file.ts",
        "console.log('Hello, world!');",
        1,
        0
      );
      
      // Serialize to binary
      const binary = serializeMessage(originalMessage);
      console.log(`  Serialized to ${binary.byteLength} bytes`);
      
      // Deserialize back to message
      const deserializedMessage = deserializeMessage(binary);
      console.log("  Deserialized message:", JSON.stringify(deserializedMessage, null, 2));
      
      // Check if deserialized correctly
      return (
        deserializedMessage.sender === originalMessage.sender &&
        isTextContentMessage(deserializedMessage) &&
        deserializedMessage.payload.value.path === "/path/to/file.ts" &&
        deserializedMessage.payload.value.text === "console.log('Hello, world!');" &&
        deserializedMessage.payload.value.cursorLine === 1 &&
        deserializedMessage.payload.value.cursorCol === 0
      );
    } catch (error) {
      console.error("  Error in serialization test:", error);
      return false;
    }
  });

  // Test 5: Type guards
  await testCase("Message type guards", () => {
    try {
      const cursorMessage = createCursorPosMessage(
        "test-sender",
        "/path/to/file.ts",
        10,
        5
      );
      
      const textMessage = createTextContentMessage(
        "test-sender",
        "/path/to/file.ts",
        "console.log('Hello, world!');",
        1,
        0
      );
      
      const cursorGuardResult = isCursorPosMessage(cursorMessage);
      const textGuardResult = isTextContentMessage(textMessage);
      const wrongGuardResult = isTextContentMessage(cursorMessage);
      
      console.log(`  isCursorPosMessage on cursor message: ${cursorGuardResult}`);
      console.log(`  isTextContentMessage on text message: ${textGuardResult}`);
      console.log(`  isTextContentMessage on cursor message: ${wrongGuardResult}`);
      
      return (
        cursorGuardResult === true &&
        textGuardResult === true &&
        wrongGuardResult === false
      );
    } catch (error) {
      console.error("  Error in type guard test:", error);
      return false;
    }
  });

  console.log("\nAll tests completed.");
}

// Run the tests
runTests();