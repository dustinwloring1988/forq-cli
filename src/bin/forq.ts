#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { startRepl } from '../repl';

// Read package.json for version
const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const program = new Command();

program.name('forq').description('Terminal-based AI Coding Agent').version(packageJson.version);

// Implement the REPL command
program
  .command('repl')
  .description('Start an interactive REPL session')
  .action(() => {
    console.log('Starting REPL session...');
    startRepl();
  });

// Parse command line arguments
program.parse(process.argv);

// If no command is provided, display help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
