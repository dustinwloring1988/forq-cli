/**
 * Tool for executing bash commands
 * This tool provides a secure way to execute shell commands with persistence
 */

import { Tool, ToolContext, ToolParameters } from '../types/tools';
import { spawn, execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Shell state to maintain persistence across commands
let currentWorkingDirectory: string = process.cwd();
let lastExitCode: number = 0;

// List of potentially dangerous commands that require extra validation
const DANGEROUS_COMMANDS = [
  // System-altering commands
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf .',
  // Database operations
  'DROP',
  'drop',
  'DELETE FROM',
  'delete from',
  // Network and system commands that could be harmful
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'mkfs',
  'dd',
  'fdisk',
  // Other potentially destructive commands
  'curl | bash',
  'wget | bash',
  'curl | sh',
  'wget | sh',
  '> /dev/sda',
  '> /dev/hda',
];

// Default command timeout (2 minutes)
const DEFAULT_TIMEOUT = 120000;

// Shorter timeout for simple commands (10 seconds)
const SIMPLE_COMMAND_TIMEOUT = 10000;

/**
 * Checks if a command contains potentially dangerous operations
 */
function isCommandDangerous(command: string): boolean {
  return DANGEROUS_COMMANDS.some((dangerousCmd) => command.includes(dangerousCmd));
}

/**
 * Check if this is a Node.js related command
 */
function isNodeCommand(command: string): boolean {
  return (
    command.trim().startsWith('node ') ||
    command.trim() === 'node' ||
    command.trim().startsWith('npm ') ||
    command.trim() === 'npm'
  );
}

/**
 * Get Node.js executable path
 */
function getNodePath(): string | null {
  try {
    return execSync('which node', { encoding: 'utf8' }).trim();
  } catch (error) {
    return null;
  }
}

/**
 * Executes a bash command and returns its output
 * Maintains state (working directory, environment variables) between invocations
 */
async function executeCommand(
  command: string,
  context: ToolContext,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Check for dangerous commands
  if (isCommandDangerous(command)) {
    throw new Error(`Command contains potentially dangerous operations: ${command}`);
  }

  // Use shorter timeout for simple commands
  if (
    command.trim() === 'node --version' ||
    command.trim() === 'npm --version' ||
    command.trim().includes(' --help') ||
    command.trim().includes(' -h') ||
    command.trim().includes(' -v')
  ) {
    timeout = SIMPLE_COMMAND_TIMEOUT;
  }

  context.logger.logAction('Executing Bash Command', {
    command,
    cwd: currentWorkingDirectory,
    timeout: timeout,
  });

  // Special handling for Node.js commands
  if (isNodeCommand(command)) {
    // Check if Node.js is available and log info
    const nodePath = getNodePath();
    if (!nodePath) {
      return {
        stdout: '',
        stderr: 'Node.js not found in PATH. Please ensure Node.js is installed and in your PATH.',
        exitCode: 1,
      };
    }

    context.logger.logAction('Node.js Path', { path: nodePath });

    // Check if the file exists for node execution
    if (
      command.startsWith('node ') &&
      command.trim() !== 'node --version' &&
      command.trim() !== 'node -v'
    ) {
      const filePath = command.substring(5).trim().split(' ')[0];
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(currentWorkingDirectory, filePath);

      if (!fs.existsSync(fullPath)) {
        return {
          stdout: '',
          stderr: `File not found: ${filePath}`,
          exitCode: 1,
        };
      }
    }
  }

  // Return promise that resolves when command completes or times out
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isKilled = false;

    // Start timer for command timeout
    const timer = setTimeout(() => {
      isKilled = true;
      child.kill();

      // For debugging timeout issues
      context.logger.logAction('Command Timeout', {
        command,
        timeout: timeout / 1000,
        stdout_snippet: stdout.substring(0, 200) + (stdout.length > 200 ? '...' : ''),
        stderr_snippet: stderr.substring(0, 200) + (stderr.length > 200 ? '...' : ''),
      });

      resolve({
        stdout,
        stderr: `Command execution timed out after ${timeout / 1000} seconds: ${command}`,
        exitCode: 1,
      });
    }, timeout);

    // Determine if we should use shell
    // For most commands, using shell: true is fine
    // For Node commands, we might want to execute them directly
    const useShell =
      !isNodeCommand(command) ||
      command.includes('|') ||
      command.includes('&&') ||
      command.includes(';');

    // Spawn bash process
    const child = spawn('bash', ['-c', command], {
      cwd: currentWorkingDirectory,
      env: process.env,
      shell: useShell,
    });

    // Collect stdout
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
    });

    // Collect stderr
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
    });

    // Handle process exit
    child.on('close', (code) => {
      if (isKilled) return; // Already handled by timeout

      clearTimeout(timer);
      lastExitCode = code || 0;

      // Check for cd command to update working directory
      if (command.trim().startsWith('cd ')) {
        const newDir = command.trim().substring(3).trim();
        try {
          let targetDir;

          // Handle absolute paths, home directory, and parent directory
          if (newDir.startsWith('/')) {
            targetDir = newDir;
          } else if (newDir.startsWith('~')) {
            targetDir = newDir.replace('~', os.homedir());
          } else {
            targetDir = path.resolve(currentWorkingDirectory, newDir);
          }

          // Update current working directory if it exists
          require('fs').accessSync(targetDir);
          currentWorkingDirectory = targetDir;
        } catch (error) {
          stderr += `\nFailed to change directory to ${newDir}: Directory does not exist or is not accessible.`;
        }
      }

      resolve({
        stdout,
        stderr,
        exitCode: lastExitCode,
      });
    });

    // Handle process errors
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * The bash tool
 */
export const tool: Tool = {
  name: 'bash',
  description: `Run commands in a bash shell
* When invoking this tool, the command is executed in a persistent shell session.
* State is persistent across command calls (working directory, environment variables).
* Commands have a default timeout of 2 minutes to prevent hanging.
* Simple commands (--version, --help) have a shorter timeout of 10 seconds.
* Potentially dangerous system commands are blocked.
* To inspect a particular line range of a file, use: 'sed -n 10,25p /path/to/file'.
* For background tasks, append '&' to the command.`,
  parameterSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description:
          'The bash command to run. This should be a valid shell command that the system can execute.',
      },
    },
    required: ['command'],
  },
  requiresPermission: true,
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    const { command } = parameters;

    try {
      const result = await executeCommand(command, context);

      return {
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        cwd: currentWorkingDirectory,
      };
    } catch (error) {
      context.logger.logError(error as Error, `Failed to execute bash command: ${command}`);

      return {
        command,
        error: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        cwd: currentWorkingDirectory,
      };
    }
  },
};
