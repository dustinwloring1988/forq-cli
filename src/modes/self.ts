/**
 * Self Mode Implementation
 * Runs forq in self-hosted mode using Ollama models
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const inquirer = require('inquirer');
import chalk from 'chalk';

import { OllamaClient } from '../api/ollama';
import { OllamaEmbeddings } from '../embeddings/ollama';
import { getConfig, initializeConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { loadSystemPrompt } from '../config/systemPrompt';
import { loadTools, executeTool, getAllTools, getToolsSchema } from '../tools';
import { ToolContext } from '../types/tools';
import { Message } from '../types/messages';
import {
  initializePermissionConfig,
  savePermissionConfig,
  cleanupPermissionConfig,
} from '../config/permissions-config';
import {
  collectProjectContext,
  loadProjectInstructions,
  collectGitContext,
  getDirectoryStructureSummary,
} from '../utils/context';

// Maximum number of messages to keep in history before compacting
const MAX_CONVERSATION_LENGTH = 20;

/**
 * Initialize the Ollama client and ensure required models are available
 */
async function initializeOllamaClient(): Promise<OllamaClient> {
  try {
    logger.logAction('initializeOllamaClient', { status: 'starting' });
    const config = getConfig();
    const ollamaClient = new OllamaClient();
    
    // Check if Ollama is running
    try {
      await ollamaClient.ping();
    } catch (error) {
      logger.logError(error as Error, 'Ollama server not running');
      throw new Error(
        'Ollama server is not running. Please start Ollama first with `ollama serve` and try again.'
      );
    }
    
    // Check if the configured LLM model is available
    if (config.api?.ollama?.model) {
      const model = config.api.ollama.model;
      const isModelAvailable = await ollamaClient.isModelAvailable(model);
      
      if (!isModelAvailable) {
        logger.logAction('pullModel', { model, status: 'starting' });
        console.log(chalk.yellow(`Model ${model} not found. Attempting to pull it...`));
        try {
          await ollamaClient.pullModel(model);
          logger.logAction('pullModel', { model, status: 'completed' });
          console.log(chalk.green(`Successfully pulled model ${model}`));
        } catch (pullError) {
          logger.logError(pullError as Error, `Failed to pull model ${model}`);
          throw new Error(
            `Failed to pull model ${model}. Please check your internet connection and try again.`
          );
        }
      } else {
        logger.logAction('modelCheck', { model, status: 'available' });
        console.log(chalk.green(`Using model ${model}`));
      }
    } else {
      // If no model is configured, use a default model
      const defaultModel = 'llama2';
      logger.logAction('modelCheck', { status: 'no model configured', using: defaultModel });
      console.log(chalk.yellow(`No model configured. Using default model: ${defaultModel}`));
      config.api = config.api || {};
      config.api.ollama = config.api.ollama || {};
      config.api.ollama.model = defaultModel;
    }
    
    // Check if the configured embedding model is available
    if (config.api?.ollama?.embeddingModel) {
      const embeddingModel = config.api.ollama.embeddingModel;
      const isEmbeddingModelAvailable = await ollamaClient.isModelAvailable(embeddingModel);
      
      if (!isEmbeddingModelAvailable) {
        logger.logAction('pullModel', { model: embeddingModel, type: 'embedding', status: 'starting' });
        console.log(chalk.yellow(`Embedding model ${embeddingModel} not found. Attempting to pull it...`));
        try {
          await ollamaClient.pullModel(embeddingModel);
          logger.logAction('pullModel', { model: embeddingModel, type: 'embedding', status: 'completed' });
          console.log(chalk.green(`Successfully pulled embedding model ${embeddingModel}`));
        } catch (pullError) {
          // If embedding model fails, we can continue without it
          logger.logError(pullError as Error, `Failed to pull embedding model ${embeddingModel}`);
          console.log(chalk.yellow(
            `Warning: Failed to pull embedding model. Some features like semantic search may be limited.`
          ));
        }
      } else {
        logger.logAction('modelCheck', { model: embeddingModel, type: 'embedding', status: 'available' });
        console.log(chalk.green(`Using embedding model ${embeddingModel}`));
      }
    }
    
    logger.logAction('initializeOllamaClient', { status: 'completed' });
    return ollamaClient;
  } catch (error) {
    logger.logError(error as Error, 'Failed to initialize Ollama client');
    throw error;
  }
}

