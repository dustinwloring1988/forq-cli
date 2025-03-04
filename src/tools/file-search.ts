/**
 * File Search Tool
 * Performs a fuzzy match search for filenames across directories
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * The fileSearch tool performs a fuzzy match search for filenames across directories
 */
export const tool: Tool = {
  name: 'fileSearch',
  description: 'Performs a fuzzy match search for filenames across directories',
  parameterSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'The query string to be matched against filenames using fuzzy, case-insensitive matching',
      },
      rootDir: {
        type: 'string',
        description:
          'The root directory from which the search should begin. If not specified, it defaults to the current directory',
      },
    },
    required: ['query'],
  },
  requiresPermission: false,
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    try {
      const { query } = parameters;
      const rootDir = path.resolve(context.cwd, parameters.rootDir || '.');

      // Check if root directory exists
      if (!fs.existsSync(rootDir)) {
        throw new Error(`Root directory does not exist: ${rootDir}`);
      }

      // Check if path is a directory
      const stats = fs.statSync(rootDir);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${rootDir}`);
      }

      const results: string[] = [];
      const MAX_RESULTS = 50; // Limit the number of results to prevent overwhelming output

      // Recursive function to search directories
      function searchDirectory(dir: string) {
        if (results.length >= MAX_RESULTS) return;

        try {
          const items = fs.readdirSync(dir);

          for (const item of items) {
            if (results.length >= MAX_RESULTS) break;

            const itemPath = path.join(dir, item);
            const itemStat = fs.statSync(itemPath);

            // Check if the filename matches the query
            if (item.toLowerCase().includes(query.toLowerCase())) {
              results.push(path.relative(context.cwd, itemPath));
            }

            // Recursively search subdirectories
            if (itemStat.isDirectory()) {
              searchDirectory(itemPath);
            }
          }
        } catch (err) {
          // Silently continue if a directory can't be read (e.g., permission issues)
          // This allows the search to continue in other accessible directories
        }
      }

      // Start the search from the root directory
      searchDirectory(rootDir);

      context.logger.logAction('FileSearch Tool', {
        query,
        rootDir: parameters.rootDir || '.',
        resultsCount: results.length,
      });

      return {
        query,
        rootDir: parameters.rootDir || '.',
        results,
        truncated: results.length >= MAX_RESULTS,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to search files: ${errorMessage}`);
    }
  },
};
