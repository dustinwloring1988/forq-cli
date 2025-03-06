# Forq CLI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/kleneway/forq-cli)](https://github.com/kleneway/forq-cli/issues)

A terminal-based AI coding agent powered by Anthropic's Claude and OpenAI models, designed to assist with coding tasks directly from your terminal.

## Video Walkthrough

This repository was built as part of my "Let's Build Cursor" AI Coding tutorial series. 

[Watch the Full Video](https://youtu.be/gvpxq1hqzXY)

[See the Final Working Coding Agent Add Tests](https://youtu.be/gvpxq1hqzXY?si=vKs9F6iRx1799A_c&t=3346)

## Installation 
#### ⚠️ Important Note
I built this mostly for educational purposes and have not tested these steps! Please let me know if these work for you and ideally submit a PR to update these instructions. 🙏

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- API key for Anthropic Claude and OpenAI (OpenAI key is optional, only used for semantic search embeddings)

### Install from npm

```bash
# Install globally
npm install -g forq-cli

# Verify installation
forq --version

# Start the REPL
forq repl
```

### Install from source

```bash
# Clone the repository
git clone https://github.com/kleneway/forq-cli.git
cd forq-cli

# Install dependencies
npm install

# Build the project
npm run build

# Install globally
npm run global-install
# OR
npm install -g .
```

### Troubleshooting Installation

If you encounter issues with global installation:

1. **Command not found after installation**:

   - Check your global npm directory is in your PATH:

     ```bash
     # Find npm global prefix
     npm config get prefix

     # Make sure the bin directory under this path is in your PATH
     echo $PATH
     ```

   - Add the npm bin directory to your PATH if needed:

     ```bash
     # For bash (add to .bashrc or .bash_profile)
     export PATH="$(npm config get prefix)/bin:$PATH"

     # For zsh (add to .zshrc)
     export PATH="$(npm config get prefix)/bin:$PATH"
     ```

2. **Permission issues**:

   ```bash
   # Install with sudo (if necessary)
   sudo npm install -g forq-cli
   ```

3. **Running without installing**:

   ```bash
   # Run directly using npx
   npx forq-cli repl

   # Or use the provided shell wrapper (from source)
   ./bin/forq repl
   ```

4. **Using the diagnostic tool**:
   ```bash
   # Check installation and environment
   forq diagnose
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
forq config --global --key preferences.model --value "claude-3-7-sonnet-20250219"
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

- [Test Commands to Try](./docs/test-commands.md)
- [CLI Command Overview](./docs/cli-commands.md)
- [Config Example - similar to cursorrules](./docs/FORQ.md.example)
- [Example Workflows](./docs/example-workflows.md)

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
