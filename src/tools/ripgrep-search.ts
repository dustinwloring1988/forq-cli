/**
 * Ripgrep Search Tool
 * Performs regex content search using ripgrep command
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Tool, ToolContext, ToolParameters } from '../types/tools';

/**
 * Check if ripgrep is installed on the system
 */
function isRipgrepAvailable(): boolean {
  try {
    execSync('rg --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Fallback search using plain Node.js for when ripgrep is not available
 */
async function fallbackSearch(
  pattern: string,
  rootDir: string,
  maxResults: number,
): Promise<any[]> {
  const results: any[] = [];
  const regex = new RegExp(pattern, 'i');

  async function searchInFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push({
            file: filePath,
            line: i + 1,
            content: lines[i],
          });

          if (results.length >= maxResults) {
            return;
          }
        }
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  async function traverseDirectory(dir: string): Promise<void> {
    try {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        if (results.length >= maxResults) return;

        const fullPath = path.join(dir, entry);
        try {
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            await traverseDirectory(fullPath);
          } else if (stat.isFile()) {
            // Skip binary files and very large files
            if (
              stat.size < 1024 * 1024 &&
              !fullPath.match(/\.(jpg|jpeg|png|gif|mp4|zip|tar|gz|bin)$/i)
            ) {
              await searchInFile(fullPath);
            }
          }
        } catch (error) {
          // Skip entries we can't access
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await traverseDirectory(rootDir);
  return results;
}

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

      // Check if ripgrep is available
      const hasRipgrep = isRipgrepAvailable();

      if (hasRipgrep) {
        // Use ripgrep if available
        try {
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
              const lineNumber = parseInt(
                line.substring(firstColonIndex + 1, secondColonIndex),
                10,
              );
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
            method: 'ripgrep',
          });

          return {
            pattern,
            rootDir: parameters.rootDir || '.',
            results,
            truncated: results.length >= maxResults,
            method: 'ripgrep',
          };
        } catch (execError) {
          // ripgrep returns a non-zero status if no matches are found
          // This is not an error for our purposes
          return {
            pattern,
            rootDir: parameters.rootDir || '.',
            results: [],
            truncated: false,
            method: 'ripgrep',
          };
        }
      } else {
        // Fallback to Node.js implementation if ripgrep is not available
        context.logger.logAction('RipgrepSearch Tool', {
          pattern,
          rootDir: parameters.rootDir || '.',
          method: 'fallback',
          note: 'ripgrep not available, using fallback search',
        });

        console.log('ripgrep (rg command) not found. Using fallback search method (slower)...');

        const results = await fallbackSearch(pattern, rootDir, maxResults);

        return {
          pattern,
          rootDir: parameters.rootDir || '.',
          results: results.map((r) => ({
            ...r,
            file: path.relative(context.cwd, r.file),
          })),
          truncated: results.length >= maxResults,
          method: 'fallback',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to perform search: ${errorMessage}`);
    }
  },
};
