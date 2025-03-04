/**
 * Permission Configuration
 * Handles loading and saving of permission configuration for the session
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  loadPermissionsFromFile,
  savePermissionsToFile,
  initializePermissions,
} from '../utils/permissions';
import { logger } from '../utils/logger';

// Default paths
const FORQ_CONFIG_DIR = path.join(os.homedir(), '.forq');
const GLOBAL_PERMISSIONS_FILE = path.join(FORQ_CONFIG_DIR, 'permissions.json');
const DEFAULT_PROJECT_PERMISSIONS_FILE = '.forq/permissions.json';

// In-memory flag to track if we've initialized
let initialized = false;

/**
 * Gets the path to the project-specific permissions file
 */
function getProjectPermissionsPath(): string {
  return path.join(process.cwd(), DEFAULT_PROJECT_PERMISSIONS_FILE);
}

/**
 * Ensure the configuration directories exist
 */
function ensureConfigDirs(): void {
  // Global config directory
  if (!fs.existsSync(FORQ_CONFIG_DIR)) {
    fs.mkdirSync(FORQ_CONFIG_DIR, { recursive: true });
  }

  // Project config directory
  const projectConfigDir = path.join(process.cwd(), '.forq');
  if (!fs.existsSync(projectConfigDir)) {
    fs.mkdirSync(projectConfigDir, { recursive: true });
  }
}

/**
 * Initialize the permission system with global and project-specific permissions
 */
export function initializePermissionConfig(): void {
  if (initialized) {
    return;
  }

  logger.logAction('Permissions Config', { status: 'Initializing' });

  // First initialize the permission system
  initializePermissions();

  // Ensure config directories exist
  ensureConfigDirs();

  // Load global permissions first
  try {
    if (fs.existsSync(GLOBAL_PERMISSIONS_FILE)) {
      loadPermissionsFromFile(GLOBAL_PERMISSIONS_FILE);
      logger.logAction('Permissions Config', { status: 'Loaded global permissions' });
    }
  } catch (error) {
    logger.logError(error as Error, 'Failed to load global permissions');
  }

  // Then load project-specific permissions, which can override global ones
  try {
    const projectPermissionsPath = getProjectPermissionsPath();
    if (fs.existsSync(projectPermissionsPath)) {
      loadPermissionsFromFile(projectPermissionsPath);
      logger.logAction('Permissions Config', { status: 'Loaded project permissions' });
    }
  } catch (error) {
    logger.logError(error as Error, 'Failed to load project permissions');
  }

  initialized = true;
}

/**
 * Save permissions to both global and project files
 */
export function savePermissionConfig(): void {
  try {
    // Save global permissions
    savePermissionsToFile(GLOBAL_PERMISSIONS_FILE);
    logger.logAction('Permissions Config', { status: 'Saved global permissions' });

    // Save project-specific permissions
    const projectPermissionsPath = getProjectPermissionsPath();
    savePermissionsToFile(projectPermissionsPath);
    logger.logAction('Permissions Config', { status: 'Saved project permissions' });
  } catch (error) {
    logger.logError(error as Error, 'Failed to save permissions');
  }
}

/**
 * Cleanup the permission system before exiting
 */
export function cleanupPermissionConfig(): void {
  savePermissionConfig();
}
