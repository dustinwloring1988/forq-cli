/**
 * Read file tool
 * Reads and returns the content of a specified file securely
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * The readFile tool reads and returns the content of a specified file securely
 */
export const tool: Tool = {
  name: 'readFile',
  description: 'Reads and returns the content of a specified file securely',
  parameterSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'The path to the file that needs to be read (relative to current working directory)',
      },
    },
    required: ['filePath'],
  },
  requiresPermission: true, // File reading requires permission
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    try {
      // Resolve the file path relative to the current working directory
      const resolvedPath = path.resolve(context.cwd, parameters.filePath);

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File does not exist: ${resolvedPath}`);
      }

      // Check if path is a file
      const stats = fs.statSync(resolvedPath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${resolvedPath}`);
      }

      // Read file content
      const content = fs.readFileSync(resolvedPath, 'utf8');

      context.logger.logAction('ReadFile Tool', { filePath: parameters.filePath });

      return {
        filePath: parameters.filePath,
        content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read file: ${errorMessage}`);
    }
  },
};
