/**
 * Semantic Search Tool
 * Returns semantically relevant code snippets based on a natural language query
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolParameters } from '../types/tools';
import cosineSimilarity from 'cosine-similarity';
import { createEmbedding } from './semantic-embed';
import * as glob from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';

// Convert exec to promise-based
const execAsync = promisify(exec);

/**
 * Type definition for code snippets with embeddings
 */
interface CodeSnippet {
  id: string;
  filePath: string;
  code: string;
  vector: number[];
}

/**
 * Type definition for semantic search results
 */
interface SearchResult {
  filePath: string;
  snippet: string;
  similarity: number;
}

/**
 * Returns the directory where embeddings are stored
 */
function getEmbeddingDir(codebase: string): string {
  return path.join(process.cwd(), '.forq', 'embeddings', codebase);
}

/**
 * Creates directory for embeddings if it doesn't exist
 */
function ensureEmbeddingDir(codebase: string): string {
  const dir = getEmbeddingDir(codebase);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Extracts code snippets from a codebase by scanning files
 * In a more advanced implementation, this would parse the AST to extract logical units
 */
async function extractCodeSnippets(
  codebase: string,
  logger: any,
): Promise<{ filePath: string; content: string }[]> {
  const codebasePath = path.resolve(process.cwd(), codebase);
  logger.logAction('Scanning Codebase', { path: codebasePath });

  try {
    // Get list of code files to process
    // Exclude node_modules, .git, and binary files
    const command = `find ${codebasePath} -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" | grep -E "\\.(js|ts|jsx|tsx|py|java|c|cpp|rb|go|rs|php|html|css|scss|md|json)"`;
    const { stdout } = await execAsync(command);
    const files = stdout.split('\n').filter((file) => file.trim() !== '');

    const snippets: { filePath: string; content: string }[] = [];

    // For simplicity, treat each file as a single snippet in this implementation
    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        snippets.push({ filePath, content });
      } catch (error) {
        logger.logError(error as Error, `Failed to read file: ${filePath}`);
      }
    }

    return snippets;
  } catch (error) {
    logger.logError(error as Error, `Failed to scan codebase: ${codebasePath}`);
    return [];
  }
}

/**
 * Generates embeddings for code snippets if they don't already exist
 */
async function ensureCodebaseEmbeddings(codebase: string, logger: any): Promise<CodeSnippet[]> {
  const embeddingDir = ensureEmbeddingDir(codebase);
  const embeddingsFile = path.join(embeddingDir, 'embeddings.json');

  // Check if embeddings already exist
  if (fs.existsSync(embeddingsFile)) {
    try {
      const data = fs.readFileSync(embeddingsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.logError(error as Error, `Failed to read existing embeddings: ${embeddingsFile}`);
      // If reading fails, regenerate embeddings
    }
  }

  // Create new embeddings
  logger.logAction('Generating Codebase Embeddings', { codebase });
  const snippets = await extractCodeSnippets(codebase, logger);

  const codeSnippets: CodeSnippet[] = [];
  for (const { filePath, content } of snippets) {
    try {
      const id = path.relative(process.cwd(), filePath);
      // Skip if content is too large
      if (content.length > 8000) {
        // For large files, we'd ideally split them into logical chunks
        // For simplicity in this implementation, we'll just take the first 8000 chars
        const truncatedContent = content.substring(0, 8000);
        const vector = await createEmbedding(truncatedContent);
        codeSnippets.push({
          id,
          filePath,
          code: truncatedContent,
          vector,
        });
      } else {
        const vector = await createEmbedding(content);
        codeSnippets.push({
          id,
          filePath,
          code: content,
          vector,
        });
      }
    } catch (error) {
      logger.logError(error as Error, `Failed to embed snippet: ${filePath}`);
    }
  }

  // Save embeddings
  try {
    fs.writeFileSync(embeddingsFile, JSON.stringify(codeSnippets, null, 2));
  } catch (error) {
    logger.logError(error as Error, `Failed to save embeddings: ${embeddingsFile}`);
  }

  return codeSnippets;
}

/**
 * Performs semantic search on code snippets
 */
async function performSemanticSearch(
  query: string,
  codebase: string,
  topK: number,
  logger: any,
): Promise<SearchResult[]> {
  // Ensure embeddings exist for the codebase
  const snippets = await ensureCodebaseEmbeddings(codebase, logger);

  if (snippets.length === 0) {
    logger.logAction('Semantic Search', { status: 'No snippets found', codebase });
    return [];
  }

  // Create embedding for the query
  const queryVector = await createEmbedding(query);

  // Calculate similarity scores
  const similarities = snippets.map((snippet) => ({
    snippetObj: snippet,
    filePath: snippet.filePath,
    similarity: cosineSimilarity([queryVector], [snippet.vector])[0],
  }));

  // Sort by similarity (descending)
  similarities.sort((a, b) => b.similarity - a.similarity);

  // Return top K results
  return similarities.slice(0, topK).map((result) => ({
    filePath: result.filePath,
    snippet: result.snippetObj.code,
    similarity: result.similarity,
  }));
}

/**
 * The semanticSearch tool
 */
export const tool: Tool = {
  name: 'semanticSearch',
  description:
    'Returns semantically relevant code snippets based on a natural language query. This tool uses embeddings to find code that matches the meaning of your query.',
  parameterSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The natural language query to find semantically relevant code snippets.',
      },
      codebase: {
        type: 'string',
        description: 'The path of the codebase within which to perform the semantic search.',
      },
      topK: {
        type: 'number',
        description: 'The number of top results to return. Default is 5.',
      },
    },
    required: ['query', 'codebase'],
  },
  requiresPermission: false,
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    const { query, codebase, topK = 5 } = parameters;

    context.logger.logAction('Semantic Search', { query, codebase });

    try {
      const results = await performSemanticSearch(query, codebase, topK, context.logger);

      return {
        query,
        codebase,
        results,
      };
    } catch (error) {
      context.logger.logError(error as Error, 'Failed to perform semantic search');
      throw error;
    }
  },
};
