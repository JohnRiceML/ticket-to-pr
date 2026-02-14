import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  clamp,
  shellEscape,
  extractJsonFromOutput,
  extractNumber,
  loadEnv,
  mask,
  writeEnvFile,
  updateProjectsFile,
  ensureWorktreesIgnored,
} from '../utils.js';

// -- shellEscape --

describe('shellEscape', () => {
  it('wraps a simple string in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'");
  });

  it('handles empty string', () => {
    expect(shellEscape('')).toBe("''");
  });

  it('escapes single quotes', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it('handles special shell chars without extra escaping', () => {
    expect(shellEscape('$HOME && rm -rf /')).toBe("'$HOME && rm -rf /'");
  });

  it('handles strings with spaces', () => {
    expect(shellEscape('hello world')).toBe("'hello world'");
  });
});

// -- extractJsonFromOutput --

describe('extractJsonFromOutput', () => {
  it('extracts JSON from a code block', () => {
    const text = 'Some text\n```json\n{"easeScore": 8}\n```\nMore text';
    expect(extractJsonFromOutput(text)).toEqual({ easeScore: 8 });
  });

  it('uses the last code block when multiple exist', () => {
    const text = '```json\n{"easeScore": 1}\n```\nMiddle\n```json\n{"easeScore": 9}\n```';
    expect(extractJsonFromOutput(text)).toEqual({ easeScore: 9 });
  });

  it('parses raw JSON with no code blocks', () => {
    const text = '{"easeScore": 5, "confidenceScore": 7}';
    expect(extractJsonFromOutput(text)).toEqual({ easeScore: 5, confidenceScore: 7 });
  });

  it('returns null when no JSON is found', () => {
    expect(extractJsonFromOutput('just plain text')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(extractJsonFromOutput('```json\n{broken\n```')).toBeNull();
  });

  it('falls back to raw easeScore pattern', () => {
    const text = 'Here is the result: {"easeScore": 3, "confidenceScore": 4}';
    expect(extractJsonFromOutput(text)).toEqual({ easeScore: 3, confidenceScore: 4 });
  });
});

// -- clamp --

describe('clamp', () => {
  it('returns value when in range', () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it('clamps below min', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it('clamps above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns bound when value equals min', () => {
    expect(clamp(1, 1, 10)).toBe(1);
  });

  it('returns bound when value equals max', () => {
    expect(clamp(10, 1, 10)).toBe(10);
  });
});

// -- extractNumber --

describe('extractNumber', () => {
  it('extracts ease score', () => {
    expect(extractNumber({ impact: 'Ease: 8 | Confidence: 7' }, 'ease')).toBe('8');
  });

  it('extracts confidence score', () => {
    expect(extractNumber({ impact: 'Ease: 8 | Confidence: 7' }, 'confidence')).toBe('7');
  });

  it('returns ? for missing impact', () => {
    expect(extractNumber({}, 'ease')).toBe('?');
  });

  it('returns ? for unknown field', () => {
    expect(extractNumber({ impact: 'Ease: 8' }, 'unknown')).toBe('?');
  });

  it('is case-insensitive', () => {
    expect(extractNumber({ impact: 'ease: 6' }, 'ease')).toBe('6');
  });
});

// -- loadEnv --

describe('loadEnv', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not throw for missing file', () => {
    expect(() => loadEnv(join(tmpDir, 'nonexistent'))).not.toThrow();
  });

  it('skips comments and blank lines', () => {
    const envFile = join(tmpDir, '.env');
    writeFileSync(envFile, '# comment\n\nTEST_LOAD_KEY=abc\n');
    const prev = process.env.TEST_LOAD_KEY;
    delete process.env.TEST_LOAD_KEY;
    try {
      loadEnv(envFile);
      expect(process.env.TEST_LOAD_KEY).toBe('abc');
    } finally {
      if (prev !== undefined) process.env.TEST_LOAD_KEY = prev;
      else delete process.env.TEST_LOAD_KEY;
    }
  });

  it('does not override existing env vars', () => {
    const envFile = join(tmpDir, '.env');
    writeFileSync(envFile, 'TEST_LOAD_EXISTING=new\n');
    process.env.TEST_LOAD_EXISTING = 'old';
    try {
      loadEnv(envFile);
      expect(process.env.TEST_LOAD_EXISTING).toBe('old');
    } finally {
      delete process.env.TEST_LOAD_EXISTING;
    }
  });
});

