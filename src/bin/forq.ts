#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { startRepl } from '../repl';
import {
  getGlobalConfigPath,
  getProjectConfigPath,
  getConfig,
  updateGlobalConfig,
  updateProjectConfig,
  createDefaultConfig,
  initializeConfig,
} from '../utils/config';

// Read package.json for version
const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const program = new Command();

program.name('forq').description('Terminal-based AI Coding Agent').version(packageJson.version);

// Implement the REPL command
program
  .command('repl')
  .description('Start an interactive REPL session')
  .action(async () => {
    console.log('Starting REPL session...');
    try {
      await startRepl();
    } catch (error) {
      console.error('Error starting REPL:', (error as Error).message);
      process.exit(1);
    }
  });

// Implement the config command
program
  .command('config')
  .description('View and edit configuration')
  .option('-g, --global', 'Use global configuration')
  .option('-p, --project', 'Use project-specific configuration')
  .option('-i, --init', 'Initialize a default configuration file')
  .option('-k, --key <key>', 'Configuration key to get or set (dot notation)')
  .option('-v, --value <value>', 'Value to set for the key (JSON format)')
  .option('-d, --delete', 'Delete the specified key')
  .action(async (options) => {
    try {
      // Initialize config if needed
      initializeConfig();

      // Determine if we're dealing with global or project config
      // Default to global if neither is specified
      const isGlobal = options.global || (!options.project && !options.global);
      const configPath = isGlobal ? getGlobalConfigPath() : getProjectConfigPath();
      const configType = isGlobal ? 'global' : 'project';

      // Initialize a default configuration file if requested
      if (options.init) {
        createDefaultConfig(isGlobal);
        console.log(`Initialized default ${configType} configuration at ${configPath}`);
        return;
      }

      // If no key is provided, display the entire configuration
      if (!options.key) {
        const config = isGlobal
          ? fs.existsSync(getGlobalConfigPath())
            ? JSON.parse(fs.readFileSync(getGlobalConfigPath(), 'utf8'))
            : {}
          : fs.existsSync(getProjectConfigPath())
            ? JSON.parse(fs.readFileSync(getProjectConfigPath(), 'utf8'))
            : {};

        console.log(`Current ${configType} configuration:`);
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      // Handle key operations (get, set, delete)
      const keyParts = options.key.split('.');

      // If no value is provided and not deleting, display the current value
      if (!options.value && !options.delete) {
        // Read the config directly from file
        const config = isGlobal
          ? fs.existsSync(getGlobalConfigPath())
            ? JSON.parse(fs.readFileSync(getGlobalConfigPath(), 'utf8'))
            : {}
          : fs.existsSync(getProjectConfigPath())
            ? JSON.parse(fs.readFileSync(getProjectConfigPath(), 'utf8'))
            : {};

        // Navigate to the specified key
        let currentValue = config;
        for (const part of keyParts) {
          if (currentValue === undefined || currentValue === null) {
            currentValue = undefined;
            break;
          }
          currentValue = currentValue[part];
        }

        if (currentValue === undefined) {
          console.log(`Key '${options.key}' not found in ${configType} configuration`);
        } else {
          console.log(`${options.key} = ${JSON.stringify(currentValue, null, 2)}`);
        }
        return;
      }

      // Set or delete a value
      if (options.delete) {
        // Create an object with the key path set to undefined
        // which will cause it to be removed when merged
        const deleteObj: Record<string, any> = {};
        let current = deleteObj;

        for (let i = 0; i < keyParts.length - 1; i++) {
          current[keyParts[i]] = {};
          current = current[keyParts[i]];
        }

        current[keyParts[keyParts.length - 1]] = undefined;

        if (isGlobal) {
          updateGlobalConfig(deleteObj);
        } else {
          updateProjectConfig(deleteObj);
        }

        console.log(`Deleted key '${options.key}' from ${configType} configuration`);
      } else {
        // Set the value
        let value;
        try {
          // Try to parse as JSON
          value = JSON.parse(options.value);
        } catch {
          // If not valid JSON, use as string
          value = options.value;
        }

        // Create an object with the specified key path
        const setObj: Record<string, any> = {};
        let current = setObj;

        for (let i = 0; i < keyParts.length - 1; i++) {
          current[keyParts[i]] = {};
          current = current[keyParts[i]];
        }

        current[keyParts[keyParts.length - 1]] = value;

        if (isGlobal) {
          updateGlobalConfig(setObj);
        } else {
          updateProjectConfig(setObj);
        }

        console.log(`Set ${options.key} = ${JSON.stringify(value)} in ${configType} configuration`);
      }
    } catch (error) {
      console.error('Error managing configuration:', (error as Error).message);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// If no command is provided, display help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
