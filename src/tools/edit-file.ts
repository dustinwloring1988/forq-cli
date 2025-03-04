/**
 * Edit file tool
 * Overwrites the content of an existing file with new content
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * The editFile tool overwrites the content of an existing file with new content
 */
export const tool: Tool = {
  name: 'editFile',
  description: 'Overwrites the content of an existing file with new content',
  parameterSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'The path to the file that needs to be edited (relative to current working directory)',
      },
      newContent: {
        type: 'string',
        description: 'The new content that will replace the existing file content',
      },
    },
    required: ['filePath', 'newContent'],
  },
  requiresPermission: true, // File editing requires permission
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

      // Read the existing content for potential diff checking/logging
      const oldContent = fs.readFileSync(resolvedPath, 'utf8');

      // In a more sophisticated implementation, we would show a diff here
      // and potentially ask for confirmation

      // Write new content to file
      fs.writeFileSync(resolvedPath, parameters.newContent, 'utf8');

      context.logger.logAction('EditFile Tool', {
        filePath: parameters.filePath,
        contentSizeBytes: parameters.newContent.length,
      });

      return {
        filePath: parameters.filePath,
        message: 'File updated successfully',
        previousSizeBytes: oldContent.length,
        newSizeBytes: parameters.newContent.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to edit file: ${errorMessage}`);
    }
  },
};
