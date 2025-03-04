/**
 * User Prompting Utilities
 * Provides functions to prompt users for input and confirmations
 */

import * as readline from 'readline';
import { PermissionType } from './permissions';
import { logger } from './logger';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Prompts the user with a question and returns their response
 *
 * @param question The question to ask the user
 * @returns Promise resolving to the user's response
 */
export function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Ask the user for a yes/no confirmation
 *
 * @param question The question to ask the user
 * @param defaultYes Whether the default answer is yes
 * @returns Promise resolving to boolean indicating user's choice
 */
export async function confirmPrompt(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? ' (Y/n): ' : ' (y/N): ';
  const response = await promptUser(question + suffix);

  if (response === '') {
    return defaultYes;
  }

  return response.toLowerCase() === 'y' || response.toLowerCase() === 'yes';
}

/**
 * Map of permission types to user-friendly descriptions
 */
const permissionDescriptions: Record<PermissionType, string> = {
  [PermissionType.FileSystem]: 'read and modify files',
  [PermissionType.ShellCommand]: 'execute shell commands',
  [PermissionType.NetworkAccess]: 'access network resources',
  [PermissionType.Embedding]: 'create embeddings for semantic search',
};

/**
 * Asks the user for permission to perform a sensitive operation
 *
 * @param toolName Name of the tool requesting permission
 * @param permissionType Type of permission being requested
 * @param scope Optional scope for the permission (e.g. directory path)
 * @param reason Optional reason for requesting permission
 * @returns Promise resolving to boolean indicating if permission was granted
 */
export async function requestPermission(
  toolName: string,
  permissionType: PermissionType,
  scope?: string,
  reason?: string,
): Promise<boolean> {
  const description = permissionDescriptions[permissionType] || permissionType;
  const scopeText = scope ? ` in "${scope}"` : '';
  const reasonText = reason ? `\nReason: ${reason}` : '';

  const question = `\n🔒 Permission Required 🔒\nThe tool "${toolName}" needs permission to ${description}${scopeText}.${reasonText}\n\nGrant permission?`;

  console.log('\n'); // Add some spacing
  const result = await confirmPrompt(question, false);

  logger.logAction('Permission Request', {
    tool: toolName,
    type: permissionType,
    scope: scope || 'global',
    granted: result,
  });

  return result;
}

/**
 * Cleanup resources used by the prompting system
 */
export function closePrompt(): void {
  rl.close();
}
