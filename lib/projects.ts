import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './paths.js';

const PROJECTS_PATH = join(CONFIG_DIR, 'projects.json');

interface ProjectEntry {
  directory: string;
  buildCommand?: string;
  baseBranch?: string;
  blockedFiles?: string[];
  skipPR?: boolean;
}

interface ProjectsFile {
  projects: Record<string, ProjectEntry>;
}

let cache: ProjectsFile | null = null;

function load(): ProjectsFile {
  if (cache) return cache;
  try {
    const content = readFileSync(PROJECTS_PATH, 'utf-8');
    cache = JSON.parse(content) as ProjectsFile;
  } catch {
    cache = { projects: {} };
  }
  return cache;
}

export function getProjectDir(name: string): string | undefined {
  return load().projects[name]?.directory;
}

export function getProjectNames(): string[] {
  return Object.keys(load().projects);
}

export function getBuildCommand(name: string): string | undefined {
  return load().projects[name]?.buildCommand;
}

export function getBaseBranch(name: string): string | undefined {
  return load().projects[name]?.baseBranch;
}

export function getBlockedFiles(name: string): string[] {
  return load().projects[name]?.blockedFiles ?? [];
}

export function getSkipPR(name: string): boolean {
  return load().projects[name]?.skipPR ?? false;
}

export function getAllProjects(): Record<string, string> {
  const data = load();
  const result: Record<string, string> = {};
  for (const [name, entry] of Object.entries(data.projects)) {
    result[name] = entry.directory;
  }
  return result;
}

/** Reset the in-memory cache (for tests). */
export function _resetCache(): void {
  cache = null;
}
