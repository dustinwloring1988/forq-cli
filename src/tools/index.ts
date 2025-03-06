/**
 * Tool System Core Implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolCall, ToolContext, ToolParameters, ToolResult } from '../types/tools';
import { logger } from '../utils/logger';
import {
  hasPermission,
  grantPermission,
  PermissionType,
  requestPermissionAndWait,
} from '../utils/permissions';
import { requestPermission } from '../utils/prompt';

// Store for registered tools
const tools: Map<string, Tool> = new Map();

/**
 * Register a tool with the system
 * @param tool The tool to register
 */
export function registerTool(tool: Tool): void {
  if (tools.has(tool.name)) {
    logger.logError(`Tool with name "${tool.name}" is already registered.`, 'Tool Registration');
    return;
  }
  tools.set(tool.name, tool);
  logger.logAction('Tool Registered', { name: tool.name });
}

/**
 * Get a tool by name
 * @param name The name of the tool to get
 * @returns The tool, or undefined if not found
 */
export function getTool(name: string): Tool | undefined {
  return tools.get(name);
}

/**
 * Get all registered tools
 * @returns Array of all registered tools
 */
export function getAllTools(): Tool[] {
  return Array.from(tools.values());
}

/**
 * Create a schema representation of all registered tools
 * Used to inform the AI about available tools
 */
export function getToolsSchema(): Record<string, any>[] {
  return Array.from(tools.values()).map((tool) => {
    // Get parameter descriptions to enhance tool description
    let enhancedDescription = tool.description;

    // Add usage guidance
    enhancedDescription += ` Use this tool when you need to ${tool.name.toLowerCase()} in the user's environment.`;

    // Add parameter descriptions
    if (tool.parameterSchema && tool.parameterSchema.properties) {
      enhancedDescription += ` Parameters:`;
      for (const [paramName, paramInfo] of Object.entries(tool.parameterSchema.properties || {})) {
        if (
          paramInfo &&
          typeof paramInfo === 'object' &&
          'description' in paramInfo &&
          paramInfo.description
        ) {
          const isRequired = tool.parameterSchema.required?.includes(paramName)
            ? 'required'
            : 'optional';
          enhancedDescription += ` - ${paramName} (${isRequired}): ${paramInfo.description}.`;
        }
      }
    }

    // Add permission info if applicable
    if (tool.requiresPermission) {
      enhancedDescription += ` This tool requires user permission before execution.`;
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: enhancedDescription,
        parameters: tool.parameterSchema,
      },
    };
  });
}

/**
 * Load all tools from the tools directory
 * @param toolsDir Path to the directory containing tool implementations
 */
export async function loadTools(toolsDir: string = path.join(__dirname)): Promise<void> {
  try {
    const files = fs.readdirSync(toolsDir);

    for (const file of files) {
      // Skip index.ts and non-TypeScript files
      if (
        file === 'index.ts' ||
        file === 'index.js' ||
        (!file.endsWith('.ts') && !file.endsWith('.js'))
      ) {
        continue;
      }

      try {
        // Import the tool module
        const modulePath = path.join(toolsDir, file);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const module = require(modulePath);

        // If the module exports a default tool or a tool property, register it
        if (module.default && typeof module.default === 'object') {
          registerTool(module.default);
        } else if (module.tool && typeof module.tool === 'object') {
          registerTool(module.tool);
        }
      } catch (error) {
        logger.logError(error as Error, `Failed to load tool from file: ${file}`);
      }
    }

    logger.logAction('Tools Loaded', { count: tools.size });
  } catch (error) {
    logger.logError(error as Error, 'Failed to load tools directory');
  }
}

/**
 * Determine the permission type required for a tool
 * @param toolName Name of the tool
 * @returns Permission type needed for the tool
 */
function getPermissionTypeForTool(toolName: string): PermissionType {
  switch (toolName) {
    case 'listDir':
    case 'readFile':
    case 'editFile':
    case 'deleteFile':
    case 'createFile':
    case 'fileSearch':
    case 'ripgrepSearch':
      return PermissionType.FileSystem;
    case 'bash':
      return PermissionType.ShellCommand;
    case 'semanticEmbed':
    case 'semanticSearch':
    case 'readSemanticSearchFiles':
      return PermissionType.Embedding;
    default:
      // Default to file system permission for unknown tools
      return PermissionType.FileSystem;
  }
}

/**
 * Determine the scope for a permission based on tool and parameters
 * @param toolName Name of the tool
 * @param parameters Parameters passed to the tool
 * @returns Scope string for the permission
 */
function getPermissionScope(toolName: string, parameters: ToolParameters): string | undefined {
  switch (toolName) {
    case 'listDir':
      return parameters.dirPath as string;
    case 'readFile':
    case 'editFile':
    case 'deleteFile':
      return parameters.filePath as string;
    case 'createFile':
      return parameters.filePath as string;
    case 'bash':
      // For bash commands, we could potentially analyze the command
      // and extract the directory affected, but for simplicity
      // we'll return undefined (global permission)
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Check if a tool has permission to execute with the given parameters
 * @param tool The tool to check permissions for
 * @param parameters Parameters being passed to the tool
 * @returns Whether the tool has permission
 */
async function checkToolPermission(tool: Tool, parameters: ToolParameters): Promise<boolean> {
  // If tool doesn't require permission, allow execution
  if (!tool.requiresPermission) {
    return true;
  }

  // Determine permission type and scope
  const permissionType = getPermissionTypeForTool(tool.name);
  const scope = getPermissionScope(tool.name, parameters);

  // Use the new promise-based permission system
  // This will wait for user permission if needed
  let reason: string | undefined;
  if (tool.name === 'bash') {
    reason = `Execute command: ${parameters.command}`;
  }

  // This will handle showing the prompt to the user and waiting for response
  const hasPermission = await requestPermissionAndWait(tool.name, permissionType, scope, reason);

  if (!hasPermission) {
    logger.logAction('Permission Denied', {
      tool: tool.name,
      type: permissionType,
      scope: scope || 'global',
    });
  }

  return hasPermission;
}

/**
 * Execute a tool based on AI-generated tool call
 * @param toolCall The tool call object from AI response parsing
 * @param context The context for tool execution
 * @returns The result of the tool execution
 */
export async function executeTool(toolCall: ToolCall, context: ToolContext): Promise<ToolResult> {
  const { name, parameters } = toolCall;
  const tool = tools.get(name);

  if (!tool) {
    logger.logError(`Tool "${name}" not found`, 'Tool Execution');
    return {
      toolName: name,
      success: false,
      error: `Tool "${name}" not found`,
    };
  }

  try {
    // Check permissions before executing tool
    const hasPermission = await checkToolPermission(tool, parameters);

    if (!hasPermission) {
      logger.logAction('Tool Execution Denied', {
        tool: name,
        reason: 'Permission denied by user',
      });

      return {
        toolName: name,
        success: false,
        error: 'Permission denied by user',
      };
    }

    logger.logAction('Tool Execution Started', {
      tool: name,
      parameters: JSON.stringify(parameters),
    });

    const result = await tool.execute(parameters, context);

    logger.logAction('Tool Execution Completed', {
      tool: name,
      success: true,
    });

    return {
      toolName: name,
      success: true,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.logError(error as Error, `Tool "${name}" execution failed`);
    logger.logAction('Tool Execution Failed', {
      tool: name,
      error: errorMessage,
    });

    return {
      toolName: name,
      success: false,
      error: errorMessage,
    };
  }
}
