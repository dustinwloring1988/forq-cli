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
    const config = getConfig();
    const ollamaClient = new OllamaClient();
    
    // Check if the configured LLM model is available
    if (config.api?.ollama?.model) {
      const model = config.api.ollama.model;
      const isModelAvailable = await ollamaClient.isModelAvailable(model);
      
      if (!isModelAvailable) {
        console.log(chalk.yellow(`Model ${model} not found. Attempting to pull it...`));
        await ollamaClient.pullModel(model);
        console.log(chalk.green(`Successfully pulled model ${model}`));
      } else {
        console.log(chalk.green(`Using model ${model}`));
      }
    }
    
    // Check if the configured embedding model is available
    if (config.api?.ollama?.embeddingModel) {
      const embeddingModel = config.api.ollama.embeddingModel;
      const isEmbeddingModelAvailable = await ollamaClient.isModelAvailable(embeddingModel);
      
      if (!isEmbeddingModelAvailable) {
        console.log(chalk.yellow(`Embedding model ${embeddingModel} not found. Attempting to pull it...`));
        await ollamaClient.pullModel(embeddingModel);
        console.log(chalk.green(`Successfully pulled embedding model ${embeddingModel}`));
      } else {
        console.log(chalk.green(`Using embedding model ${embeddingModel}`));
      }
    }
    
    return ollamaClient;
  } catch (error) {
    logger.logError(error as Error, 'Failed to initialize Ollama client');
    throw new Error(`Failed to initialize Ollama: ${(error as Error).message}`);
  }
}

/**
 * Format messages for Ollama
 */
