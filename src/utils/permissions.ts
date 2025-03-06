/**
 * Permission System
 * Handles storage and verification of permissions for tool execution
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

/**
 * Types of permissions that can be granted
 */
export enum PermissionType {
  FileSystem = 'file_system',
  ShellCommand = 'shell_command',
  NetworkAccess = 'network_access',
  Embedding = 'embedding',
}

/**
 * Individual permission entry
 */
export interface Permission {
  type: PermissionType;
  granted: boolean;
  scope?: string; // For scoped permissions (e.g., specific directories for file access)
  timestamp: number;
}

/**
 * Storage for session permissions
 */
export interface PermissionStore {
  // Map of tool names to their granted permissions
  tools: Record<string, Permission[]>;
}

/**
 * Pending permission request
 */
interface PendingPermissionRequest {
  resolve: (granted: boolean) => void;
  reject: (reason: string) => void;
  toolName: string;
  permissionType: PermissionType;
  scope?: string;
}

// In-memory permission store for current session
let sessionPermissions: PermissionStore = {
  tools: {},
};

// Map to store pending permission requests
const pendingPermissions: Map<string, PendingPermissionRequest> = new Map();

// Function to import dynamically to avoid circular dependencies
const importPrompt = async () => {
  return await import('./prompt.js');
};

/**
 * Initialize the permission system
 */
export function initializePermissions(): void {
  sessionPermissions = {
    tools: {},
  };
  logger.logAction('Permissions System', { status: 'Initialized' });
}

/**
 * Check if a tool has been granted a specific permission
 *
 * @param toolName Name of the tool requesting permission
 * @param permissionType Type of permission being requested
 * @param scope Optional scope for the permission (e.g. directory path)
 * @returns Whether permission has been granted
 */
export function hasPermission(
  toolName: string,
  permissionType: PermissionType,
  scope?: string,
): boolean {
  // Check if tool has any permissions
  if (!sessionPermissions.tools[toolName]) {
    return false;
  }

  // Find matching permission
  const permissions = sessionPermissions.tools[toolName];

  // First check for exact match with scope
  if (scope) {
    const exactMatch = permissions.find(
      (p) => p.type === permissionType && p.granted && p.scope === scope,
    );

    if (exactMatch) {
      return true;
    }

    // For FileSystem permissions, check if a parent directory has permission
    if (permissionType === PermissionType.FileSystem) {
      const parentDirPermission = permissions.find(
        (p) => p.type === permissionType && p.granted && p.scope && scope.startsWith(p.scope),
      );

      if (parentDirPermission) {
        return true;
      }
    }
  }

  // Check for global permission of this type (no scope)
  return permissions.some((p) => p.type === permissionType && p.granted && !p.scope);
}

/**
 * Request permission and wait for the user's response
 * Returns a promise that resolves when permission is granted or denied
 *
 * @param toolName Name of the tool requesting permission
 * @param permissionType Type of permission being requested
 * @param scope Optional scope for the permission
 * @param reason Optional reason for the permission request
 * @returns Promise resolving to boolean indicating if permission was granted
 */
export async function requestPermissionAndWait(
  toolName: string,
  permissionType: PermissionType,
  scope?: string,
  reason?: string,
): Promise<boolean> {
  // If permission is already granted, return immediately
  if (hasPermission(toolName, permissionType, scope)) {
    logger.logAction('Permission Check', {
      tool: toolName,
      type: permissionType,
      scope: scope || 'global',
      result: 'Already granted',
    });
    return true;
  }

  // Generate a unique key for this permission request
  const requestId = `${toolName}:${permissionType}:${scope || '*'}-${Date.now()}`;

  // Create promise that will be resolved when permission is granted or denied
  const permissionPromise = new Promise<boolean>((resolve, reject) => {
    // Store the resolvers in the pendingPermissions map
    pendingPermissions.set(requestId, {
      resolve,
      reject,
      toolName,
      permissionType,
      scope,
    });

    // Log that permission is being requested
    logger.logAction('Permission Request', {
      requestId,
      tool: toolName,
      type: permissionType,
      scope: scope || 'global',
      status: 'Pending user confirmation',
    });

    // Trigger the UI prompt
    showPermissionPrompt(requestId, toolName, permissionType, scope, reason).catch((err) => {
      logger.logError(err as Error, 'Failed to show permission prompt');
      reject('Failed to show permission prompt');
    });
  });

  // Return the promise that will resolve when permission is granted or denied
  return permissionPromise;
}

