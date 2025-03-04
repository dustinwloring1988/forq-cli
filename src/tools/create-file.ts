/**
 * Create file tool
 * Creates a new file with specified content while ensuring existing files are not overwritten
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * The createFile tool creates a new file with specified content
 */
export const tool: Tool = {
  name: 'createFile',
  description:
    'Creates a new file with specified content while ensuring existing files are not overwritten',
  parameterSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'The path where the new file should be created (relative to current working directory)',
      },
      content: {
        type: 'string',
        description: 'The content to be written to the new file',
      },
    },
    required: ['filePath', 'content'],
  },
  requiresPermission: true, // File creation requires permission
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    try {
      // Resolve the file path relative to the current working directory
      const resolvedPath = path.resolve(context.cwd, parameters.filePath);

      // Get the directory path from the file path
      const dirPath = path.dirname(resolvedPath);

      // Create the directory structure if it doesn't exist
      fs.mkdirSync(dirPath, { recursive: true });

      // Check if file already exists
      if (fs.existsSync(resolvedPath)) {
        throw new Error(`File already exists: ${resolvedPath}`);
      }

      // Create the file with the 'wx' flag to ensure it doesn't overwrite existing files
      fs.writeFileSync(resolvedPath, parameters.content, { encoding: 'utf8', flag: 'wx' });

      context.logger.logAction('CreateFile Tool', {
        filePath: parameters.filePath,
        contentSizeBytes: parameters.content.length,
      });

      return {
        filePath: parameters.filePath,
        message: 'File created successfully',
        sizeBytes: parameters.content.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create file: ${errorMessage}`);
    }
  },
};
