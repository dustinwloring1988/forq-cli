#!/usr/bin/env node

// Check if running in self mode
if (process.argv.includes('self')) {
  process.env.SELF_MODE = 'true';
}

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
import { MCPServer } from '../server/mcp';

// Read package.json for version
const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const program = new Command();

program.name('forq').description('Terminal-based AI Coding Agent').version(packageJson.version);

// Help content for each command
const helpContent: Record<string, string> = {
  repl: `
DESCRIPTION
  Start an interactive REPL (Read-Eval-Print Loop) session with Forq.
  
  The REPL provides an interactive environment where you can communicate with 
  the AI assistant to help with various coding tasks.

USAGE
  $ forq repl

SPECIAL COMMANDS
  /help    - Show available REPL commands
  /clear   - Clear the conversation history
  /exit    - Exit the REPL session
  /compact - Compact conversation history to save tokens

EXAMPLES
  $ forq repl
  > Analyze the current project structure
  > Help me fix the bug in src/utils/parser.ts
  > Create a new React component for user profile
`,

  self: `
DESCRIPTION
  Start an interactive session in self-hosted mode using Ollama.
  
  This mode uses locally running Ollama models for all AI operations,
  which provides enhanced privacy and offline capabilities.

USAGE
  $ forq self [OPTIONS]

OPTIONS
  -v, --verbose       Enable verbose output (including debug information)

SPECIAL COMMANDS
  /help    - Show available commands
  /clear   - Clear the conversation history
  /exit    - Exit the session
  /compact - Compact conversation history to save tokens

EXAMPLES
  $ forq self
  $ forq self --verbose
`,

  log: `
DESCRIPTION
  View logs from the application.

USAGE
  $ forq log [OPTIONS]

OPTIONS
  -t, --type <type>    Type of log to view. Options: actions, error, conversation, analytics
                       Default: actions
  -n, --lines <number> Number of lines to display
                       Default: 20
  -a, --all            Show all log entries

EXAMPLES
  $ forq log
  $ forq log --type error
  $ forq log --type conversation --lines 50
  $ forq log --type analytics --all
`,

  config: `
DESCRIPTION
  View and edit configuration settings.

USAGE
  $ forq config [OPTIONS]

OPTIONS
  -g, --global         Use global configuration (~/.forqrc.json)
  -p, --project        Use project-specific configuration (.forqrc.json)
  -i, --init           Initialize a default configuration file
  -k, --key <key>      Configuration key to get or set (dot notation)
  -v, --value <value>  Value to set for the key (JSON format)
  -d, --delete         Delete the specified key

EXAMPLES
  $ forq config --global --init
  $ forq config --global
  $ forq config --project --key apiKeys.anthropic --value "your-api-key"
  $ forq config --global --key preferences.theme --delete
`,

  mcp: `
DESCRIPTION
  Start the MCP (Message Control Protocol) server for external client connections.
  
  The MCP server allows external clients to connect and interact with Forq
  through a WebSocket connection, enabling integration with other tools and
  applications.

USAGE
  $ forq mcp [OPTIONS]

OPTIONS
  -p, --port <number>  Port to listen on (default: 3000)
  -h, --host <string>  Host to listen on (default: localhost)

EXAMPLES
  $ forq mcp
  $ forq mcp --port 8080 --host 0.0.0.0
`,
};

// Function to display detailed help for a command
function displayDetailedHelp(command: string): void {
  if (helpContent[command]) {
    console.log(helpContent[command]);
  } else {
    console.log(`No detailed help available for '${command}'. Try 'forq --help' for general help.`);
  }
}

// Implement the help command
program
  .command('help [command]')
  .description('Display detailed help for a specific command')
  .action((command: string | undefined) => {
    if (command) {
      displayDetailedHelp(command);
    } else {
      program.outputHelp();
    }
  });

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

// Implement the self command
program
  .command('self')
  .description('Start self-hosted mode using Ollama')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (options) => {
    console.log('Initializing self-hosted mode...');
    try {
      // Dynamically import the self mode module to avoid circular dependencies
      const { startSelfMode } = await import('../modes/self');
      await startSelfMode(options);
    } catch (error) {
      console.error('Error in self-hosted mode:', (error as Error).message);
      process.exit(1);
    }
  });