/**
 * Format messages for Ollama
 * Improves message formatting for better context and role handling
 */
function formatMessagesForOllama(messages: Message[]): string {
  // Start with a consistent format
  let formattedPrompt = '';
  
  // Process messages in order, with appropriate role prefixes
  for (const msg of messages) {
    // Skip empty messages
    if (!msg.content) {
      continue;
    }
    
    // Get the content as string
    let contentText: string;
    if (typeof msg.content === 'string') {
      contentText = msg.content;
    } else {
      // Convert content blocks to text
      contentText = msg.content.map(block => {
        if (block.type === 'text') {
          return block.text;
        } else if (block.type === 'tool_result') {
          return block.content;
        } else if (block.type === 'thinking') {
          return block.thinking;
        } else if (block.type === 'redacted_thinking') {
          return block.data;
        } else if (block.type === 'tool_use') {
          return `${block.name}: ${JSON.stringify(block.input)}`;
        }
        return '';
      }).join('\n');
    }
    
    // Skip if content is empty after processing
    if (!contentText.trim()) {
      continue;
    }
    
    // Format based on role
    switch (msg.role) {
      case 'system':
        // System messages are prefixed with clear markers
        formattedPrompt += `<system>\n${contentText.trim()}\n</system>\n\n`;
        break;
      case 'user':
        // For user messages, use a standard format
        formattedPrompt += `User: ${contentText.trim()}\n\n`;
        break;
      case 'assistant':
        // For assistant responses
        formattedPrompt += `Assistant: ${contentText.trim()}\n\n`;
        break;
      default:
        // Default case for any other role types (for future compatibility)
        // This is a safeguard as our type definition should restrict roles to system/user/assistant
        formattedPrompt += `Message: ${contentText.trim()}\n\n`;
    }
  }

  // Add a consistent assistant prefix for the response
  formattedPrompt += 'Assistant: ';
  
  return formattedPrompt;
}

/**
 * Process a user input to check for special commands
 * @param input User's input text
 * @returns Object indicating if the input was a command and the result
 */
function processSpecialCommands(
  input: string,
  conversation: Message[],
  verbose: boolean = false
): { wasCommand: boolean; result?: string } {
  const trimmedInput = input.trim();
  
  logger.logAction('processCommand', { command: trimmedInput });

  // Handle help command
  if (trimmedInput === '/help') {
    return {
      wasCommand: true,
      result: chalk.cyan(
        'Available commands:\n' +
        '  /help    - Show this help message\n' +
        '  /clear   - Clear the conversation history\n' +
        '  /exit    - Exit the session\n' +
        '  /compact - Compact conversation history to save tokens\n' +
        '  /status  - Show current Ollama status and models'
      ),
    };
  }

  // Handle clear command
  if (trimmedInput === '/clear') {
    // Keep only the system messages
    const systemMessages = conversation.filter(msg => msg.role === 'system');
    conversation.length = 0;
    conversation.push(...systemMessages);
    
    logger.logAction('clearConversation', { keptSystemMessages: systemMessages.length });
    return {
      wasCommand: true,
      result: chalk.green('Conversation history cleared (kept system messages).'),
    };
  }

  // Handle exit command
  if (trimmedInput === '/exit') {
    return {
      wasCommand: true,
      result: 'exit',
    };
  }

  // Handle compact command
  if (trimmedInput === '/compact') {
    // Simple implementation: keep only system messages and last 5 exchanges
    const systemMessages = conversation.filter(msg => msg.role === 'system');
    const recentMessages = conversation
      .filter(msg => msg.role !== 'system')
      .slice(-10); // Keep last 5 exchanges (5 user messages + 5 assistant messages)
    
    conversation.length = 0;
    conversation.push(...systemMessages, ...recentMessages);
    
    return {
      wasCommand: true,
      result: chalk.green('Conversation history compacted.'),
    };
  }

  // Handle status command
  if (trimmedInput === '/status') {
    return {
      wasCommand: true,
      result: 'status', // This will be handled separately to fetch up-to-date model info
    };
  }

  // Not a special command
  return { wasCommand: false };
}

