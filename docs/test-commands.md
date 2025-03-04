### Basic REPL Commands

1. `/help` - Check if help command works and displays available commands
2. `/clear` - Test if the screen clears
3. `/version` - Check if version information is displayed (if implemented)

### Simple AI Interactions

4. `Hello world` - Test basic AI response
5. `What can you help me with?` - Check if AI describes its capabilities

### File System Operations

6. `List the files in the current directory` - Test if listDir tool works
7. `Show me the package.json file` - Test if readFile tool works

### Search Functionality

8. `Find files containing "repl"` - Test content search with ripgrepSearch
9. `Search for files named "config"` - Test fileSearch functionality

### File Manipulations (Test in a safe directory)

10. `Create a file called test.txt with the content "Hello, this is a test"` - Test file creation
11. `Read the test.txt file` - Verify the file was created properly
12. `Edit test.txt to say "Updated content for testing"` - Test file editing
13. `Delete test.txt` - Test file deletion

### Bash Commands

14. `Run the command ls -la` - Test basic command execution
15. `Run pwd to show current directory` - Test environment persistence

### Context and Help

16. `What is the current project structure?` - Test if it understands the context
17. `Help me understand how the tool system works in this codebase` - Test code analysis

### Complex Interactions

18. `Find all files that import the Tool interface and explain how they use it` - Test semantic search and code analysis
19. `Create a simple "hello world" function in a new file called hello.js and then run it` - Test multi-step task