// Implement the log command
program
  .command('log')
  .description('View logs from the application')
  .option(
    '-t, --type <type>',
    'Type of log to view (actions, error, conversation, analytics)',
    'actions',
  )
  .option('-n, --lines <number>', 'Number of lines to display', '20')
  .option('-a, --all', 'Show all log entries')
  .action(async (options) => {
    try {
      const logDir = path.join(process.cwd(), 'logs');

      // Ensure logs directory exists
      if (!fs.existsSync(logDir)) {
        console.error('No logs found. Run a REPL session first.');
        return;
      }

      // Map log type to file
      const logTypes: Record<string, string> = {
        actions: 'actions.log',
        error: 'error.log',
        conversation: 'conversation.log',
        analytics: 'analytics.log',
      };

      const logType = options.type.toLowerCase();
      if (!logTypes[logType]) {
        console.error(`Unknown log type: ${logType}`);
        console.error(`Available types: ${Object.keys(logTypes).join(', ')}`);
        return;
      }

      const logFile = path.join(logDir, logTypes[logType]);

      if (!fs.existsSync(logFile)) {
        console.error(`No ${logType} log file found.`);
        return;
      }

      // Read the log file
      const logContent = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);

      // Determine number of lines to display
      const numLines = options.all ? logContent.length : parseInt(options.lines, 10);

      // Display the log content (last N lines)
      const linesToShow = logContent.slice(-numLines);

      console.log(`Showing the last ${linesToShow.length} entries from ${logType} log:\n`);
      for (const line of linesToShow) {
        console.log(line);
      }
    } catch (error) {
      console.error('Error viewing logs:', (error as Error).message);
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

// Implement the MCP server command
program
  .command('mcp')
  .description('Start the MCP server for external client connections')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .option('-h, --host <string>', 'Host to listen on', 'localhost')
  .action(async (options) => {
    console.log('Starting MCP server...');
    try {
      const server = new MCPServer({
        port: parseInt(options.port, 10),
        host: options.host
      });

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\nShutting down MCP server...');
        server.stop();
        process.exit(0);
      });

      console.log(`MCP server running on ws://${options.host}:${options.port}`);
    } catch (error) {
      console.error('Error starting MCP server:', (error as Error).message);
      process.exit(1);
    }
  });

// Add a diagnostic command
program
  .command('diagnose')
  .description('Run diagnostics to check installation and environment')
  .action(() => {
    console.log('\nForq CLI Diagnostics');
    console.log('===================\n');

    console.log(`Version: ${packageJson.version}`);
    console.log(`Node version: ${process.version}`);
    console.log(`Platform: ${process.platform} (${process.arch})`);

    console.log('\nEnvironment:');
    console.log(`  HOME: ${process.env.HOME}`);
    console.log(`  PATH: ${process.env.PATH}`);

    console.log('\nNPM Configuration:');
    try {
      const { execSync } = require('child_process');
      const npmPrefix = execSync('npm config get prefix').toString().trim();
      console.log(`  npm prefix: ${npmPrefix}`);
      console.log(`  npm bin location: ${npmPrefix}/bin`);

      // Check if npm bin is in PATH
      const isInPath = process.env.PATH?.includes(npmPrefix);
      console.log(`  npm bin in PATH: ${isInPath ? 'Yes' : 'No'}`);

      if (!isInPath) {
        console.log('\nWarning: npm bin directory not found in PATH');
        console.log(
          'To fix this, add the following to your shell profile (.bashrc, .zshrc, etc.):',
        );
        console.log(`  export PATH="${npmPrefix}/bin:$PATH"`);
      }
    } catch (error) {
      console.log(`  Error getting npm config: ${(error as Error).message}`);
    }

    console.log('\nBinary Location:');
    console.log(`  Package location: ${__dirname}`);

    console.log('\nAPI Configuration:');
    const globalConfigPath = getGlobalConfigPath();
    console.log(`  Global config path: ${globalConfigPath}`);
    console.log(`  Global config exists: ${fs.existsSync(globalConfigPath) ? 'Yes' : 'No'}`);

    const projectConfigPath = getProjectConfigPath();
    console.log(`  Project config path: ${projectConfigPath}`);
    console.log(`  Project config exists: ${fs.existsSync(projectConfigPath) ? 'Yes' : 'No'}`);

    if (!fs.existsSync(globalConfigPath) && !fs.existsSync(projectConfigPath)) {
      console.log('\nNo configuration files found. To create a default configuration, run:');
      console.log('  forq config --global --init');
    }

    console.log('\nAvailable Commands:');
    console.log('  forq repl             Start an interactive REPL session');
    console.log('  forq config           View or edit configuration');
    console.log('  forq log              View application logs');
    console.log('  forq help             Display help for a command');
  });

// Parse command line arguments
program.parse(process.argv);

// If no command is provided, display help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
