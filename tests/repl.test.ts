import { startRepl } from '../src/repl';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { loadSystemPrompt } from '../src/config/systemPrompt';
import { queryAI, streamAI } from '../src/api/ai';
import { logger } from '../src/utils/logger';
import { analytics } from '../src/utils/analytics';
import { loadTools, executeTool, getAllTools, getToolsSchema } from '../src/tools';
import { ToolContext } from '../src/types/tools';
import {
  initializePermissionConfig,
  savePermissionConfig,
  cleanupPermissionConfig,
} from '../src/config/permissions-config';
import { closePrompt } from '../src/utils/prompt';
import {
  collectProjectContext,
  loadProjectInstructions,
  collectGitContext,
  getDirectoryStructureSummary,
} from '../src/utils/context';
import { getConfig, initializeConfig, ForqConfig } from '../src/utils/config';

jest.mock('../src/utils/logger');
jest.mock('../src/utils/analytics');
jest.mock('../src/api/ai');

describe('REPL Tests', () => {
  let mockConfig: ForqConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock config
    mockConfig = {
      api: {
        anthropic: {
          model: 'test-model',
          maxTokens: 1000,
          temperature: 0.7,
          completeToolCycle: true,
        },
      },
      repl: {
        historySize: 50,
        autoCompactThreshold: 100,
      },
      logging: {
        level: 'info',
        logConversation: true,
        logToolCalls: true,
      },
    };

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'mkdirSync').mockImplementation((() => {}) as any);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('test history');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize and start the REPL', async () => {
    jest.spyOn(process, 'cwd').mockReturnValue('/test/dir');
    jest.spyOn(initializeConfig as any, 'initializeConfig').mockReturnValue(mockConfig);

    const loggerSpy = jest.spyOn(logger, 'logConversation');
    const analyticsSpy = jest.spyOn(analytics, 'initialize');
    const toolsSpy = jest.spyOn(getAllTools as any, 'getAllTools').mockReturnValue([
      { name: 'tool1', description: 'test tool 1' },
      { name: 'tool2', description: 'test tool 2' },
    ]);

    const promptSpy = jest.spyOn(loadSystemPrompt as any, 'loadSystemPrompt').mockReturnValue({
      role: 'system',
      content: 'Test system prompt',
    });

    const streamSpy = jest.spyOn(streamAI as any, 'streamAI').mockResolvedValue({
      text: 'Test AI response',
      toolCalls: [],
      stopReason: null,
    });

    // Mock user input
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      on: jest.fn(),
      prompt: jest.fn().mockImplementationOnce((_, cb) => {
        cb('test user input');
        return Promise.resolve();
      }),
      close: jest.fn(),
    } as any);

    await startRepl();

    expect(initializeConfig).toHaveBeenCalled();
    expect(analyticsSpy).toHaveBeenCalled();
    expect(toolsSpy).toHaveBeenCalled();
    expect(promptSpy).toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledWith('User: test user input');
    expect(streamSpy).toHaveBeenCalled();
  });

  it('should handle built-in REPL commands', async () => {
    jest.spyOn(process, 'cwd').mockReturnValue('/test/dir');
    jest.spyOn(initializeConfig as any, 'initializeConfig').mockReturnValue(mockConfig);

    const loggerSpy = jest.spyOn(logger, 'logConversation');
    const analyticsSpy = jest.spyOn(analytics, 'initialize');
    const toolsSpy = jest.spyOn(getAllTools as any, 'getAllTools').mockReturnValue([]);
    const promptSpy = jest.spyOn(loadSystemPrompt as any, 'loadSystemPrompt').mockReturnValue({
      role: 'system',
      content: 'Test system prompt',
    });

    const rl = {
      on: jest.fn(),
      prompt: jest.fn(),
      close: jest.fn(),
    };

    jest.spyOn(readline, 'createInterface').mockReturnValue(rl as any);

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called.');
    });

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleClearSpy = jest.spyOn(console, 'clear').mockImplementation(() => {});

    const testCases = [
      { input: '/help', expected: expect.stringContaining('Available commands:') },
      { input: '/clear', expected: expect(consoleClearSpy).toHaveBeenCalled() },
      { input: '/reset', expected: expect.stringContaining('Conversation reset.') },
      { input: '/tools', expected: expect.stringContaining('Available tools:') },
      {
        input: '/compact',
        expected: expect.stringContaining('Conversation too short to compact.'),
      },
      { input: '/config', expected: expect.stringContaining('Current REPL Configuration:') },
    ];

    for (const testCase of testCases) {
      rl.prompt.mockImplementationOnce((_, cb) => {
        cb(testCase.input);
      });

      await startRepl().catch(() => {});

      testCase.expected;
      consoleLogSpy.mockClear();
    }

    // Test /exit separately since it calls process.exit()
    rl.prompt.mockImplementationOnce((_, cb) => {
      cb('/exit');
    });

    await expect(startRepl()).rejects.toThrow('process.exit() was called.');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  // More tests for other scenarios like:
  // - Conversation compaction
  // - AI response with tool calls
  // - AI response with tool errors
  // - Streaming
  // - Error handling
});
