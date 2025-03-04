/**
 * Edit file tool
 * Overwrites the content of an existing file with new content
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * Generate a basic diff between old and new content
 * @param oldContent The original file content
 * @param newContent The new file content
 * @returns A string showing the differences
 */
function generateDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diff: string[] = [];

  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = i < newLines.length ? newLines[i] : null;

    if (oldLine === newLine) {
      // Line is unchanged
      diff.push(`  ${oldLine}`);
    } else {
      // Line was changed
      if (oldLine !== null) {
        diff.push(`- ${oldLine}`);
      }
      if (newLine !== null) {
        diff.push(`+ ${newLine}`);
      }
    }
  }

  return diff.join('\n');
}

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

      // Read the existing content for diff checking/logging
      const oldContent = fs.readFileSync(resolvedPath, 'utf8');

      // Generate a diff between old and new content
      const diff = generateDiff(oldContent, parameters.newContent);

      // Write new content to file
      fs.writeFileSync(resolvedPath, parameters.newContent, 'utf8');

      // Log the action with detailed information including the diff
      context.logger.logAction('EditFile Tool', {
        filePath: parameters.filePath,
        contentSizeBytes: parameters.newContent.length,
        diffSummary: `${diff.split('\n').filter((line) => line.startsWith('+')).length} additions, ${diff.split('\n').filter((line) => line.startsWith('-')).length} deletions`,
        diff: diff,
      });

      return {
        filePath: parameters.filePath,
        message: 'File updated successfully',
        previousSizeBytes: oldContent.length,
        newSizeBytes: parameters.newContent.length,
        diffSummary: `${diff.split('\n').filter((line) => line.startsWith('+')).length} additions, ${diff.split('\n').filter((line) => line.startsWith('-')).length} deletions`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to edit file: ${errorMessage}`);
    }
  },
};
