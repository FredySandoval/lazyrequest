import { test, expect, describe } from 'bun:test';
import { discoverHttpFiles } from '../../src/discovery/file-finder';
import { parseArgs } from '../../src/cli/args';
import { ConfigurationManager } from '../../src/cli/config-manager';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory where this test file is located
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures/file-finder');
const testFile = path.join(fixturesDir, 'api', 'users.http');

describe('File Discovery', () => {
  describe('discoverHttpFiles (with RuntimeConfig)', () => {
    test('should return empty array for inline mode', async () => {
      const args = parseArgs(['--http', 'GET https://example.com']);
      const manager = new ConfigurationManager(args);
      const config = manager.buildConfig();

      const result = await discoverHttpFiles(config);

      expect(result.files).toEqual([]);
      expect(result.mode).toBe('inline');
      expect(result.totalFound).toBe(0);
    });

    test('should return single file for single-file mode', async () => {
      const args = parseArgs(['--httpFile', testFile]);
      const manager = new ConfigurationManager(args);
      const config = manager.buildConfig();

      const result = await discoverHttpFiles(config);

      expect(result.files).toEqual([testFile]);
      expect(result.mode).toBe('single-file');
      expect(result.totalFound).toBe(1);
    });

    test('should recursively find files for folder mode', async () => {
      const args = parseArgs(['--httpFolder', fixturesDir]);
      const manager = new ConfigurationManager(args);
      const config = manager.buildConfig();

      const result = await discoverHttpFiles(config);

      expect(result.files.length).toBe(5); // users.http, posts.rest, nested/deep.http
      expect(result.mode).toBe('folder');
      expect(result.totalFound).toBe(5);
      
      // Verify all paths are absolute
      result.files.forEach(file => {
        expect(path.isAbsolute(file)).toBe(true);
      });
    });

    test('should use ignorePaths to exclude files', async () => {
      const args = parseArgs(['--httpFolder', fixturesDir]);
      const manager = new ConfigurationManager(args);
      const config = manager.buildConfig();
      
      // Add 'nested' to ignore paths
      config.ignorePaths.push('nested');

      const result = await discoverHttpFiles(config);

      // Should exclude node_modules and nested directory
      expect(result.files.some(f => f.includes('node_modules'))).toBe(false);
      expect(result.files.some(f => f.includes('nested'))).toBe(false);
      expect(result.files.length).toBe(4); // Only users.http and posts.rest
    });

    test('should sort results alphabetically', async () => {
      const args = parseArgs(['--httpFolder', fixturesDir]);
      const manager = new ConfigurationManager(args);
      const config = manager.buildConfig();

      const result = await discoverHttpFiles(config);

      const sortedFiles = [...result.files].sort();
      expect(result.files).toEqual(sortedFiles);
    });

    test('should exclude hidden files', async () => {
      const args = parseArgs(['--httpFolder', fixturesDir]);
      const manager = new ConfigurationManager(args);
      const config = manager.buildConfig();

      const result = await discoverHttpFiles(config);

      expect(result.files.some(f => f.includes('.hidden'))).toBe(false);
    });
  });
});
