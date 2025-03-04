/**
 * Type definitions for the Tool system
 */

import { Logger } from '../utils/logger';

/**
 * Context provided to tool executions
 */
export interface ToolContext {
  /** Working directory for relative file paths */
  cwd: string;
  /** Logger instance for recording tool actions */
  logger: Logger;
}

/**
 * Definition for tool input parameters
 */
export interface ToolParameters {
  [key: string]: any;
}

/**
 * Definition for tool function call in AI response
 */
export interface ToolCall {
  /** Name of the tool to call */
  name: string;
  /** Parameters to pass to the tool */
  parameters: ToolParameters;
}

/**
 * Structure for tool definition
 */
export interface Tool {
  /** Unique name of the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** JSON schema for the tool parameters */
  parameterSchema: Record<string, any>;
  /** Function to execute the tool with the given parameters */
  execute: (parameters: ToolParameters, context: ToolContext) => Promise<any>;
  /** Whether the tool requires special permission to run */
  requiresPermission: boolean;
}

/**
 * Result of executing a tool
 */
export interface ToolResult {
  /** Name of the tool that was executed */
  toolName: string;
  /** Whether the execution was successful */
  success: boolean;
  /** Result data from the tool execution */
  result?: any;
  /** Error message if the execution failed */
  error?: string;
}
