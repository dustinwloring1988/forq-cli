Here's your complete and meticulously detailed **`technical-details.md`** file containing all the necessary code snippets, structured tool definitions, prompts, and TypeScript best practices needed to implement the tasks on the detailed task list. This file is designed as a single source of truth that your AI coding agent can reference directly.

---

# 📘 Technical Details Reference (`technical-details.md`)

## 📁 Project Folder Structure
```plaintext
forq-cli/
├── bin/
│   └── forq.ts
├── config/
│   ├── systemPrompt.ts
│   ├── session-permissions.json
│   ├── .forqrc.json
├── src/
│   ├── cli/
│   │   └── repl.ts
│   ├── tools/
│   │   ├── Tool.ts
│   │   ├── bash.ts
│   │   ├── readFile.ts
│   │   ├── editFile.ts
│   │   ├── listDir.ts
│   │   ├── createFile.ts
│   │   ├── deleteFile.ts
│   │   ├── fileSearch.ts
│   │   ├── ripgrepSearch.ts
│   │   └── semanticSearch.ts
│   ├── utils/
│   │   ├── permissions.ts
│   │   └── logger.ts
│   ├── api/
│   │   └── ai.ts
│   └── types/
│       └── index.ts
├── logs/
│   ├── actions.log
│   ├── conversation.log
│   └── error.log
├── tests/
│   └── [unit tests here]
├── .env
├── .gitignore
├── tsconfig.json
├── package.json
├── package-lock.json
└── README.md
```

---

## 🛠️ Core Interfaces and Types

### `Tool` Interface (`src/tools/Tool.ts`)
```typescript
export interface Tool<Input, Output> {
  name: string;
  description: (input: Input) => string;
  execute: (input: Input, context: ToolContext) => Promise<Output>;
  validateInput?: (input: Input) => Promise<boolean>;
  requiresPermissions: boolean;
}

export interface ToolContext {
  permissions: PermissionManager;
  logger: Logger;
  cwd: string;
}
```

---

## 🖥️ CLI Entry Point (`bin/forq.ts`)
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { startRepl } from '../src/cli/repl';

const program = new Command();

program
  .name('forq')
  .description('Terminal-based AI Coding Assistant')
  .version('0.1.0');

program
  .command('repl')
  .description('Start interactive coding assistant session')
  .action(() => {
    startRepl().catch(console.error);
  });

program.parse(process.argv);
```

---

## 💬 Interactive REPL (`src/cli/repl.ts`)
```typescript
import readline from 'readline';
import { queryAI } from '../api/ai';
import { loadSystemPrompt } from '../../config/systemPrompt';
import { logger } from '../utils/logger';

export async function startRepl() {
  const systemPrompt = loadSystemPrompt();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '🦾 forq › ',
  });

  logger.log('REPL session started.');
  rl.prompt();

  rl.on('line', async (line) => {
    if (line.trim() === '/exit') {
      rl.close();
      return;
    }
    const userMessage = { role: 'user', content: line.trim() };
    const response = await queryAI([systemPrompt, userMessage]);
    console.log(`🤖: ${response}`);
    logger.log(`User: ${line.trim()}\nAI: ${response}`);
    rl.prompt();
  }).on('close', () => {
    logger.log('REPL session ended.');
    process.exit(0);
  });
}
```

---

## 🧠 System Prompt (`config/systemPrompt.ts`)
```typescript
export function loadSystemPrompt() {
  return {
    role: 'system',
    content: `You are Forq, a powerful, concise, and secure AI coding assistant for the terminal. 
    Follow the user's instructions exactly. Be brief, professional, and accurate. 
    Always verify permissions before performing filesystem or shell actions. 
    Refuse to execute dangerous or malicious commands.`
  };
}
```

---

## 📡 AI API Integration (`src/api/ai.ts`)
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface Message {
  role: 'user' | 'system' | 'assistant';
  content: string;
}

export async function queryAI(messages: Message[]): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 1000,
    messages,
  });
  return response.content[0].text;
}
```

---

## 📁 Example File System Tool (`src/tools/readFile.ts`)
```typescript
import fs from 'fs/promises';
import { Tool, ToolContext } from './Tool';

export const readFileTool: Tool<{ filePath: string }, string> = {
  name: 'readFile',
  description: ({ filePath }) => `Read content from ${filePath}`,
  requiresPermissions: true,
  execute: async ({ filePath }, context: ToolContext) => {
    if (!context.permissions.canRead(filePath)) {
      throw new Error('Permission denied.');
    }
    const content = await fs.readFile(filePath, 'utf-8');
    context.logger.log(`readFile executed: ${filePath}`);
    return content;
  },
};
```

---

## 🛡️ Permission Manager (`src/utils/permissions.ts`)
```typescript
import path from 'path';

export class PermissionManager {
  private readAllowed = new Set<string>();
  private writeAllowed = new Set<string>();

  constructor(private baseDir: string) {}

  grantRead(directory: string) {
    this.readAllowed.add(path.resolve(this.baseDir, directory));
  }

  grantWrite(directory: string) {
    this.writeAllowed.add(path.resolve(this.baseDir, directory));
  }

  canRead(filePath: string): boolean {
    const resolved = path.resolve(this.baseDir, filePath);
    return Array.from(this.readAllowed).some((dir) => resolved.startsWith(dir));
  }

  canWrite(filePath: string): boolean {
    const resolved = path.resolve(this.baseDir, filePath);
    return Array.from(this.writeAllowed).some((dir) => resolved.startsWith(dir));
  }
}
```

---

## 🔎 Semantic Search Stub (`src/tools/semanticSearch.ts`)
```typescript
import { Tool, ToolContext } from './Tool';

export const semanticSearchTool: Tool<{ query: string }, string[]> = {
  name: 'semanticSearch',
  description: ({ query }) => `Semantically search codebase for: "${query}"`,
  requiresPermissions: false,
  execute: async ({ query }, context: ToolContext) => {
    context.logger.log(`semanticSearch executed with query: ${query}`);
    // Stub implementation, replace with real embedding model.
    return ['src/example1.ts', 'src/example2.ts'];
  },
};
```

---

## 🔐 Environment Configuration (`.env`)
```dotenv
ANTHROPIC_API_KEY=your-secure-api-key-here
```

---

## 📝 TypeScript Best Practices
- Always use explicit types; avoid `any`.
- Enable strict mode in `tsconfig.json`.
- Consistently handle errors with try-catch blocks.
- Ensure thorough input validation for all tools.
- Write unit tests covering all edge cases.

---

## ✅ Definition of Done (For each implementation task)
- Code is clean, well-structured, and adheres to ESLint and Prettier standards.
- Each function has clear TypeScript types and JSDoc comments.
- Tool implementations strictly verify permissions and validate input.
- All AI interactions handle API errors gracefully.
- Complete unit tests provided for all functionality.
- Documentation updated alongside code changes.

---

**This detailed `technical-details.md` document contains all the core logic, implementation guidance, and standards necessary for your AI coding agent to autonomously and accurately execute the development tasks outlined in your action list.**