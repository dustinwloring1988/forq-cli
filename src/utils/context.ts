/**
 * Context Management Utilities
 * Handles loading project context and other information useful for AI
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { logger } from './logger';

// Default filename for project-specific instructions
const DEFAULT_FORQ_MD = 'FORQ.md';

/**
 * Project Context Interface
 */
export interface ProjectContext {
  // Project-specific instructions loaded from FORQ.md
  instructions?: string;
  // Git information about the project
  git?: {
    currentBranch?: string;
    modifiedFiles?: string[];
    recentCommits?: Array<{
      hash: string;
      message: string;
      author: string;
      date: string;
    }>;
  };
  // Summary of project structure
  directoryStructure?: string;
}

/**
 * Loads project-specific instructions from FORQ.md if it exists
 * @returns The content of FORQ.md or undefined if not found
 */
export function loadProjectInstructions(): string | undefined {
  try {
    const forqPath = path.join(process.cwd(), DEFAULT_FORQ_MD);

    if (fs.existsSync(forqPath)) {
      logger.logAction('Context', { status: 'Loading project instructions from FORQ.md' });
      return fs.readFileSync(forqPath, 'utf8');
    }

    logger.logAction('Context', { status: 'No FORQ.md found' });
    return undefined;
  } catch (error) {
    logger.logError(error as Error, 'Failed to load project instructions');
    return undefined;
  }
}

/**
 * Collects git context about the current project
 * @returns Git context information or undefined if not a git repository
 */
export function collectGitContext(): ProjectContext['git'] | undefined {
  try {
    // Check if we're in a git repository
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    } catch (error) {
      logger.logAction('Context', { status: 'Not a git repository' });
      return undefined;
    }

    const gitContext: ProjectContext['git'] = {};

    // Get current branch
    try {
      gitContext.currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch (error) {
      logger.logAction('Context', { status: 'Failed to get current branch' });
    }

    // Get modified files
    try {
      const modifiedOutput = execSync('git status --porcelain', { encoding: 'utf8' });
      gitContext.modifiedFiles = modifiedOutput
        .split('\n')
        .filter(Boolean)
        .map((line) => line.substring(3));
    } catch (error) {
      logger.logAction('Context', { status: 'Failed to get modified files' });
    }

    // Get recent commits (last 5)
    try {
      const commitsOutput = execSync('git log -5 --pretty=format:"%h|||%s|||%an|||%ad"', {
        encoding: 'utf8',
      });

      gitContext.recentCommits = commitsOutput
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, message, author, date] = line.split('|||');
          return { hash, message, author, date };
        });
    } catch (error) {
      logger.logAction('Context', { status: 'Failed to get recent commits' });
    }

    logger.logAction('Context', { status: 'Collected git context' });
    return gitContext;
  } catch (error) {
    logger.logError(error as Error, 'Failed to collect git context');
    return undefined;
  }
}

/**
 * Generates a summary of the project directory structure
 * Provides a tree-like overview of the main directories and files
 * @param depth Max depth to traverse (default: 2)
 * @returns A string representation of the directory structure
 */
export function getDirectoryStructureSummary(depth: number = 2): string {
  try {
    // This is a simple implementation that could be enhanced
    // with more sophisticated directory walking and formatting
    const basePath = process.cwd();
    let result = `Directory structure for ${path.basename(basePath)}:\n`;

    function traverse(dir: string, currentDepth: number, prefix: string = ''): void {
      if (currentDepth > depth) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // Sort entries: directories first, then files
      const sortedEntries = [
        ...entries
          .filter((entry) => entry.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name)),
        ...entries
          .filter((entry) => !entry.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name)),
      ];

      for (let i = 0; i < sortedEntries.length; i++) {
        const entry = sortedEntries[i];
        const isLast = i === sortedEntries.length - 1;
        const entryPrefix = prefix + (isLast ? '└── ' : '├── ');
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');

        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue; // Skip hidden files/dirs and node_modules
        }

        result += `${entryPrefix}${entry.name}${entry.isDirectory() ? '/' : ''}\n`;

        if (entry.isDirectory()) {
          traverse(path.join(dir, entry.name), currentDepth + 1, nextPrefix);
        }
      }
    }

    traverse(basePath, 1);
    logger.logAction('Context', { status: 'Generated directory structure summary' });
    return result;
  } catch (error) {
    logger.logError(error as Error, 'Failed to generate directory structure summary');
    return 'Could not generate directory structure';
  }
}

/**
 * Collects full project context including instructions, git info, and directory structure
 * @returns Complete project context object
 */
export function collectProjectContext(): ProjectContext {
  const context: ProjectContext = {};

  // Load project instructions
  context.instructions = loadProjectInstructions();

  // Collect git context
  context.git = collectGitContext();

  // Generate directory structure summary
  context.directoryStructure = getDirectoryStructureSummary();

  logger.logAction('Context', { status: 'Collected complete project context' });
  return context;
}
