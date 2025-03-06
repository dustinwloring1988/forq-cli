import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  getGlobalConfigPath, 
  getProjectConfigPath, 
  initializeConfig, 
  getConfig, 
  updateGlobalConfig, 
  updateProjectConfig,
  createDefaultConfig
} from '../../src/utils/config';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('os');
jest.mock('../../src/utils/logger');

describe('Config Utils', () => {
  const mockCwd = '/test/project';
  const mockHomedir = '/test/home';
  const mockGlobalConfigDir = '/test/home/.forq';
  const mockGlobalConfigPath = '/test/home/.forq/.forqrc.json';
  const mockProjectConfigPath = '/test/project/.forqrc.json';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (os.homedir as jest.Mock).mockReturnValue(mockHomedir);
    (process.cwd as jest.Mock).mockReturnValue(mockCwd);
    (fs.existsSync as jest.Mock).mockReturnValue(false);
  });

  describe('getGlobalConfigPath', () => {
    it('should return the correct global config path', () => {
      (path.join as jest.Mock).mockImplementation((...args) => {
        if (args[0] === mockHomedir && args[1] === '.forq') {
          return mockGlobalConfigDir;
        }
        if (args[0] === mockGlobalConfigDir && args[1] === '.forqrc.json') {
          return mockGlobalConfigPath;
        }
        return args.join('/');
      });
      
      const result = getGlobalConfigPath();
      expect(result).toBe(mockGlobalConfigPath);
      expect(path.join).toHaveBeenCalledWith(expect.anything(), '.forqrc.json');
    });
  });

  describe('getProjectConfigPath', () => {
    it('should return the correct project config path', () => {
      const result = getProjectConfigPath();
      expect(result).toBe(mockProjectConfigPath);
      expect(path.join).toHaveBeenCalledWith(mockCwd, '.forqrc.json');
    });
  });

  describe('initializeConfig', () => {
    it('should initialize config by loading and merging global and project configs', () => {
      const mockGlobalConfig = { api: { anthropic: { apiKey: 'global-key' } } };
      const mockProjectConfig = { api: { anthropic: { model: 'claude-3-test' } } };
      const expectedMergedConfig = { 
        api: { 
          anthropic: { 
            apiKey: 'global-key', 
            model: 'claude-3-test' 
          } 
        } 
      };
      
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true) // For global config dir check
        .mockReturnValueOnce(true) // For global config file check
        .mockReturnValueOnce(true); // For project config file check
        
      (fs.readFileSync as jest.Mock)
        .mockReturnValueOnce(JSON.stringify(mockGlobalConfig))
        .mockReturnValueOnce(JSON.stringify(mockProjectConfig));
      
      const result = initializeConfig();
      
      expect(result).toEqual(expectedMergedConfig);
      expect(logger.logAction).toHaveBeenCalledTimes(3);
      expect(fs.readFileSync).toHaveBeenCalledWith(expect.any(String), 'utf8');
    });
    
    it('should handle non-existent config files', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      const result = initializeConfig();
      
      expect(result).toEqual({});
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
    
    it('should handle invalid JSON in config files', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid JSON');
      
      const result = initializeConfig();
      
      expect(result).toEqual({});
      expect(logger.logError).toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('should return the initialized config', () => {
      const mockConfig = { api: { anthropic: { apiKey: 'test-key' } } };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
      
      // Call initializeConfig first
      initializeConfig();
      
      // Then test getConfig
      const result = getConfig();
      
      expect(result).toEqual(mockConfig);
    });
    
    it('should initialize config if not already done', () => {
      const mockConfig = { api: { anthropic: { apiKey: 'test-key' } } };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
      
      // Call getConfig directly without initializing first
      const result = getConfig();
      
      expect(result).toEqual(mockConfig);
      expect(logger.logAction).toHaveBeenCalled();
    });
  });

  describe('updateGlobalConfig', () => {
    it('should update global config correctly', () => {
      const existingConfig = { api: { anthropic: { apiKey: 'old-key' } } };
      const newConfig = { api: { anthropic: { apiKey: 'new-key' } } };
      
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(existingConfig));
      
      updateGlobalConfig(newConfig);
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String), 
        expect.stringContaining('new-key'),
        expect.anything()
      );
      expect(logger.logAction).toHaveBeenCalledWith('Config', { status: 'Updated global config' });
    });
    
    it('should handle errors when saving global config', () => {
      const newConfig = { api: { anthropic: { apiKey: 'new-key' } } };
      
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write error');
      });
      
      expect(() => updateGlobalConfig(newConfig)).toThrow('Failed to save global config: Write error');
      expect(logger.logError).toHaveBeenCalled();
    });
  });

  describe('updateProjectConfig', () => {
    it('should update project config correctly', () => {
      const existingConfig = { api: { anthropic: { model: 'old-model' } } };
      const newConfig = { api: { anthropic: { model: 'new-model' } } };
      
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(existingConfig));
      
      updateProjectConfig(newConfig);
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String), 
        expect.stringContaining('new-model'),
        expect.anything()
      );
      expect(logger.logAction).toHaveBeenCalledWith('Config', { status: 'Updated project config' });
    });
    
    it('should handle errors when saving project config', () => {
      const newConfig = { api: { anthropic: { model: 'new-model' } } };
      
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write error');
      });
      
      expect(() => updateProjectConfig(newConfig)).toThrow('Failed to save project config: Write error');
      expect(logger.logError).toHaveBeenCalled();
    });
  });

  describe('createDefaultConfig', () => {
    it('should create a default global config if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      createDefaultConfig(true);
      
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('claude-3-opus-20240229'),
        expect.anything()
      );
      expect(logger.logAction).toHaveBeenCalled();
    });
    
    it('should create a default project config if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      createDefaultConfig(false);
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('claude-3-opus-20240229'),
        expect.anything()
      );
      expect(logger.logAction).toHaveBeenCalled();
    });
    
    it('should not overwrite existing configs', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      createDefaultConfig(true);
      
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(logger.logAction).toHaveBeenCalledWith('Config', {
        status: 'Global config already exists',
      });
    });
    
    it('should handle errors when creating default config', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write error');
      });
      
      createDefaultConfig(true);
      
      expect(logger.logError).toHaveBeenCalled();
    });
  });
});