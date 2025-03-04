# Forq CLI

A terminal-based AI coding agent powered by Anthropic's Claude and OpenAI models, designed to assist with coding tasks directly from your terminal.

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- API key for Anthropic Claude and/or OpenAI (depending on which model you want to use)

### Install from npm

```bash
# Install globally
npm install -g forq-cli

# Or, use npx
npx forq-cli
```

### Install from source

```bash
# Clone the repository
git clone https://github.com/yourusername/forq-cli.git
cd forq-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link it globally (optional)
npm link
```

## Configuration

Before using Forq, you need to set up your API keys:

1. Create a `.env` file in your project root or copy from the example:

```bash
cp .env.example .env
```

2. Add your API keys to the `.env` file:

```
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
```

3. Initialize the configuration:

```bash
forq config --init
```

### Configuration Options

Forq supports both global and project-specific configurations:

- Global configuration: `~/.forqrc.json`
- Project configuration: `.forqrc.json` in your project directory

View current configuration:

```bash
# View global config
forq config --global

# View project config
forq config --project
```

Set configuration values:

```bash
# Set API key in global config
forq config --global --key apiKeys.anthropic --value "your-api-key"

# Set preferred model
forq config --global --key preferences.model --value "claude-3-opus-20240229"
```

## Usage

### Starting a REPL Session

```bash
# Start an interactive REPL session
forq repl
```

### REPL Commands

Within the REPL, you can use these special commands:

- `/help` - Show available commands
- `/clear` - Clear the conversation history
- `/exit` - Exit the REPL

### Command Line Tools

```bash
# View logs
forq log --type actions
forq log --type error --lines 50

# View and edit configuration
forq config --global
forq config --project --key allowedTools --value '["bash", "listDir"]'
```

## Project-Specific Instructions

You can add project-specific instructions by creating a `FORQ.md` file in your project root. This file will be read when Forq is started in the project directory, providing context to the AI about your project.

## Examples

Example of using Forq to analyze code:

```bash
# In your project directory
forq repl
> Analyze the current project structure and suggest improvements
```

## Documentation

For more detailed documentation, see the [docs](./docs) directory:

- [Tool Overview](./docs/tool-overview.md)
- [Technical Details](./docs/technical-details.md)
- [Semantic Search](./docs/semantic-search.md)

## License

ISC
