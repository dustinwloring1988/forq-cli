/**
 * Configuration Management Utilities
 * Handles loading, saving, and merging global and project-specific configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';

// Default configuration file names
const GLOBAL_CONFIG_FILE = '.forqrc.json';
const PROJECT_CONFIG_FILE = '.forqrc.json';

// Default global configuration directory
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.forq');

/**
 * Configuration interface
 */
export interface ForqConfig {
  // API keys and settings
  api?: {
    anthropic?: {
      apiKey?: string;
      model?: string;
      maxTokens?: number;
      temperature?: number;
      completeToolCycle?: boolean;
    };
    openai?: {
      apiKey?: string;
      model?: string;
    };
    ollama?: {
      host?: string;
      port?: number;
      model?: string;
      embeddingModel?: string;
      maxTokens?: number;
      temperature?: number;
      contextWindow?: number;
      systemPrompt?: string;
    };
  };

  // Tool settings and permissions
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      requireConfirmation?: boolean;
      // Tool-specific settings
      settings?: Record<string, any>;
    };
  };

  // REPL settings
  repl?: {
    historySize?: number;
    prompt?: string;
    colorScheme?: {
      prompt?: string;
      response?: string;
      error?: string;
      info?: string;
      success?: string;
    };
    autoCompactThreshold?: number;
  };

  // Logging settings
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    logConversation?: boolean;
    logToolCalls?: boolean;
    logPerformance?: boolean;
  };
}

// Track if config has been loaded
let initialized = false;

// In-memory config object
let config: ForqConfig = {};

/**
 * Gets the path to the global config file
 */
export function getGlobalConfigPath(): string {
  return path.join(GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILE);
}

/**
 * Gets the path to the project config file
 */
export function getProjectConfigPath(): string {
  return path.join(process.cwd(), PROJECT_CONFIG_FILE);
}

/**
 * Ensure config directories exist
 */
function ensureConfigDirs(): void {
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }
}

/**
 * Loads JSON from a config file
 * @param configPath Path to the config file
 * @returns Parsed config object or empty object if file doesn't exist
 */
function loadConfigFromFile(configPath: string): ForqConfig {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    logger.logError(error as Error, `Failed to load config from ${configPath}`);
  }
  return {};
}

/**
 * Deep merges source object into target object
 * @param target Target object to merge into
 * @param source Source object to merge from
 * @returns Merged object
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

/**
 * Check if value is an object
 */
function isObject(item: any): item is Record<string, any> {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Initialize configuration system
 * Loads global and project-specific configs and merges them
 * Project config overrides global config
 */
export function initializeConfig(): ForqConfig {
  if (initialized) {
    return config;
  }

  logger.logAction('Config', { status: 'Initializing configuration' });

  // Ensure config directories exist
  ensureConfigDirs();

  // Load global config
  const globalConfig = loadConfigFromFile(getGlobalConfigPath());
  config = globalConfig;
  logger.logAction('Config', { status: 'Loaded global config' });

  // Load project config and merge
  const projectConfig = loadConfigFromFile(getProjectConfigPath());
  config = deepMerge(config, projectConfig) as ForqConfig;
  logger.logAction('Config', { status: 'Loaded and merged project config' });

  initialized = true;
  return config;
}

/**
 * Gets the current configuration
 * Initializes config if it hasn't been loaded yet
 */
export function getConfig(): ForqConfig {
  if (!initialized) {
    return initializeConfig();
  }
  return config;
}

/**
 * Updates global configuration
 * @param newConfig The new config values to merge
 */
export function updateGlobalConfig(newConfig: Partial<ForqConfig>): void {
  // Initialize if not already done
  if (!initialized) {
    initializeConfig();
  }

  // Load the latest from disk
  const globalConfig = loadConfigFromFile(getGlobalConfigPath());

  // Merge the new config
  const updatedConfig = deepMerge(globalConfig, newConfig);

  // Save back to disk
  try {
    ensureConfigDirs();
    fs.writeFileSync(getGlobalConfigPath(), JSON.stringify(updatedConfig, null, 2));

    // Update the in-memory config
    config = deepMerge(config, newConfig) as ForqConfig;
    logger.logAction('Config', { status: 'Updated global config' });
  } catch (error) {
    logger.logError(error as Error, 'Failed to save global config');
    throw new Error(`Failed to save global config: ${(error as Error).message}`);
  }
}

/**
 * Updates project configuration
 * @param newConfig The new config values to merge
 */
export function updateProjectConfig(newConfig: Partial<ForqConfig>): void {
  // Initialize if not already done
  if (!initialized) {
    initializeConfig();
  }

  // Load the latest from disk
  const projectConfig = loadConfigFromFile(getProjectConfigPath());

  // Merge the new config
  const updatedConfig = deepMerge(projectConfig, newConfig);

  // Save back to disk
  try {
    fs.writeFileSync(getProjectConfigPath(), JSON.stringify(updatedConfig, null, 2));

    // Update the in-memory config
    config = deepMerge(config, newConfig) as ForqConfig;
    logger.logAction('Config', { status: 'Updated project config' });
  } catch (error) {
    logger.logError(error as Error, 'Failed to save project config');
    throw new Error(`Failed to save project config: ${(error as Error).message}`);
  }
}

/**
 * Creates a default configuration file if it doesn't exist
 * @param global Whether to create global or project config
 */
export function createDefaultConfig(global: boolean): void {
  const configPath = global ? getGlobalConfigPath() : getProjectConfigPath();

  if (fs.existsSync(configPath)) {
    logger.logAction('Config', {
      status: `${global ? 'Global' : 'Project'} config already exists`,
    });
    return;
  }

  const defaultConfig: ForqConfig = {
    api: {
      anthropic: {
        model: 'claude-3-opus-20240229',
        maxTokens: 4000,
        temperature: 0.7,
        completeToolCycle: true,
      },
      ollama: {
        host: 'http://localhost',
        port: 11434,
        model: 'mistral',
        embeddingModel: 'nomic-embed-text',
        maxTokens: 4096,
        temperature: 0.7,
        contextWindow: 8192,
        systemPrompt: 'You are a helpful AI assistant.',
      },
    },
    tools: {},
    repl: {
      historySize: 100,
      autoCompactThreshold: 40,
    },
    logging: {
      level: 'info',
      logConversation: true,
      logToolCalls: true,
      logPerformance: false,
    },
  };

  try {
    if (global) {
      ensureConfigDirs();
    }

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    logger.logAction('Config', {
      status: `Created default ${global ? 'global' : 'project'} config at ${configPath}`,
    });
  } catch (error) {
    logger.logError(
      error as Error,
      `Failed to create default ${global ? 'global' : 'project'} config`,
    );
  }
}