/**
 * Parse and validate the response from Ollama
 * @param response The raw response string from Ollama
 * @returns Parsed response or error message
 */
function parseResponseForToolCalls(response: string): { 
  text: string; 
  toolCalls: Array<{ name: string; parameters: Record<string, any> }>;
  hasToolCalls: boolean;
} {
  // Initialize return object
  const result = {
    text: response,
    toolCalls: [] as Array<{ name: string; parameters: Record<string, any> }>,
    hasToolCalls: false
  };

  try {
    // Simple parsing for tool calls in the format:
    // ```json
    // { "name": "toolName", "arguments": { "arg1": "val1", ... } }
    // ```
    const toolCallRegex = /```(?:json)?\s*\{\s*"name":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]+\})\s*\}\s*```/g;
    
    let match;
    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const toolName = match[1];
        const toolArgs = JSON.parse(match[2]);
        
        result.toolCalls.push({
          name: toolName,
          parameters: toolArgs
        });
        
        result.hasToolCalls = true;
      } catch (parseError) {
        logger.logError(parseError as Error, 'Failed to parse tool call');
      }
    }

    // If tool calls found, remove them from the text
    if (result.hasToolCalls) {
      result.text = response.replace(toolCallRegex, '');
    }

    return result;
  } catch (error) {
    logger.logError(error as Error, 'Failed to parse response for tool calls');
    return result;
  }
}

/**
 * Validate the tool call parameters against the expected schema
 * @param toolName Name of the tool
 * @param args Arguments provided for the tool
 * @returns Validation result
 */
