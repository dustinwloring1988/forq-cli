# Implementation Plan for Thinking Block Fixes

Thank you for the feedback! I'll create a detailed implementation plan that focuses on preserving the thinking capability with tool use and enhancing the REPL display with collapsible, lighter-colored thinking blocks.

## 1. Fix Message Conversion with Thinking Support

### Core Issue

The `convertToAnthropicMessages()` function in `ai.ts` doesn't properly handle thinking blocks when sending tool results back to the API.

### Implementation Steps:

1. **Update `convertToAnthropicMessages()`**:

   - Add special handling for ThinkingBlock and RedactedThinkingBlock types
   - Ensure thinking blocks from previous assistant messages are preserved
   - Maintain thinking blocks at the beginning of message content
   - Preserve signatures for thinking blocks

2. **Update `sendToolResultToAI()`**:

   - Extract thinking blocks from the last assistant message
   - Include these blocks when creating the new API request
   - Ensure the proper order: thinking blocks → tool_result blocks → text blocks

3. **Add Thinking Block Storage**:
   - Create a utility for extracting and storing thinking blocks
   - Add functions to retrieve the most recent thinking blocks
   - Ensure signatures are preserved exactly as received

## 2. Enhanced REPL Display for Thinking Blocks

### Implementation Steps:

1. **Update the `handleChunk()` function in `repl.ts`**:

   - Detect thinking blocks in the streamed content
   - Apply special formatting (lighter color) to thinking content
   - Create collapsible sections for thinking blocks

2. **Add REPL Configuration Options**:

   - Add a toggle for showing/hiding thinking blocks
   - Add settings for thinking block display format
   - Store these preferences in user configuration

3. **Implement Collapsible UI**:
   - Use terminal UI libraries to create collapsible sections
   - Default to collapsed state for thinking blocks
   - Add expand/collapse indicators
   - Use lighter text color (gray or similar) for thinking blocks

## 3. Conversation History Management

### Implementation Steps:

1. **Update `compactConversationHistory()` in `repl.ts`**:

   - Properly store thinking blocks in conversation history
   - Ensure thinking blocks are preserved when history is compacted
   - Add metadata to track which messages contain thinking blocks

2. **Update API Call Structure**:
   - Modify the core API call functions to properly include thinking blocks
   - Add a thinking management utility to handle block extraction and placement
   - Ensure thinking blocks are always positioned before other content types

## 4. Error Handling and Fallbacks

### Implementation Steps:

1. **Add Specific Error Detection**:

   - Detect thinking-related errors in API responses
   - Add recovery logic for thinking-related failures
   - Implement automatic retries with modified parameters when thinking errors occur

2. **Add Graceful Degradation**:
   - Fall back to non-thinking mode if thinking-related errors persist
   - Add user notifications when falling back
   - Preserve conversation state during fallbacks

## 5. Testing Strategy

1. **Unit Tests**:

   - Test thinking block extraction and preservation
   - Test message conversion with thinking blocks
   - Test proper ordering of content blocks

2. **Integration Tests**:
   - Test complete conversation flows with thinking and tool use
   - Test error handling and recovery
   - Test REPL display with thinking blocks

## 6. Additional Enhancements

1. **Thinking Budget Management**:

   - Add configuration for thinking token budgets
   - Implement adaptive budget based on conversation complexity
   - Add monitoring for thinking token usage

2. **User Documentation**:
   - Document the thinking feature for users
   - Add help command to explain thinking blocks
   - Add examples of effective use of thinking

## Implementation Order

I suggest implementing these changes in the following order:

1. First fix the core message conversion and thinking block handling
2. Next add the REPL display enhancements
3. Then implement improved conversation history management
4. Finally add advanced features like error handling and thinking budget management

## Specific Code Changes

For the core fix, we'll need to modify:

1. `src/api/ai.ts`:

   - Update `convertToAnthropicMessages()`
   - Update `sendToolResultToAI()`
   - Add thinking block utilities

2. `src/repl.ts`:

   - Update `handleChunk()` for display formatting
   - Modify `compactConversationHistory()`
   - Add thinking block UI controls

3. `src/types/messages.ts`:
   - No changes needed as the types are already correctly defined
