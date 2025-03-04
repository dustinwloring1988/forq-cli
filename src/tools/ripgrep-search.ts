/**
 * Ripgrep Search Tool
 * Performs regex content search using ripgrep command
 */

import { execSync } from 'child_process';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * The ripgrepSearch tool performs regex content search using ripgrep
 */
export const tool: Tool = {
  name: 'ripgrepSearch',
  description: 'Performs a regex-based content search using ripgrep',
  parameterSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regular expression pattern to search for within file contents',
      },
      rootDir: {
        type: 'string',
        description:
          'The directory in which to perform the search. Defaults to current directory if not specified',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return. Defaults to 50 if not specified',
      },
    },
    required: ['pattern'],
  },
  requiresPermission: false,
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    try {
      const { pattern } = parameters;
      const rootDir = path.resolve(context.cwd, parameters.rootDir || '.');
      const maxResults = parameters.maxResults || 50;

      // Sanitize the pattern to avoid shell injection
      // This is a simple sanitization and should be enhanced in production
      const sanitizedPattern = pattern.replace(/"/g, '\\"');

      // Construct the ripgrep command
      // -n: show line numbers
      // -H: show file names
      // -I: ignore binary files
      // --max-count: limit results per file
      // --max-count-matcher: count based on matches (not lines)
      // -m: max count for pattern
      const command = `rg -n -H -I --max-count=${maxResults} "${sanitizedPattern}" ${rootDir}`;

      try {
        // Execute the ripgrep command
        const output = execSync(command, {
          encoding: 'utf8',
          maxBuffer: 1024 * 1024, // 1MB buffer
          timeout: 15000, // 15-second timeout
        });

        // Parse the output into structured results
        const results = output
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line) => {
            // ripgrep output format is: file:line:content
            const firstColonIndex = line.indexOf(':');
            const secondColonIndex = line.indexOf(':', firstColonIndex + 1);

            if (firstColonIndex === -1 || secondColonIndex === -1) {
              return { raw: line };
            }

            const file = line.substring(0, firstColonIndex);
            const lineNumber = parseInt(line.substring(firstColonIndex + 1, secondColonIndex), 10);
            const content = line.substring(secondColonIndex + 1);

            return {
              file: path.relative(context.cwd, file),
              line: lineNumber,
              content,
            };
          });

        context.logger.logAction('RipgrepSearch Tool', {
          pattern,
          rootDir: parameters.rootDir || '.',
          resultsCount: results.length,
        });

        return {
          pattern,
          rootDir: parameters.rootDir || '.',
          results,
          truncated: results.length >= maxResults,
        };
      } catch (execError) {
        // ripgrep returns a non-zero status if no matches are found
        // This is not an error for our purposes
        return {
          pattern,
          rootDir: parameters.rootDir || '.',
          results: [],
          truncated: false,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to perform ripgrep search: ${errorMessage}`);
    }
  },
};
