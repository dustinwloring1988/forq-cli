# Forq CLI Commands

This document provides detailed information about all available Forq CLI commands, their options, and example usage.

## Table of Contents

- [repl](#repl) - Start an interactive REPL session
- [log](#log) - View application logs
- [config](#config) - View and edit configuration
- [help](#help) - Display help information

## repl

Start an interactive REPL (Read-Eval-Print Loop) session with the AI coding agent.

### Usage

```bash
forq repl
```

### Description

The `repl` command starts an interactive session where you can communicate with the AI assistant. The assistant can help with coding tasks, answer questions, and execute various tools to analyze and modify code.

When you start a REPL session, Forq automatically:

1. Loads your configuration from global and project-specific config files
2. Collects context about your project (if started in a project directory)
3. Reads project-specific instructions from `FORQ.md` if present
4. Initializes the AI with the system prompt and context

### Special REPL Commands

Within the REPL session, you can use these special commands:

- `/help` - Display available REPL commands
- `/clear` - Clear the conversation history
- `/exit` or `/quit` - Exit the REPL session
- `/compact` - Compact conversation history to save tokens

## log

View logs from the application.

### Usage

```bash
forq log [options]
```

### Options

| Option                 | Description                                                   | Default   |
| ---------------------- | ------------------------------------------------------------- | --------- |
| `-t, --type <type>`    | Type of log to view (actions, error, conversation, analytics) | `actions` |
| `-n, --lines <number>` | Number of lines to display                                    | `20`      |
| `-a, --all`            | Show all log entries                                          | -         |

### Description

The `log` command allows you to view different types of logs generated by Forq:

- `actions` - Tool executions and AI actions
- `error` - Error logs with stack traces
- `conversation` - Complete conversation history with the AI
- `analytics` - Usage analytics and session information

Logs are stored in the `logs/` directory in your current working directory.

### Examples

```bash
# View the last 20 action logs (default)
forq log

# View the last 50 error logs
forq log --type error --lines 50

# View all conversation logs
forq log --type conversation --all
```

## config

View and edit configuration.

### Usage

```bash
forq config [options]
```

### Options

| Option                | Description                                    |
| --------------------- | ---------------------------------------------- |
| `-g, --global`        | Use global configuration                       |
| `-p, --project`       | Use project-specific configuration             |
| `-i, --init`          | Initialize a default configuration file        |
| `-k, --key <key>`     | Configuration key to get or set (dot notation) |
| `-v, --value <value>` | Value to set for the key (JSON format)         |
| `-d, --delete`        | Delete the specified key                       |

### Description

The `config` command lets you view and modify Forq's configuration settings. Forq uses a hierarchical configuration system:

1. Global configuration: `~/.forqrc.json`
2. Project configuration: `.forqrc.json` in your project directory

Project-specific settings override global settings.

### Examples

```bash
# Initialize global configuration
forq config --global --init

# View entire global configuration
forq config --global

# Set API key in global config
forq config --global --key apiKeys.anthropic --value "your-api-key"

# View a specific config value
forq config --project --key allowedTools

# Delete a config key
forq config --global --key preferences.theme --delete
```

### Configuration Structure

The configuration files use JSON format and support these main sections:

```json
{
  "apiKeys": {
    "anthropic": "your-anthropic-api-key",
    "openai": "your-openai-api-key"
  },
  "preferences": {
    "model": "claude-3-opus-20240229",
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "allowedTools": ["listDir", "readFile", "semanticSearch"],
  "permissions": {
    "bash": {
      "allowed": true,
      "bannedCommands": ["rm -rf", "sudo"]
    }
  }
}
```

## help

Display help information for Forq commands.

### Usage

```bash
forq --help
forq [command] --help
```

### Examples

```bash
# Show general help
forq --help

# Show help for the config command
forq config --help
```
