import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to mock the file path since projects.ts resolves relative to its own location.
// Instead, we test the loading logic by importing and resetting cache between tests.

describe('projects module', () => {
  let tmpDir: string;
  let projectsPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `proj-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    projectsPath = join(tmpDir, 'projects.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('getProjectDir returns directory for known project', async () => {
    writeFileSync(
      projectsPath,
      JSON.stringify({
        projects: { TestApp: { directory: '/path/to/test' } },
      }),
    );

    // Mock the module's file resolution to point to our temp file
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        readFileSync: (path: string, encoding: string) => {
          if (typeof path === 'string' && path.includes('projects.json')) {
            return actual.readFileSync(projectsPath, encoding);
          }
          return actual.readFileSync(path, encoding);
        },
      };
    });

    // Re-import to pick up mock
    const { getProjectDir, _resetCache } = await import('../projects.js');
    _resetCache();

    expect(getProjectDir('TestApp')).toBe('/path/to/test');
  });

  it('getProjectDir returns undefined for unknown project', async () => {
    writeFileSync(
      projectsPath,
      JSON.stringify({
        projects: { TestApp: { directory: '/path/to/test' } },
      }),
    );

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        readFileSync: (path: string, encoding: string) => {
          if (typeof path === 'string' && path.includes('projects.json')) {
            return actual.readFileSync(projectsPath, encoding);
          }
          return actual.readFileSync(path, encoding);
        },
      };
    });

    const { getProjectDir, _resetCache } = await import('../projects.js');
    _resetCache();

    expect(getProjectDir('NonExistent')).toBeUndefined();
  });

  it('getProjectNames returns all project names', async () => {
    writeFileSync(
      projectsPath,
      JSON.stringify({
        projects: {
          Alpha: { directory: '/a' },
          Beta: { directory: '/b' },
        },
      }),
    );

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        readFileSync: (path: string, encoding: string) => {
          if (typeof path === 'string' && path.includes('projects.json')) {
            return actual.readFileSync(projectsPath, encoding);
          }
          return actual.readFileSync(path, encoding);
        },
      };
    });

    const { getProjectNames, _resetCache } = await import('../projects.js');
    _resetCache();

    expect(getProjectNames()).toEqual(['Alpha', 'Beta']);
  });

  it('getBuildCommand returns command when set', async () => {
    writeFileSync(
      projectsPath,
      JSON.stringify({
        projects: { App: { directory: '/app', buildCommand: 'npm run build' } },
      }),
    );

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        readFileSync: (path: string, encoding: string) => {
          if (typeof path === 'string' && path.includes('projects.json')) {
            return actual.readFileSync(projectsPath, encoding);
          }
          return actual.readFileSync(path, encoding);
        },
      };
    });

    const { getBuildCommand, _resetCache } = await import('../projects.js');
    _resetCache();

    expect(getBuildCommand('App')).toBe('npm run build');
  });

  it('getBuildCommand returns undefined when not set', async () => {
    writeFileSync(
      projectsPath,
      JSON.stringify({
        projects: { App: { directory: '/app' } },
      }),
    );

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        readFileSync: (path: string, encoding: string) => {
          if (typeof path === 'string' && path.includes('projects.json')) {
            return actual.readFileSync(projectsPath, encoding);
          }
          return actual.readFileSync(path, encoding);
        },
      };
    });

    const { getBuildCommand, _resetCache } = await import('../projects.js');
    _resetCache();

    expect(getBuildCommand('App')).toBeUndefined();
  });

  it('handles missing projects.json gracefully', async () => {
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        readFileSync: (path: string, encoding: string) => {
          if (typeof path === 'string' && path.includes('projects.json')) {
            throw new Error('ENOENT');
          }
          return actual.readFileSync(path, encoding);
        },
      };
    });

    const { getProjectNames, _resetCache } = await import('../projects.js');
    _resetCache();

    expect(getProjectNames()).toEqual([]);
  });
});
