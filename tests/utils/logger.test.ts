import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';
import { Logger } from '../../src/utils/logger';

// Mock fs module
jest.mock('fs', () => ({
  appendFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

describe('Logger', () => {
  let logger: Logger;
  const mockTimestamp = '2025-01-01T00:00:00.000Z';

  beforeAll(() => {
    // Mock Date.toISOString
    const mockDate = new Date();
    jest.spyOn(mockDate, 'toISOString').mockReturnValue(mockTimestamp);
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    logger = new Logger();
    jest.clearAllMocks();
  });

  describe('logConversation', () => {
    it('should append message to conversation log with timestamp', () => {
      const message = 'Test conversation message';

      logger.logConversation(message);

      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('conversation.log'),
        expect.stringContaining(`[${mockTimestamp}] ${message}`),
      );
    });
  });

  describe('logError', () => {
    it('should log Error objects with stack trace', () => {
      const error = new Error('Test error');

      logger.logError(error);

      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('error.log'),
        expect.stringContaining(`[${mockTimestamp}] ${error.message}`),
      );
    });

    it('should log string errors', () => {
      const errorMessage = 'String error message';

      logger.logError(errorMessage);

      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('error.log'),
        expect.stringContaining(`[${mockTimestamp}] ${errorMessage}`),
      );
    });

    it('should include context when provided', () => {
      const error = 'Test error';
      const context = 'Error context';

      logger.logError(error, context);

      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('error.log'),
        expect.stringContaining(`[${mockTimestamp}] ${context}: ${error}`),
      );
    });
  });

  describe('logAction', () => {
    it('should log action with timestamp', () => {
      const action = 'TestAction';

      logger.logAction(action);

      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('actions.log'),
        expect.stringContaining(`[${mockTimestamp}] ${action} `),
      );
    });

    it('should include details when provided', () => {
      const action = 'TestAction';
      const details = { key: 'value', status: 'success' };

      logger.logAction(action, details);

      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('actions.log'),
        expect.stringContaining(`[${mockTimestamp}] ${action} ${JSON.stringify(details)}`),
      );
    });
  });
});
