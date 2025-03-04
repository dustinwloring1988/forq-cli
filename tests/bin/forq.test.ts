import { jest } from '@jest/globals';

// Save original process.argv
const originalProcessArgv = process.argv;

// Mock the commander package
jest.mock('commander', () => {
  const mockCommand: any = {
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    version: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    action: jest.fn().mockImplementation((callback): any => {
      mockCommand.actionCallback = callback;
      return mockCommand;
    }),
    parse: jest.fn(),
    outputHelp: jest.fn(),
    actionCallback: null,
  };

  return {
    Command: jest.fn().mockImplementation(() => mockCommand),
  };
});

// Mock fs and path
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({ version: '1.0.0' })),
  existsSync: jest.fn().mockReturnValue(true),
}));

// Mock the startRepl function
jest.mock('../../src/repl', () => ({
  startRepl: jest.fn(),
}));

// Mock the config utility functions
jest.mock('../../src/utils/config', () => ({
  getGlobalConfigPath: jest.fn(),
  getProjectConfigPath: jest.fn(),
  getConfig: jest.fn(),
  updateGlobalConfig: jest.fn(),
  updateProjectConfig: jest.fn(),
  createDefaultConfig: jest.fn(),
  initializeConfig: jest.fn(),
}));

describe('CLI Command Tests', () => {
  beforeEach(() => {
    jest.resetModules();
    // Override process.argv to simulate running with a command
    Object.defineProperty(process, 'argv', {
      value: ['node', '/path/to/forq', 'repl'],
      writable: true,
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    // Restore original process.argv
    Object.defineProperty(process, 'argv', {
      value: originalProcessArgv,
      writable: true,
    });
    jest.restoreAllMocks();
  });

  it('should initialize the CLI with correct name, description and version', async () => {
    // We need to require the module after mocking
    require('../../src/bin/forq');

    const { Command } = require('commander');
    const mockCommandInstance = Command.mock.results[0].value;

    expect(mockCommandInstance.name).toHaveBeenCalledWith('forq');
    expect(mockCommandInstance.description).toHaveBeenCalledWith('Terminal-based AI Coding Agent');
    expect(mockCommandInstance.version).toHaveBeenCalledWith('1.0.0');
  });

  it('should define the repl command', async () => {
    // We need to require the module after mocking
    require('../../src/bin/forq');

    const { Command } = require('commander');
    const mockCommandInstance = Command.mock.results[0].value;

    expect(mockCommandInstance.command).toHaveBeenCalledWith('repl');
    expect(mockCommandInstance.description).toHaveBeenCalledWith(
      'Start an interactive REPL session',
    );
  });
});
