/**
 * Tool for retrieving the full content of files that are semantically relevant to a query
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';
import { createEmbedding } from './semantic-embed';
import cosineSimilarity from 'cosine-similarity';

/**
 * Type definition for file with embedding
 */
interface FileWithEmbedding {
  filePath: string;
  content: string;
  vector: number[];
}

/**
 * Type definition for search result
 */
interface SearchResult {
  filePath: string;
  content: string;
  similarity: number;
}

/**
 * Finds semantically relevant files based on a query
 */
async function findSemanticFiles(
  query: string,
  topK: number,
  context: ToolContext,
): Promise<SearchResult[]> {
  // Default to the current directory as codebase path
  const codebasePath = process.cwd();
  context.logger.logAction('Finding Semantic Files', { query, codebasePath });

  // Get embedding for the query
  const queryVector = await createEmbedding(query);

  // Get all relevant files with their paths and content
  const files = await getFilesWithContent(codebasePath, context);

  // Early return if no files
  if (files.length === 0) {
    return [];
  }

  // Create embedding for each file
  const filesWithEmbeddings: FileWithEmbedding[] = [];
  for (const file of files) {
    try {
      const vector = await createEmbedding(file.content);
      filesWithEmbeddings.push({
        ...file,
        vector,
      });
    } catch (error) {
      context.logger.logError(error as Error, `Failed to embed file content: ${file.filePath}`);
    }
  }

  // Calculate similarity
  const results = filesWithEmbeddings.map((file) => ({
    ...file,
    similarity: cosineSimilarity([queryVector], [file.vector])[0],
  }));

  // Sort by relevance
  results.sort((a, b) => b.similarity - a.similarity);

  // Return top K results
  return results.slice(0, topK);
}

/**
 * Gets files with their content
 */
async function getFilesWithContent(
  codebasePath: string,
  context: ToolContext,
): Promise<{ filePath: string; content: string }[]> {
  const result: { filePath: string; content: string }[] = [];

  // This is a simplified implementation; in a real-world scenario,
  // we would use more sophisticated methods to select relevant files
  // and handle large directories efficiently
  try {
    const filePaths = getCodeFiles(codebasePath);

    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        result.push({
          filePath,
          content,
        });
      } catch (error) {
        context.logger.logError(error as Error, `Failed to read file: ${filePath}`);
      }
    }
  } catch (error) {
    context.logger.logError(error as Error, `Failed to list files in directory: ${codebasePath}`);
  }

  return result;
}

/**
 * Gets code files recursively from a directory
 */
function getCodeFiles(directory: string): string[] {
  const allFiles: string[] = [];

  function traverseDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules, .git, and other non-code directories
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.cache'].includes(entry.name)) {
          traverseDirectory(fullPath);
        }
      } else if (isCodeFile(entry.name)) {
        allFiles.push(fullPath);
      }
    }
  }

  traverseDirectory(directory);
  return allFiles;
}

/**
 * Checks if a file is a code file based on extension
 */
function isCodeFile(fileName: string): boolean {
  const codeExtensions = [
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.py',
    '.java',
    '.c',
    '.cpp',
    '.rb',
    '.go',
    '.rs',
    '.php',
    '.html',
    '.css',
    '.scss',
    '.md',
    '.json',
  ];
  return codeExtensions.some((ext) => fileName.endsWith(ext));
}

/**
 * The readSemanticSearchFiles tool
 */
export const tool: Tool = {
  name: 'readSemanticSearchFiles',
  description:
    'Retrieves the full content of files that are semantically relevant to a query. This combines semantic search with file reading to provide comprehensive context from multiple files in one operation.',
  parameterSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The natural language query used to identify semantically relevant files.',
      },
      topK: {
        type: 'number',
        description:
          'The number of top matching files to retrieve. Defaults to 2 if not specified.',
      },
    },
    required: ['query'],
  },
  requiresPermission: false,
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    const { query, topK = 2 } = parameters;

    context.logger.logAction('Read Semantic Search Files', { query, topK });

    try {
      const results = await findSemanticFiles(query, topK, context);

      if (results.length === 0) {
        return {
          query,
          message: 'No semantically relevant files found',
          files: [],
        };
      }

      // Format results as a dictionary with file paths as keys
      const fileContents: Record<string, any> = {};
      results.forEach((result) => {
        fileContents[result.filePath] = {
          content: result.content,
          similarity: result.similarity,
        };
      });

      return {
        query,
        message: `Found ${results.length} semantically relevant files`,
        fileCount: results.length,
        files: fileContents,
      };
    } catch (error) {
      context.logger.logError(error as Error, 'Failed to read semantic search files');
      throw error;
    }
  },
};
