import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_PATH = join(__dirname, '..', 'projects.json');

interface ProjectEntry {
  directory: string;
  buildCommand?: string;
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
