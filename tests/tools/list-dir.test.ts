import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { tool } from '../../src/tools/list-dir';
import { ToolContext } from '../../src/types/tools';

// Mock the fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
}));

// Mock the path module
jest.mock('path', () => ({
  resolve: jest.fn((cwd, p) => (p === '.' ? cwd : `${cwd}/${p}`)),
  join: jest.fn((dir, file) => `${dir}/${file}`),
  relative: jest.fn((from, to: string) => to.replace(`${from}/`, '')),
}));

describe('listDir Tool', () => {
  // Context object for tool execution
  const context: ToolContext = {
    cwd: '/test/dir',
    logger: {
      logAction: jest.fn(),
      logError: jest.fn(),
      logConversation: jest.fn(),
    },
  };

  // Mock file stats
  const mockFileStats = {
    isDirectory: jest.fn().mockReturnValue(false),
    size: 1024,
    birthtime: new Date(),
    mtime: new Date(),
  };

  // Mock directory stats
  const mockDirStats = {
    isDirectory: jest.fn().mockReturnValue(true),
    size: 4096,
    birthtime: new Date(),
    mtime: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(tool.name).toBe('listDir');
    expect(tool.description).toBe('Lists files and directories at the given path');
  });

  it('should not require permission', () => {
    expect(tool.requiresPermission).toBe(false);
  });

  it('should list directory contents with default path', async () => {
    // Setup mocks
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValueOnce(mockDirStats); // For the directory itself
    (fs.readdirSync as jest.Mock).mockReturnValue(['file1.txt', 'dir1']);

    // Mock stats for each item
    (fs.statSync as jest.Mock)
      .mockReturnValueOnce(mockFileStats) // For file1.txt
      .mockReturnValueOnce(mockDirStats); // For dir1

    // Execute the tool with default path
    const result = await tool.execute({}, context);

    // Verify the correct path was used
    expect(path.resolve).toHaveBeenCalledWith('/test/dir', '.');
    expect(fs.existsSync).toHaveBeenCalledWith('/test/dir');
    expect(fs.statSync).toHaveBeenCalledWith('/test/dir');
    expect(fs.readdirSync).toHaveBeenCalledWith('/test/dir');

    // Verify the result structure
    expect(result).toEqual({
      path: '.',
      items: [
        {
          name: 'file1.txt',
          path: 'file1.txt',
          type: 'file',
          size: 1024,
          created: expect.any(Date),
          modified: expect.any(Date),
        },
        {
          name: 'dir1',
          path: 'dir1',
          type: 'directory',
          size: 4096,
          created: expect.any(Date),
          modified: expect.any(Date),
        },
      ],
    });

    // Verify the logger was called
    expect(context.logger.logAction).toHaveBeenCalledWith('ListDir Tool', { path: '.' });
  });

  it('should list directory contents with specified path', async () => {
    // Setup mocks
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValueOnce(mockDirStats); // For the directory itself
    (fs.readdirSync as jest.Mock).mockReturnValue(['file2.txt']);

    // Mock stats for each item
    (fs.statSync as jest.Mock).mockReturnValueOnce(mockFileStats); // For file2.txt

    // Execute the tool with specified path
    const result = await tool.execute({ path: 'subdir' }, context);

    // Verify the correct path was used
    expect(path.resolve).toHaveBeenCalledWith('/test/dir', 'subdir');
    expect(fs.existsSync).toHaveBeenCalledWith('/test/dir/subdir');
    expect(fs.statSync).toHaveBeenCalledWith('/test/dir/subdir');
    expect(fs.readdirSync).toHaveBeenCalledWith('/test/dir/subdir');

    // Verify the result structure
    expect(result).toEqual({
      path: 'subdir',
      items: [
        {
          name: 'file2.txt',
          path: 'subdir/file2.txt',
          type: 'file',
          size: 1024,
          created: expect.any(Date),
          modified: expect.any(Date),
        },
      ],
    });

    // Verify the logger was called
    expect(context.logger.logAction).toHaveBeenCalledWith('ListDir Tool', { path: 'subdir' });
  });

  it('should throw an error if path does not exist', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    await expect(tool.execute({ path: 'nonexistent' }, context)).rejects.toThrow(
      'Failed to list directory: Path does not exist: /test/dir/nonexistent',
    );
  });

  it('should throw an error if path is not a directory', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValueOnce({
      isDirectory: jest.fn().mockReturnValue(false),
    });

    await expect(tool.execute({ path: 'file.txt' }, context)).rejects.toThrow(
      'Failed to list directory: Path is not a directory: /test/dir/file.txt',
    );
  });
});
