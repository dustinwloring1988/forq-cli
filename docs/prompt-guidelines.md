# Prompt Guidelines and Best Practices

This document provides guidelines for crafting effective prompts when using Forq CLI, to get the most out of the AI assistant.

## Table of Contents

- [Prompt Basics](#prompt-basics)
- [Task-Specific Prompts](#task-specific-prompts)
- [Using Context Effectively](#using-context-effectively)
- [Project-Specific Instructions](#project-specific-instructions)
- [Troubleshooting](#troubleshooting)

## Prompt Basics

### Be Clear and Specific

The more specific your prompt, the better the AI can assist you. Compare these examples:

```
❌ "Fix my code"
✅ "Find and fix the memory leak in the cacheManager.ts file"
```

### Provide Context

When relevant, include information about:

- Programming language and framework
- Project structure or architecture
- Specific requirements or constraints

```
❌ "How do I implement authentication?"
✅ "How do I implement JWT authentication in an Express.js API with MongoDB?"
```

### Break Down Complex Tasks

For complex tasks, break them down into smaller, manageable steps:

```
❌ "Build me a complete e-commerce system"
✅ "Let's build an e-commerce system step by step. First, let's design the product model schema."
```

## Task-Specific Prompts

### Code Analysis

```
"Analyze the code in src/utils/validation.ts and suggest improvements for performance and readability."

"Review the error handling in the API routes and suggest a more consistent approach."
```

### Debugging

```
"I'm getting this error: 'TypeError: Cannot read properties of undefined (reading 'map')' in the UserList component. Help me debug it."

"The test for the authentication middleware is failing with this output: [error output]. Help me fix the test."
```

### Implementation

```
"Help me implement a rate limiting middleware for my Express API."

"I need to add pagination to this MongoDB query in the userService.ts file."
```

### Learning and Explanation

```
"Explain how the useEffect hook in React works, with examples of common use cases and pitfalls."

"Help me understand the difference between Promise.all and Promise.allSettled with practical examples."
```

## Using Context Effectively

Forq automatically gathers context about your project when you start a REPL session. You can enhance this context by:

### Referencing Files and Directories

```
"What does the function in src/utils/formatter.ts do?"

"Show me all the API routes defined in the src/routes directory."
```

### Providing Error Messages

When dealing with errors, provide the complete error message:

```
"I'm getting this error when running the tests:
Error: Expected { received: false } to equal { received: true }
at Object.<anonymous> (tests/auth.test.js:45:10)"
```

### Mentioning Related Components

```
"The UserProfile component needs to fetch data from the userService. How should I connect them?"
```

## Project-Specific Instructions

You can create a `FORQ.md` file in your project root to provide persistent context about your project. This file should include:

### Project Overview

```markdown
# Project: E-commerce API

A REST API for an e-commerce platform built with Node.js, Express, and MongoDB.
```

### Architecture and Structure

```markdown
## Architecture

- Routes: Express routes in `/src/routes`
- Controllers: Business logic in `/src/controllers`
- Models: MongoDB schemas in `/src/models`
- Middleware: Express middleware in `/src/middleware`
- Utils: Helper functions in `/src/utils`
```

### Standards and Conventions

```markdown
## Coding Standards

- Use TypeScript for all files
- Follow ESLint configuration
- Use async/await for asynchronous operations
- Use repository pattern for database operations
```

### Example FORQ.md Template

```markdown
# Project: [Project Name]

[Brief description of the project]

## Architecture

[Explain the project architecture and file structure]

## Key Technologies

- [Technology 1]
- [Technology 2]
- [Technology 3]

## Coding Standards

[List coding standards and conventions]

## Development Workflow

[Explain the development process, testing approach, etc.]

## Known Issues or Limitations

[List any known issues or limitations of the project]
```

## Troubleshooting

### If the AI Seems Confused

1. Clear the conversation history with `/clear` and start fresh
2. Provide more specific information about what you need
3. Break down your request into smaller, more manageable pieces

### If the AI Makes Mistakes

1. Correct the AI: "That's not right. The issue is actually X, not Y."
2. Ask for alternatives: "Can you suggest a different approach?"
3. Request explanations: "Can you explain why this solution would work?"

### If the AI Generates Incorrect Code

1. Point out the specific issues: "The code has an error in the fetch callback function."
2. Ask for a step-by-step explanation of the code
3. Request testing or validation steps
