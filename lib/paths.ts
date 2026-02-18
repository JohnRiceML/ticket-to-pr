import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Root of the package installation — used for bundled assets (prompts/).
 * Walks up from the current file until it finds package.json.
 */
function findPackageRoot(): string {
  let dir = __dirname;
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return __dirname; // filesystem root, shouldn't happen
    dir = parent;
  }
}

/** Package root — for bundled assets like prompts/ */
export const PACKAGE_ROOT = findPackageRoot();

/** User's working directory — for config files (.env.local, projects.json) */
export const CONFIG_DIR = process.cwd();