function formatMessagesForOllama(messages: Message[]): string {
  // Simple format that concatenates all messages with roles as prefixes
  return messages.map(msg => {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    return `${role}: ${msg.content}`;
  }).join('\n\n');
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
 * Start self mode session using Ollama
 */
export async function startSelfMode(options: {
  verbose?: boolean;
}): Promise<void> {
  console.log(chalk.blue('Initializing self-hosted mode using Ollama...'));
  const verbose = options.verbose || false;

  try {
    // Initialize configuration
    const config = initializeConfig();

    // Initialize Ollama client
    const ollamaClient = await initializeOllamaClient();
    
    // Initialize embeddings
    const embeddings = new OllamaEmbeddings();

    // Load available tools
    await loadTools();
    console.log(
      chalk.cyan('Loaded tools: ') +
        getAllTools()
          .map((t) => t.name)
          .join(', '),
    );

    // Initialize permission config
    initializePermissionConfig();

    // Set up history file
    const historyDir = path.join(os.homedir(), '.forq');
    const historyFile = path.join(historyDir, 'self_history');

    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    let history: string[] = [];
    if (fs.existsSync(historyFile)) {
      try {
        history = fs.readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
      } catch (error) {
        console.error('Error loading history:', (error as Error).message);
      }
    }

    // Create tool context based on current working directory
    const toolContext: ToolContext = {
      cwd: process.cwd(),
      logger: logger,
    };

    // Initialize conversation with system prompt
    const systemPrompt = loadSystemPrompt();
    let conversation: Message[] = [systemPrompt];

    // Add project context
    const projectInstructions = loadProjectInstructions();
    if (projectInstructions) {
      conversation.push({
        role: 'system',
        content: `Project-Specific Instructions:\n${projectInstructions}`,
      });
    }

    // Add git context
    const gitContextInfo = collectGitContext();
    if (gitContextInfo) {
      const gitContextString = JSON.stringify(gitContextInfo, null, 2);
      conversation.push({
        role: 'system',
        content: `Git Context:\n${gitContextString}`,
      });
      console.log(chalk.green('Added git context to conversation'));
    }

    // Add project structure summary
    const structureSummary = getDirectoryStructureSummary();
    if (structureSummary) {
      conversation.push({
        role: 'system',
        content: `Project Structure:\n${structureSummary}`,
      });
      console.log(chalk.green('Added project structure context to conversation'));
    }

    // Add tools schema
    const toolsSchema = getToolsSchema();
    conversation.push({
      role: 'system',
      content: `Available Tools:\n${JSON.stringify(toolsSchema, null, 2)}`,
    });
    
    // Clean up function to call when exiting
    function cleanup(): void {
      // Save history
      try {
        fs.writeFileSync(historyFile, history.join('\n'));
      } catch (error) {
        console.error('Error saving history:', (error as Error).message);
      }

      // Save permissions
      savePermissionConfig();

      // Other cleanup tasks
      cleanupPermissionConfig();
    }

    // Start the REPL
    console.log(chalk.green('Self-hosted mode started. Type your queries below.\n'));
    console.log(
      chalk.yellow('Special commands:') +
        '\n  /help    - Show available commands' +
        '\n  /clear   - Clear the conversation history' +
        '\n  /exit    - Exit the session' +
        '\n  /compact - Compact conversation history to save tokens' +
        '\n  /status  - Show current Ollama status and models\n',
    );

    // Main REPL loop
    let running = true;
    let context: number[] | undefined = undefined; // For Ollama's context window

    while (running) {
      try {
        const { input } = await inquirer.prompt([
          {
            type: 'input',
            name: 'input',
            message: chalk.cyan('You:'),
            prefix: '',
          },
        ]);

        // Process special commands
        const commandResult = processSpecialCommands(input, conversation, verbose);
        if (commandResult.wasCommand) {
          if (commandResult.result === 'exit') {
            running = false;
            console.log(chalk.green('Goodbye!'));
            break;
          } else if (commandResult.result === 'status') {
            // Show current Ollama status and models
            try {
              const models = await ollamaClient.listModels();
              console.log(chalk.cyan('Current Ollama Models:'));
              models.forEach(model => {
                console.log(`- ${model.name} (${model.details.parameter_size})`);
              });
              console.log('');
            } catch (error) {
              console.error(chalk.red(`Error fetching models: ${(error as Error).message}`));
            }
            continue;
          } else {
            console.log(commandResult.result);
            continue;
          }
        }

        // Check if input is empty or just whitespace
        if (!input.trim()) {
          continue;
        }

        // Add user input to conversation
        conversation.push({ role: 'user', content: input });
        history.push(input);

        // Format conversation for Ollama
        const prompt = formatMessagesForOllama(conversation);

        // Display thinking message
        console.log(chalk.dim('Thinking...'));
        
        // Send to Ollama
        const response = await ollamaClient.createCompletion(prompt, context);
        
        // Update context for next exchange
        context = response.context;
        
        // Add response to conversation
        conversation.push({ role: 'assistant', content: response.response });
        
        // Check for tool calls in the response
        const parsedResponse = parseResponseForToolCalls(response.response);
        
        // If there are tool calls, process them
        if (parsedResponse.hasToolCalls && parsedResponse.toolCalls.length > 0) {
          for (const toolCall of parsedResponse.toolCalls) {
            // Validate the tool call
            const validation = validateToolCall(toolCall.name, toolCall.parameters);
            
            if (!validation.isValid) {
              console.log(chalk.red(`Invalid tool call: ${validation.error}`));
              continue;
            }
            
            console.log(chalk.dim(`Executing tool: ${toolCall.name}...`));
            
            try {
              // Execute the tool using the name and parameters
              const result = await executeTool(
                {
                  name: toolCall.name,
                  parameters: toolCall.parameters
                },
                toolContext
              );
              
              // Add tool result to conversation
              conversation.push({
                role: 'system',
                content: `Tool Result (${toolCall.name}):\n${JSON.stringify(result, null, 2)}`,
              });
              
              console.log(chalk.dim(`Tool ${toolCall.name} completed.`));
            } catch (error) {
              console.error(chalk.red(`Error executing tool ${toolCall.name}: ${(error as Error).message}`));
              
              // Add error to conversation
              conversation.push({
                role: 'system',
                content: `Tool Error (${toolCall.name}):\n${(error as Error).message}`,
              });
            }
          }
          
          // After executing tools, get a follow-up response
          console.log(chalk.dim('Processing tool results...'));
          
          // Format updated conversation
          const updatedPrompt = formatMessagesForOllama(conversation);
          
          // Get follow-up response
          const followUpResponse = await ollamaClient.createCompletion(updatedPrompt, context);
          
          // Update context
          context = followUpResponse.context;
          
          // Add follow-up response
          conversation.push({ role: 'assistant', content: followUpResponse.response });
          
          // Display the follow-up response
          console.log(chalk.green('\nAssistant:'));
          console.log(followUpResponse.response);
        } else {
          // Display the initial response
          console.log(chalk.green('\nAssistant:'));
          console.log(response.response);
        }
        
        // Check if conversation needs compacting
        if (conversation.length > MAX_CONVERSATION_LENGTH) {
          const systemMessages = conversation.filter(msg => msg.role === 'system');
          const recentMessages = conversation
            .filter(msg => msg.role !== 'system')
            .slice(-MAX_CONVERSATION_LENGTH / 2);
          
          conversation = [...systemMessages, ...recentMessages];
          
          if (verbose) {
            console.log(chalk.dim('Conversation history automatically compacted.'));
          }
        }
      } catch (error) {
        logger.logError(error as Error, 'Error in self mode REPL loop');
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    }
    
    // Run cleanup before exiting
    cleanup();

  } catch (error) {
    logger.logError(error as Error, 'Error in self mode');
    console.error(chalk.red(`Error: ${(error as Error).message}`));
  }
} 