/**
 * Show the permission prompt to the user
 * @param requestId The unique ID for this permission request
 * @param toolName The name of the tool
 * @param permissionType The type of permission
 * @param scope The scope of the permission
 * @param reason The reason for the permission request
 */
async function showPermissionPrompt(
  requestId: string,
  toolName: string,
  permissionType: PermissionType,
  scope?: string,
  reason?: string,
): Promise<void> {
  try {
    // Dynamically import prompt to avoid circular dependencies
    const prompt = await importPrompt();

    // Show the permission prompt to the user
    const result = await prompt.requestPermission(
      toolName,
      permissionType,
      scope,
      reason,
      requestId, // Pass the request ID so the prompt can resolve the pending permission
    );

    // The requestPermission function will call resolvePermissionRequest
    // with the result, so we don't need to do anything else here
  } catch (error) {
    logger.logError(error as Error, 'Error showing permission prompt');
    // If showing the prompt fails, deny the permission
    resolvePermissionRequest(requestId, false);
  }
}

/**
 * Resolve a pending permission request
 * This should be called when the user responds to a permission prompt
 *
 * @param requestId The ID of the permission request to resolve
 * @param granted Whether permission was granted
 */
export function resolvePermissionRequest(requestId: string, granted: boolean): void {
  const pendingRequest = pendingPermissions.get(requestId);

  if (pendingRequest) {
    const { toolName, permissionType, scope, resolve } = pendingRequest;

    if (granted) {
      // Grant the permission in the permission store
      grantPermission(toolName, permissionType, scope);
    }

    // Resolve the pending promise
    resolve(granted);

    // Remove the pending request
    pendingPermissions.delete(requestId);

    logger.logAction('Permission Request Resolved', {
      requestId,
      granted,
    });
  }
}

/**
 * Grant permission for a specific tool
 *
 * @param toolName Name of the tool receiving permission
 * @param permissionType Type of permission to grant
 * @param scope Optional scope for the permission
 */
export function grantPermission(
  toolName: string,
  permissionType: PermissionType,
  scope?: string,
): void {
  // Initialize tool permissions if needed
  if (!sessionPermissions.tools[toolName]) {
    sessionPermissions.tools[toolName] = [];
  }

  // Create permission object
  const permission: Permission = {
    type: permissionType,
    granted: true,
    scope,
    timestamp: Date.now(),
  };

  // Add to permissions array
  sessionPermissions.tools[toolName].push(permission);

  logger.logAction('Permission Granted', {
    tool: toolName,
    type: permissionType,
    scope: scope || 'global',
  });
}

/**
 * Revoke permission for a specific tool
 *
 * @param toolName Name of the tool
 * @param permissionType Type of permission to revoke
 * @param scope Optional scope for the permission
 */
export function revokePermission(
  toolName: string,
  permissionType: PermissionType,
  scope?: string,
): void {
  // Check if tool has any permissions
  if (!sessionPermissions.tools[toolName]) {
    return;
  }

  // Find matching permissions and revoke them
  const permissions = sessionPermissions.tools[toolName];

  sessionPermissions.tools[toolName] = permissions.map((p) => {
    if (p.type === permissionType && (scope ? p.scope === scope : true)) {
      return { ...p, granted: false };
    }
    return p;
  });

  logger.logAction('Permission Revoked', {
    tool: toolName,
    type: permissionType,
    scope: scope || 'global',
  });
}

/**
 * Get all permissions for the current session
 */
export function getAllPermissions(): PermissionStore {
  return sessionPermissions;
}

/**
 * Save current session permissions to a config file
 */
export function savePermissionsToFile(filePath: string): void {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (dirError) {
        logger.logError(dirError as Error, `Failed to create directory for permissions: ${dir}`);
        return; // Exit early if we can't create the directory
      }
    }

    // Check if directory is writable
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (accessError) {
      logger.logError(accessError as Error, `Directory not writable: ${dir}`);
      return; // Exit early if directory is not writable
    }

    // Write the permissions file
    fs.writeFileSync(filePath, JSON.stringify(sessionPermissions, null, 2), 'utf8');
    logger.logAction('Permissions Saved', { path: filePath });
  } catch (error) {
    logger.logError(error as Error, `Failed to save permissions to ${filePath}`);
    // Don't throw, just log the error
  }
}

/**
 * Load permissions from a config file
 */
export function loadPermissionsFromFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const data = fs.readFileSync(filePath, 'utf8');
    sessionPermissions = JSON.parse(data);

    logger.logAction('Permissions Loaded', { path: filePath });
    return true;
  } catch (error) {
    logger.logError(error as Error, `Failed to load permissions from ${filePath}`);
    return false;
  }
}
