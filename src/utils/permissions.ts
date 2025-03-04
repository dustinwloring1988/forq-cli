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

// In-memory permission store for current session
let sessionPermissions: PermissionStore = {
  tools: {},
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
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(sessionPermissions, null, 2), 'utf8');

    logger.logAction('Permissions Saved', { path: filePath });
  } catch (error) {
    logger.logError(error as Error, `Failed to save permissions to ${filePath}`);
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
