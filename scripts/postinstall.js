#!/usr/bin/env node

/**
 * Forq CLI - Post-installation script
 * Helps users with common installation issues
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

console.log(`\n${colors.bright}${colors.cyan}Forq CLI${colors.reset} - Installation Check`);
console.log(`${colors.dim}=====================================${colors.reset}\n`);

try {
  // Check if this is a global installation
  const isGlobalInstall = process.env.npm_config_global === 'true';

  if (isGlobalInstall) {
    console.log(`${colors.green}✓${colors.reset} Installing globally\n`);

    // Get npm's global prefix
    let npmPrefix;
    try {
      npmPrefix = execSync('npm config get prefix').toString().trim();
      console.log(`${colors.blue}ℹ${colors.reset} npm global prefix: ${npmPrefix}`);
    } catch (error) {
      console.log(
        `${colors.yellow}⚠${colors.reset} Could not determine npm prefix: ${error.message}`,
      );
    }

    // Check if npm bin is in PATH
    if (npmPrefix) {
      const binPath = path.join(npmPrefix, 'bin');
      const isInPath = process.env.PATH?.includes(npmPrefix) || process.env.PATH?.includes(binPath);

      if (isInPath) {
        console.log(`${colors.green}✓${colors.reset} npm bin directory is in your PATH\n`);
      } else {
        console.log(
          `\n${colors.yellow}⚠${colors.reset} ${colors.bright}npm bin directory not found in PATH${colors.reset}`,
        );
        console.log(
          `${colors.yellow}⚠${colors.reset} You may not be able to run 'forq' directly\n`,
        );

        // Suggest PATH fix based on shell
        const shell = path.basename(process.env.SHELL || '');
        const homeDir = os.homedir();

        let rcFile;
        if (shell === 'bash') {
          rcFile = path.join(homeDir, '.bashrc');
        } else if (shell === 'zsh') {
          rcFile = path.join(homeDir, '.zshrc');
        }

        console.log(
          `${colors.blue}ℹ${colors.reset} To fix this, add the following to your ${rcFile || 'shell profile'}:`,
        );
        console.log(`\n   ${colors.bright}export PATH="${binPath}:$PATH"${colors.reset}\n`);
        console.log(
          `${colors.blue}ℹ${colors.reset} After adding this line, run: ${colors.bright}source ${rcFile || 'your-profile-file'}${colors.reset}\n`,
        );

        console.log(
          `${colors.blue}ℹ${colors.reset} In the meantime, you can run Forq using the full path:`,
        );
        console.log(`\n   ${colors.bright}${binPath}/forq repl${colors.reset}\n`);
      }
    }
  }

  console.log(`${colors.bright}${colors.green}Thank you for installing Forq CLI!${colors.reset}`);
  console.log(
    `${colors.blue}ℹ${colors.reset} To get started, run: ${colors.bright}forq repl${colors.reset}`,
  );
  console.log(
    `${colors.blue}ℹ${colors.reset} For diagnostics, run: ${colors.bright}forq diagnose${colors.reset}\n`,
  );
} catch (error) {
  console.error(`${colors.red}Error during post-install check:${colors.reset}`, error);
}