function validateToolCall(toolName: string, args: Record<string, any>): { 
  isValid: boolean; 
  error?: string;
} {
  // Get all available tools
  const tools = getAllTools();
  
  // Find the tool definition
  const tool = tools.find(t => t.name === toolName);
  if (!tool) {
    return { 
      isValid: false, 
      error: `Tool not found: ${toolName}` 
    };
  }

  // Check required parameters from the parameter schema
  if (tool.parameterSchema && tool.parameterSchema.required) {
    for (const param of tool.parameterSchema.required) {
      if (args[param] === undefined) {
        return { 
          isValid: false, 
          error: `Missing required parameter: ${param} for tool ${toolName}` 
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Manage conversation history to optimize context window usage
 */
function manageConversationHistory(
  conversation: Message[],
  maxContextLength: number = 8192,
  verbose: boolean = false
): Message[] {
  // Keep track of estimated token count for managing context window size
  // This is a simple estimation method that can be improved in the future
  const estimateTokenCount = (text: string): number => {
    // Simple heuristic: ~4 chars per token for English text
    return Math.ceil(text.length / 4);
  };

  // Reserve tokens for system messages and the response
  const systemReservedTokens = 2000; 
  
  // Get total token count and identify system messages
  let totalTokens = 0;
  const systemMessages: Message[] = [];
  const nonSystemMessages: Message[] = [];
  
  // Split messages by type and count tokens
  for (const msg of conversation) {
    let contentText = '';
    if (typeof msg.content === 'string') {
      contentText = msg.content;
    } else {
      contentText = msg.content.map(block => {
        if (block.type === 'text') return block.text;
        if (block.type === 'tool_result') return block.content;
        if (block.type === 'thinking') return block.thinking;
        if (block.type === 'redacted_thinking') return block.data;
        if (block.type === 'tool_use') return JSON.stringify(block.input);
        return '';
      }).join('\n');
    }
    
    const tokenCount = estimateTokenCount(contentText);
    totalTokens += tokenCount;
    
    if (msg.role === 'system') {
      systemMessages.push(msg);
    } else {
      // Create a metadata object that includes token count
      const metadata = { ...(msg.metadata || {}), estimatedTokens: tokenCount };
      nonSystemMessages.push({ ...msg, metadata });
    }
  }
  
  // Log the current context size if in verbose mode
  if (verbose) {
    console.log(chalk.dim(`Current context size: ~${totalTokens} tokens`));
  }
  
  // If we're within limits, return the original conversation
  if (totalTokens <= maxContextLength) {
    return conversation;
  }
  
  // We need to trim the conversation history
  if (verbose) {
    console.log(chalk.yellow(`Context window limit exceeded, compacting history...`));
  }
  
  // Always keep system messages
  const compactedConversation = [...systemMessages];
  
  // Available tokens for non-system messages
  const availableTokens = maxContextLength - systemReservedTokens;
  
  // Sort non-system messages by recency (newest first)
  const sortedMessages = [...nonSystemMessages].reverse();
  
  // Keep most recent messages up to available token limit
  let usedTokens = 0;
  for (const msg of sortedMessages) {
    const tokenCount = msg.metadata?.estimatedTokens || 0;
    if (usedTokens + tokenCount <= availableTokens) {
      compactedConversation.push(msg);
      usedTokens += tokenCount;
    } else {
      // If this is an important message (e.g., tool result), try to keep it
      if (msg.metadata?.isToolResult && usedTokens + tokenCount <= availableTokens * 1.1) {
        compactedConversation.push(msg);
        usedTokens += tokenCount;
      }
    }
  }
  
  // Re-sort messages to maintain chronological order
  compactedConversation.sort((a, b) => {
    if (a.role === 'system' && b.role !== 'system') return -1;
    if (a.role !== 'system' && b.role === 'system') return 1;
    // For non-system messages, use the order they were added
    const aIndex = conversation.indexOf(a);
    const bIndex = conversation.indexOf(b);
    return aIndex - bIndex;
  });
  
  if (verbose) {
    console.log(chalk.green(`Conversation compacted from ~${totalTokens} to ~${usedTokens + systemReservedTokens} tokens`));
  }
  
  return compactedConversation;
}

/**
 * Interface for streaming Ollama response
 */
interface StreamingOptions {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

/**
 * Stream a response from Ollama with token-by-token output
 */
async function streamOllamaResponse(
  ollamaClient: OllamaClient,
  prompt: string,
  options: StreamingOptions,
  context?: number[]
): Promise<{ response: string; context?: number[] }> {
  let retryCount = 0;
  const maxRetries = 3;
  const backoffDelay = 1000; // Start with 1 second delay

  while (retryCount < maxRetries) {
    try {
      // Access the Ollama config to build the request
      const config = getConfig();
      const ollamaConfig = config.api?.ollama || {};
      
      const baseURL = `${ollamaConfig.host || 'http://localhost'}:${ollamaConfig.port || 11434}`;
      const model = ollamaConfig.model || 'llama2';
      const temperature = ollamaConfig.temperature || 0.7;
      const maxTokens = ollamaConfig.maxTokens || 4096;
      const systemPrompt = ollamaConfig.systemPrompt || 'You are a helpful AI assistant.';
      
      // Options for the streaming request
      const requestData = {
        model,
        prompt,
        context,
        options: {
          temperature,
          num_predict: maxTokens,
        },
        stream: true,
        system: systemPrompt,
      };

      // Make the streaming request
      const response = await axios.post(`${baseURL}/api/generate`, requestData, {
        responseType: 'stream',
      });

      let fullResponse = '';
      let responseContext: number[] | undefined;
      
      // Create a promise that will resolve when the stream is done
      return new Promise((resolve, reject) => {
        // Set a timeout for the entire streaming operation
        const streamTimeout = setTimeout(() => {
          reject(new Error('Response streaming timed out'));
        }, 60000); // 60 second timeout

        // Explicitly type the data event handler
        (response.data as any).on('data', (chunk: Buffer) => {
          try {
            const lines = chunk.toString().trim().split('\n');
            
            for (const line of lines) {
              if (!line.trim()) continue;
              
              try {
                const data = JSON.parse(line);
                
                // Extract the token and context
                if (data.response) {
                  fullResponse += data.response;
                  options.onToken(data.response);
                }
                
                // If we have context, update it
                if (data.context) {
                  responseContext = data.context;
                }
                
                // Check if done
                if (data.done) {
                  options.onComplete(fullResponse);
                }
              } catch (parseError) {
                // If we can't parse as JSON, still try to show the output
                const text = line.toString().trim();
                if (text) {
                  fullResponse += text;
                  options.onToken(text);
                }
              }
            }
          } catch (streamError) {
            clearTimeout(streamTimeout);
            options.onError(streamError instanceof Error ? streamError : new Error(String(streamError)));
            reject(streamError);
          }
        });
        
        // Set up error handler
        (response.data as any).on('error', (err: Error) => {
          clearTimeout(streamTimeout);
          options.onError(err);
          reject(err);
        });
        
        // Set up end handler
        (response.data as any).on('end', () => {
          clearTimeout(streamTimeout);
          resolve({
            response: fullResponse,
            context: responseContext,
          });
        });
      });
    } catch (error) {
      retryCount++;
      
      // If we've exhausted retries, give up
      if (retryCount >= maxRetries) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
        return { response: '' };
      }
      
      // Log the retry attempt
      logger.logAction('streamRetry', { 
        attempt: retryCount, 
        maxRetries, 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, backoffDelay * Math.pow(2, retryCount - 1)));
      continue;
    }
  }
  
  // This should never be reached due to the return in the catch block
  return { response: '' };
}

/**
 * Start self mode session using Ollama
 */
export async function startSelfMode(options: {
  verbose?: boolean;
}): Promise<void> {
  try {
    logger.logAction('startSelfMode', { options });
    
    // Initialize components
    const config = await initializeConfig();
    const ollamaClient = await initializeOllamaClient();
    const tools = await loadTools();
    
    // Initialize conversation context
    const conversation: Message[] = [];
    
    // Load system prompt and project context
    const systemPrompt = await loadSystemPrompt();
    const projectContext = await collectProjectContext();
    const gitContext = await collectGitContext();
    const dirStructure = await getDirectoryStructureSummary();
    
    // Add system messages
    conversation.push(
      { role: 'system', content: systemPrompt.content },
      { role: 'system', content: `Project Context:\n${JSON.stringify(projectContext)}` },
      { role: 'system', content: `Git Context:\n${JSON.stringify(gitContext)}` },
      { role: 'system', content: `Directory Structure:\n${dirStructure}` }
    );
    
    logger.logAction('contextInitialized', {
      systemPromptLength: systemPrompt.content.toString().length,
      projectContextLength: JSON.stringify(projectContext).length,
      gitContextLength: JSON.stringify(gitContext).length,
      dirStructureLength: dirStructure ? dirStructure.length : 0
    });

    // Main interaction loop
    while (true) {
      try {
        const { input } = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: chalk.cyan('You:'),
          prefix: '',
        }]);

        // Process special commands
        const commandResult = processSpecialCommands(input, conversation, options.verbose);
        if (commandResult.wasCommand) {
          if (commandResult.result === 'exit') {
            break;
          }
          if (commandResult.result) {
            console.log(commandResult.result);
          }
          continue;
        }

        // Add user message to conversation
        conversation.push({ role: 'user', content: input });
        logger.logConversation(`User: ${input}`);

        // Format conversation for Ollama
        const prompt = formatMessagesForOllama(conversation);
        
        // Stream response from Ollama
        let fullResponse = '';
        await streamOllamaResponse(ollamaClient, prompt, {
          onToken: (token) => {
            process.stdout.write(token);
          },
          onComplete: (response) => {
            fullResponse = response;
            logger.logConversation(`Assistant: ${response}`);
          },
          onError: (error) => {
            logger.logError(error, 'Error streaming response');
            console.error(chalk.red('Error:', error.message));
          }
        });

        // Add assistant response to conversation
        conversation.push({ role: 'assistant', content: fullResponse });
        
        // Manage conversation history
        if (conversation.length > MAX_CONVERSATION_LENGTH) {
          const compactedConversation = manageConversationHistory(conversation);
          conversation.length = 0;
          conversation.push(...compactedConversation);
          logger.logAction('conversationCompacted', { 
            originalLength: conversation.length,
            newLength: compactedConversation.length 
          });
        }

      } catch (error) {
        logger.logError(error as Error, 'Error in conversation loop');
        console.error(chalk.red('Error:', (error as Error).message));
      }
    }
  } catch (error) {
    logger.logError(error as Error, 'Fatal error in self mode');
    console.error(chalk.red('Fatal error:', (error as Error).message));
    throw error;
  } finally {
    // Cleanup
    try {
      await cleanupPermissionConfig();
      logger.logAction('selfMode', { status: 'completed' });
    } catch (error) {
      logger.logError(error as Error, 'Error during cleanup');
    }
  }
} 