// -- mask --

describe('mask', () => {
  it('returns **** for short strings', () => {
    expect(mask('abc')).toBe('****');
    expect(mask('12345678')).toBe('****');
  });

  it('shows first 4 and last 4 for long strings', () => {
    expect(mask('abcdefghijklmnop')).toBe('abcd...mnop');
  });
});

// -- writeEnvFile --

describe('writeEnvFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new file with given keys', () => {
    const filepath = join(tmpDir, '.env');
    writeEnvFile(filepath, { FOO: 'bar', BAZ: 'qux' });
    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('FOO=bar');
    expect(content).toContain('BAZ=qux');
  });

  it('updates existing keys in place', () => {
    const filepath = join(tmpDir, '.env');
    writeFileSync(filepath, 'FOO=old\nBAR=keep\n');
    writeEnvFile(filepath, { FOO: 'new' });
    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('FOO=new');
    expect(content).toContain('BAR=keep');
    expect(content).not.toContain('FOO=old');
  });

  it('preserves comments', () => {
    const filepath = join(tmpDir, '.env');
    writeFileSync(filepath, '# This is a comment\nFOO=old\n');
    writeEnvFile(filepath, { FOO: 'new' });
    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('# This is a comment');
    expect(content).toContain('FOO=new');
  });
});

// -- updateProjectsFile --

describe('updateProjectsFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new file when none exists', () => {
    const filepath = join(tmpDir, 'projects.json');
    updateProjectsFile(filepath, [{ name: 'MyApp', dir: '/path/to/app' }]);
    const data = JSON.parse(readFileSync(filepath, 'utf-8'));
    expect(data.projects.MyApp.directory).toBe('/path/to/app');
  });

  it('merges into existing projects', () => {
    const filepath = join(tmpDir, 'projects.json');
    writeFileSync(filepath, JSON.stringify({ projects: { Existing: { directory: '/old' } } }));
    updateProjectsFile(filepath, [{ name: 'New', dir: '/new' }]);
    const data = JSON.parse(readFileSync(filepath, 'utf-8'));
    expect(data.projects.Existing.directory).toBe('/old');
    expect(data.projects.New.directory).toBe('/new');
  });

  it('includes buildCommand when provided', () => {
    const filepath = join(tmpDir, 'projects.json');
    updateProjectsFile(filepath, [{ name: 'MyApp', dir: '/app', buildCmd: 'npm run build' }]);
    const data = JSON.parse(readFileSync(filepath, 'utf-8'));
    expect(data.projects.MyApp.buildCommand).toBe('npm run build');
  });

  it('omits buildCommand when not provided', () => {
    const filepath = join(tmpDir, 'projects.json');
    updateProjectsFile(filepath, [{ name: 'MyApp', dir: '/app' }]);
    const data = JSON.parse(readFileSync(filepath, 'utf-8'));
    expect(data.projects.MyApp.buildCommand).toBeUndefined();
  });
});

// -- ensureWorktreesIgnored --

describe('ensureWorktreesIgnored', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .gitignore with .worktrees/ when none exists', () => {
    ensureWorktreesIgnored(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.worktrees/');
  });

  it('appends to existing .gitignore', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n');
    ensureWorktreesIgnored(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.worktrees/');
  });

  it('does not duplicate if .worktrees already present', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n.worktrees/\n');
    ensureWorktreesIgnored(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    const matches = content.match(/\.worktrees/g);
    expect(matches).toHaveLength(1);
  });

  it('recognizes .worktrees without trailing slash', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.worktrees\n');
    ensureWorktreesIgnored(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    const matches = content.match(/\.worktrees/g);
    expect(matches).toHaveLength(1);
  });

  it('handles .gitignore without trailing newline', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/');
    ensureWorktreesIgnored(tmpDir);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toBe('node_modules/\n.worktrees/\n');
  });
});
