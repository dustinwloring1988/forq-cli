/**
 * Directory listing tool
 * Lists files and directories at a given path
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * The listDir tool lists files and directories at a given path
 */
export const tool: Tool = {
  name: 'listDir',
  description: 'Lists files and directories at the given path',
  parameterSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'The path to list (relative to current working directory), defaults to current directory if not provided',
      },
    },
    // Make path optional
    required: [],
  },
  requiresPermission: false,
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    try {
      // Default to current working directory if path is not provided
      const dirPath = path.resolve(context.cwd, parameters.path || '.');

      // Check if path exists
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Path does not exist: ${dirPath}`);
      }

      // Check if path is a directory
      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }

      // Read directory contents
      const items = fs.readdirSync(dirPath);

      // Get details for each item
      const itemDetails = items.map((item) => {
        const itemPath = path.join(dirPath, item);
        const itemStats = fs.statSync(itemPath);

        return {
          name: item,
          path: path.relative(context.cwd, itemPath),
          type: itemStats.isDirectory() ? 'directory' : 'file',
          size: itemStats.size,
          created: itemStats.birthtime,
          modified: itemStats.mtime,
        };
      });

      context.logger.logAction('ListDir Tool', { path: parameters.path || '.' });

      return {
        path: parameters.path || '.',
        items: itemDetails,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list directory: ${errorMessage}`);
    }
  },
};
