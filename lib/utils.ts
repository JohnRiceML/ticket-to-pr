import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';

// -- Pure utilities --

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function extractJsonFromOutput(text: string): Record<string, unknown> | null {
  // Find the last JSON code block
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let lastMatch: string | null = null;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    lastMatch = match[1];
  }

  // Try parsing the last code block first
  if (lastMatch) {
    try {
      return JSON.parse(lastMatch);
    } catch {
      // Fall through
    }
  }

  // Try parsing the entire text as JSON (in case no code blocks)
  try {
    return JSON.parse(text);
  } catch {
    // Fall through
  }

  // Try finding a raw JSON object
  const jsonRegex = /\{[\s\S]*"easeScore"[\s\S]*\}/;
  const rawMatch = text.match(jsonRegex);
  if (rawMatch) {
    try {
      return JSON.parse(rawMatch[0]);
    } catch {
      // Give up
    }
  }

  return null;
}

export function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export function extractNumber(ticket: { impact?: string }, field: string): string {
  const text = ticket.impact ?? '';
  if (field === 'ease') {
    const match = text.match(/Ease[:\s]*(\d+)/i);
    return match ? match[1] : '?';
  }
  if (field === 'confidence') {
    const match = text.match(/Confidence[:\s]*(\d+)/i);
    return match ? match[1] : '?';
  }
  return '?';
}

export function loadEnv(filepath: string): void {
  try {
    const content = readFileSync(filepath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local doesn't exist, that's fine if env vars are set elsewhere
  }
}

export function mask(str: string): string {
  if (str.length <= 8) return '****';
  return str.slice(0, 4) + '...' + str.slice(-4);
}

export function writeEnvFile(filepath: string, updates: Record<string, string>): void {
  let lines: string[] = [];
  try {
    lines = readFileSync(filepath, 'utf-8').split('\n');
  } catch {
    // File doesn't exist yet
  }

  const remaining = { ...updates };

  // Update existing keys in place
  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return line;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key in remaining) {
      const val = remaining[key];
      delete remaining[key];
      return `${key}=${val}`;
    }
    return line;
  });

  // Append any new keys
  for (const [key, val] of Object.entries(remaining)) {
    updatedLines.push(`${key}=${val}`);
  }

  writeFileSync(filepath, updatedLines.join('\n'), { mode: 0o600 });
}

export function updateProjectsFile(
  filepath: string,
  projects: Array<{ name: string; dir: string; buildCmd?: string }>,
): void {
  let data: { projects: Record<string, { directory: string; buildCommand?: string }> } = {
    projects: {},
  };

  try {
    const content = readFileSync(filepath, 'utf-8');
    data = JSON.parse(content);
  } catch {
    // File doesn't exist or invalid JSON — start fresh
  }

  for (const proj of projects) {
    data.projects[proj.name] = {
      directory: proj.dir,
      ...(proj.buildCmd ? { buildCommand: proj.buildCmd } : {}),
    };
  }

  writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
}

// -- Default branch detection --

const defaultBranchCache = new Map<string, string>();

export function getDefaultBranch(projectDir: string): string {
  const cached = defaultBranchCache.get(projectDir);
  if (cached) return cached;

  let branch = 'main'; // ultimate fallback

  // Try reading the remote HEAD symbolic ref
  try {
    const ref = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: projectDir,
      stdio: 'pipe',
    }).toString().trim();
    // refs/remotes/origin/main → main
    const parsed = ref.replace('refs/remotes/origin/', '');
    if (parsed) branch = parsed;
  } catch {
    // Remote HEAD not set — try common branch names
    try {
      execSync('git rev-parse --verify main', { cwd: projectDir, stdio: 'pipe' });
      branch = 'main';
    } catch {
      try {
        execSync('git rev-parse --verify master', { cwd: projectDir, stdio: 'pipe' });
        branch = 'master';
      } catch {
        // Give up, default to 'main'
      }
    }
  }

  defaultBranchCache.set(projectDir, branch);
  return branch;
}

/** Reset the default branch cache (for tests). */
export function _resetDefaultBranchCache(): void {
  defaultBranchCache.clear();
}

// -- Git worktree helpers --

export function ensureWorktreesIgnored(projectDir: string): void {
  const gitignorePath = join(projectDir, '.gitignore');
  try {
    const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
    const lines = content.split('\n');
    if (!lines.some((line) => line.trim() === '.worktrees' || line.trim() === '.worktrees/')) {
      const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
      writeFileSync(gitignorePath, content + separator + '.worktrees/\n');
    }
  } catch {
    // Best effort — don't block worktree creation over gitignore
  }
}

export function createWorktree(projectDir: string, branchName: string, worktreeDir: string): void {
  mkdirSync(join(projectDir, '.worktrees'), { recursive: true });
  ensureWorktreesIgnored(projectDir);

  // Clean up stale worktree if it exists from a crashed run
  if (existsSync(worktreeDir)) {
    try {
      execSync(`git worktree remove ${shellEscape(worktreeDir)} --force`, {
        cwd: projectDir,
        stdio: 'pipe',
      });
    } catch {
      rmSync(worktreeDir, { recursive: true, force: true });
      execSync('git worktree prune', { cwd: projectDir, stdio: 'pipe' });
    }
  }

  // Try creating with a new branch first
  try {
    execSync(`git worktree add ${shellEscape(worktreeDir)} -b ${shellEscape(branchName)}`, {
      cwd: projectDir,
      stdio: 'pipe',
    });
  } catch {
    // Branch might already exist (retry scenario) — attach to existing branch
    try {
      execSync(`git worktree add ${shellEscape(worktreeDir)} ${shellEscape(branchName)}`, {
        cwd: projectDir,
        stdio: 'pipe',
      });
    } catch (e) {
      throw new Error(`Failed to create worktree for branch ${branchName}: ${e}`);
    }
  }
}

export function removeWorktree(projectDir: string, worktreeDir: string): void {
  try {
    execSync(`git worktree remove ${shellEscape(worktreeDir)} --force`, {
      cwd: projectDir,
      stdio: 'pipe',
    });
  } catch {
    // Fallback: manual cleanup
    try {
      rmSync(worktreeDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
    try {
      execSync('git worktree prune', { cwd: projectDir, stdio: 'pipe' });
    } catch {
      // Best effort
    }
  }
}
