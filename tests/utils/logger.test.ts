import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../../src/utils/logger';

// Mock fs functions
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn()
}));

// Mock path functions
jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/'))
}));

describe('Logger', () => {
  let logger: Logger;
  const mockDate = new Date('2025-01-01T12:00:00Z');
  const mockTimestamp = mockDate.toISOString();
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);
    
    // Setup mocks
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    
    logger = new Logger();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('logConversation', () => {
    it('should append message to conversation log with timestamp', () => {
      const message = 'Test conversation message';
      logger.logConversation(message);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('logs/conversation.log'),
        `[${mockTimestamp}] ${message}${os.EOL}`
      );
    });
  });
  
  describe('logError', () => {
    it('should log Error objects with stack trace', () => {
      const error = new Error('Test error');
      logger.logError(error);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('logs/error.log'),
        expect.stringContaining(`[${mockTimestamp}] ${error.message}\n${error.stack}${os.EOL}`)
      );
    });
    
    it('should log string errors', () => {
      const errorMessage = 'String error message';
      logger.logError(errorMessage);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('logs/error.log'),
        `[${mockTimestamp}] ${errorMessage}${os.EOL}`
      );
    });
    
    it('should include context when provided', () => {
      const error = 'Test error';
      const context = 'Error Context';
      logger.logError(error, context);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('logs/error.log'),
        `[${mockTimestamp}] ${context}: ${error}${os.EOL}`
      );
    });
  });
  
  describe('logAction', () => {
    it('should log actions with timestamp', () => {
      const action = 'TestAction';
      logger.logAction(action);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('logs/actions.log'),
        `[${mockTimestamp}] ${action} ${os.EOL}`
      );
    });
    
    it('should include JSON stringified details when provided', () => {
      const action = 'TestAction';
      const details = { key: 'value', nested: { prop: true } };
      logger.logAction(action, details);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('logs/actions.log'),
        `[${mockTimestamp}] ${action} ${JSON.stringify(details)}${os.EOL}`
      );
    });
  });
});