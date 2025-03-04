/**
 * Delete file tool
 * Safely deletes a specified file from the filesystem
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * The deleteFile tool safely deletes a specified file from the filesystem
 */
export const tool: Tool = {
  name: 'deleteFile',
  description: 'Safely deletes a specified file from the filesystem',
  parameterSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'The path to the file that needs to be deleted (relative to current working directory)',
      },
    },
    required: ['filePath'],
  },
  requiresPermission: true, // File deletion requires permission
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

      // Delete the file
      fs.unlinkSync(resolvedPath);

      context.logger.logAction('DeleteFile Tool', {
        filePath: parameters.filePath,
      });

      return {
        filePath: parameters.filePath,
        message: 'File deleted successfully',
        deleted: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete file: ${errorMessage}`);
    }
  },
};
