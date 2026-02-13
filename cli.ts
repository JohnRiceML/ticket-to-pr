import { createInterface, type Interface } from 'node:readline';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// -- Colors --
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';

// -- Shared utilities --

function printStatus(ok: boolean | null, label: string, detail?: string): void {
  const icon = ok === true ? `${GREEN}✓${RESET}` : ok === false ? `${RED}✗${RESET}` : `${YELLOW}○${RESET}`;
  const line = detail ? `${icon} ${label} ${DIM}${detail}${RESET}` : `${icon} ${label}`;
  console.log(`  ${line}`);
}

function mask(str: string): string {
  if (str.length <= 8) return '****';
  return str.slice(0, 4) + '...' + str.slice(-4);
}

function checkCommand(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { stdio: 'pipe', timeout: 10_000 }).toString().trim();
    return { ok: true, output };
  } catch {
    return { ok: false, output: '' };
  }
}

function ask(
  rl: Interface,
  question: string,
  opts?: { defaultValue?: string; validate?: (input: string) => string | null },
): Promise<string> {
  return new Promise((resolve) => {
    const suffix = opts?.defaultValue ? ` ${DIM}(${opts.defaultValue})${RESET}` : '';
    rl.question(`  ${question}${suffix}: `, (answer) => {
      const value = answer.trim() || opts?.defaultValue || '';
      if (opts?.validate) {
        const error = opts.validate(value);
        if (error) {
          console.log(`  ${RED}${error}${RESET}`);
          resolve(ask(rl, question, opts));
          return;
        }
      }
      resolve(value);
    });
  });
}

function writeEnvFile(filepath: string, updates: Record<string, string>): void {
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

  writeFileSync(filepath, updatedLines.join('\n'));
}

function updateConfigFile(
  filepath: string,
  projects: Array<{ name: string; dir: string; buildCmd?: string }>,
): void {
  let content = readFileSync(filepath, 'utf-8');

  for (const proj of projects) {
    // Insert into PROJECTS block
    const projectEntry = `    '${proj.name}': '${proj.dir}',`;
    const projectsAnchor = '} as Record<string, string>,';

    // Find the PROJECTS block anchor (first occurrence)
    const projIdx = content.indexOf(projectsAnchor);
    if (projIdx !== -1) {
      // Check if this project already exists
      const existingPattern = new RegExp(`'${escapeRegex(proj.name)}':\\s*'[^']*'`);
      if (existingPattern.test(content.slice(0, projIdx))) {
        // Replace existing entry
        content = content.replace(existingPattern, `'${proj.name}': '${proj.dir}'`);
      } else {
        // Insert before the closing anchor
        content = content.slice(0, projIdx) + projectEntry + '\n  ' + content.slice(projIdx);
      }
    }

    // Insert into BUILD_COMMANDS block (second occurrence of anchor)
    if (proj.buildCmd) {
      const buildEntry = `    '${proj.name}': '${proj.buildCmd}',`;
      // Find the second occurrence of the anchor
      const firstAnchorEnd = content.indexOf(projectsAnchor) + projectsAnchor.length;
      const buildIdx = content.indexOf(projectsAnchor, firstAnchorEnd);
      if (buildIdx !== -1) {
        const beforeBuild = content.slice(0, buildIdx);
        const afterBuild = content.slice(buildIdx);
        const buildPattern = new RegExp(`'${escapeRegex(proj.name)}':\\s*'[^']*'`);
        // Check in the BUILD_COMMANDS section only (between firstAnchorEnd and buildIdx)
        const buildSection = content.slice(firstAnchorEnd, buildIdx);
        if (buildPattern.test(buildSection)) {
          // Replace in the build section
          const updatedSection = buildSection.replace(buildPattern, `'${proj.name}': '${proj.buildCmd}'`);
          content = content.slice(0, firstAnchorEnd) + updatedSection + afterBuild;
        } else {
          content = beforeBuild + buildEntry + '\n  ' + afterBuild;
        }
      }
    }
  }

  writeFileSync(filepath, content);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// -- Doctor --

export async function runDoctor(): Promise<void> {
  console.log(`\n${BOLD}TicketToPR Doctor${RESET}\n`);

  let passed = 0;
  let warnings = 0;
  let failed = 0;

  function track(ok: boolean | null): void {
    if (ok === true) passed++;
    else if (ok === false) failed++;
    else warnings++;
  }

  // Environment
  console.log(`${BOLD}Environment:${RESET}`);

  const envPath = join(__dirname, '.env.local');
  const envExists = existsSync(envPath);
  printStatus(envExists, '.env.local exists');
  track(envExists);

  let envVars: Record<string, string> = {};
  if (envExists) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        envVars[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
      }
    } catch {
      // ignore
    }
  }

  const notionToken = envVars.NOTION_TOKEN || process.env.NOTION_TOKEN || '';
  const hasToken = notionToken.length > 0;
  printStatus(hasToken, 'NOTION_TOKEN set', hasToken ? mask(notionToken) : undefined);
  track(hasToken);

  const dbId = envVars.NOTION_DATABASE_ID || process.env.NOTION_DATABASE_ID || '';
  const hasDbId = dbId.length > 0;
  printStatus(hasDbId, 'NOTION_DATABASE_ID set', hasDbId ? mask(dbId) : undefined);
  track(hasDbId);

  const licenseKey = envVars.LICENSE_KEY || process.env.LICENSE_KEY || '';
  if (licenseKey) {
    // Dynamically import config to check isPro
    const { isPro } = await import('./config.js');
    // Temporarily set env for check
    const prev = process.env.LICENSE_KEY;
    process.env.LICENSE_KEY = licenseKey;
    const pro = isPro();
    process.env.LICENSE_KEY = prev;
    printStatus(pro, 'LICENSE_KEY', pro ? 'Pro' : 'Invalid key');
    track(pro ? true : null);
  } else {
    printStatus(null, 'LICENSE_KEY', 'Free tier');
    track(null);
  }

  // Notion connectivity
  console.log(`\n${BOLD}Notion:${RESET}`);

  if (hasToken) {
    try {
      const { Client } = await import('@notionhq/client');
      const client = new Client({ auth: notionToken });

      try {
        await client.users.me({});
        printStatus(true, 'Token valid', 'connected to workspace');
        track(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        printStatus(false, 'Token valid', msg);
        track(false);
      }

      if (hasDbId) {
        try {
          await client.databases.retrieve({ database_id: dbId });
          printStatus(true, 'Database accessible');
          track(true);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          printStatus(false, 'Database accessible', msg);
          track(false);
        }
      } else {
        printStatus(false, 'Database accessible', 'no database ID configured');
        track(false);
      }
    } catch {
      printStatus(false, 'Notion client', 'failed to load @notionhq/client');
      track(false);
      printStatus(false, 'Database accessible', 'skipped');
      track(false);
    }
  } else {
    printStatus(false, 'Token valid', 'no token configured');
    track(false);
    printStatus(false, 'Database accessible', 'skipped');
    track(false);
  }

  // Tools
  console.log(`\n${BOLD}Tools:${RESET}`);

  const gh = checkCommand('gh --version');
  printStatus(gh.ok, 'gh installed', gh.ok ? gh.output.split('\n')[0] : 'not found');
  track(gh.ok);

  if (gh.ok) {
    const ghAuth = checkCommand('gh auth status');
    printStatus(ghAuth.ok, 'gh authenticated');
    track(ghAuth.ok);
  } else {
    printStatus(false, 'gh authenticated', 'skipped');
    track(false);
  }

  const claude = checkCommand('claude --version');
  printStatus(claude.ok, 'claude installed', claude.ok ? claude.output.split('\n')[0] : 'not found');
  track(claude.ok);

  // Projects
  console.log(`\n${BOLD}Projects:${RESET}`);

  const { CONFIG } = await import('./config.js');
  const projectNames = Object.keys(CONFIG.PROJECTS);

  if (projectNames.length === 0) {
    printStatus(null, 'No projects configured', 'add projects in config.ts or run init');
    track(null);
  } else {
    for (const name of projectNames) {
      const dir = CONFIG.PROJECTS[name];
      const dirExists = existsSync(dir);
      if (!dirExists) {
        printStatus(false, `${name}`, `${dir} (directory not found)`);
        track(false);
        continue;
      }

      const gitExists = existsSync(join(dir, '.git'));
      if (!gitExists) {
        printStatus(false, `${name}`, `${dir} (not a git repo)`);
        track(false);
        continue;
      }

      const origin = checkCommand(`git -C '${dir}' remote get-url origin`);
      if (!origin.ok) {
        printStatus(false, `${name}`, `${dir} (no origin remote)`);
        track(false);
        continue;
      }

      printStatus(true, `${name}`, `${dir}`);
      track(true);
    }
  }

  // Summary
  console.log(`\n${BOLD}Summary:${RESET} ${GREEN}${passed} passed${RESET}, ${YELLOW}${warnings} warnings${RESET}, ${RED}${failed} failed${RESET}`);
  console.log(`${DIM}Docs: https://github.com/JohnRiceML/ticket-to-pr${RESET}\n`);

  process.exitCode = failed > 0 ? 1 : 0;
}

// -- Init --

export async function runInit(): Promise<void> {
  console.log(`\n${BOLD}TicketToPR Setup${RESET}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const envPath = join(__dirname, '.env.local');
  const configPath = join(__dirname, 'config.ts');

  // Load existing env values for defaults
  let existingEnv: Record<string, string> = {};
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      existingEnv[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
    }
  } catch {
    // No existing file
  }

  try {
    // Step 1: Notion
    console.log(`${BOLD}Step 1: Notion${RESET}`);

    const tokenDefault = existingEnv.NOTION_TOKEN ? mask(existingEnv.NOTION_TOKEN) : undefined;
    let notionToken = await ask(rl, 'Notion token', {
      defaultValue: tokenDefault,
      validate: (v) => (!v ? 'Token is required' : null),
    });
    // If user accepted the masked default, use the actual stored value
    if (notionToken === tokenDefault && existingEnv.NOTION_TOKEN) {
      notionToken = existingEnv.NOTION_TOKEN;
    }

    // Test token
    let tokenValid = false;
    try {
      const { Client } = await import('@notionhq/client');
      const client = new Client({ auth: notionToken });
      await client.users.me({});
      printStatus(true, 'Token valid');
      tokenValid = true;
    } catch {
      printStatus(false, 'Token invalid — check your integration token');
    }

    const dbDefault = existingEnv.NOTION_DATABASE_ID ? mask(existingEnv.NOTION_DATABASE_ID) : undefined;
    let databaseId = await ask(rl, 'Database ID', {
      defaultValue: dbDefault,
      validate: (v) => (!v ? 'Database ID is required' : null),
    });
    if (databaseId === dbDefault && existingEnv.NOTION_DATABASE_ID) {
      databaseId = existingEnv.NOTION_DATABASE_ID;
    }

    // Test database access
    if (tokenValid) {
      try {
        const { Client } = await import('@notionhq/client');
        const client = new Client({ auth: notionToken });
        await client.databases.retrieve({ database_id: databaseId });
        printStatus(true, 'Database accessible');
      } catch {
        printStatus(false, 'Database not accessible — check ID and integration connection');
      }
    }

    console.log('');

    // Step 2: Tools
    console.log(`${BOLD}Step 2: Tools${RESET}`);

    const gh = checkCommand('gh --version');
    printStatus(gh.ok, 'gh', gh.ok ? gh.output.split('\n')[0] : `not found — install with: brew install gh`);

    if (gh.ok) {
      const ghAuth = checkCommand('gh auth status');
      printStatus(ghAuth.ok, 'gh authenticated', ghAuth.ok ? undefined : 'run: gh auth login');
    }

    const claude = checkCommand('claude --version');
    printStatus(claude.ok, 'claude', claude.ok ? claude.output.split('\n')[0] : 'not found — install with: npm i -g @anthropic-ai/claude-code');

    console.log('');

    // Step 3: Projects
    console.log(`${BOLD}Step 3: Projects${RESET}`);

    const projects: Array<{ name: string; dir: string; buildCmd?: string }> = [];

    let addMore = true;
    while (addMore) {
      const name = await ask(rl, 'Project name', {
        validate: (v) => (!v ? 'Project name is required' : null),
      });

      const dir = await ask(rl, 'Directory', {
        validate: (v) => {
          if (!v) return 'Directory is required';
          if (!existsSync(v)) return `Directory not found: ${v}`;
          return null;
        },
      });

      // Validate git repo
      const gitExists = existsSync(join(dir, '.git'));
      if (gitExists) {
        const origin = checkCommand(`git -C '${dir}' remote get-url origin`);
        printStatus(true, 'Git repo', origin.ok ? origin.output : 'no origin remote');
      } else {
        printStatus(false, 'Not a git repo', dir);
      }

      const buildCmd = await ask(rl, 'Build command (optional)');

      projects.push({ name, dir, buildCmd: buildCmd || undefined });
      console.log('');

      const another = await ask(rl, 'Add another project?', { defaultValue: 'N' });
      addMore = another.toLowerCase() === 'y' || another.toLowerCase() === 'yes';
      if (addMore) console.log('');
    }

    console.log('');

    // Step 4: Save
    console.log(`${BOLD}Step 4: Save${RESET}`);

    // Write .env.local
    const envUpdates: Record<string, string> = {
      NOTION_TOKEN: notionToken,
      NOTION_DATABASE_ID: databaseId,
    };
    writeEnvFile(envPath, envUpdates);
    printStatus(true, 'Wrote .env.local');

    // Update config.ts
    if (projects.length > 0) {
      updateConfigFile(configPath, projects);
      printStatus(true, 'Updated config.ts');
    }

    console.log(`\n${BOLD}Ready!${RESET}`);
    console.log(`  Test:  ${DIM}npx ticket-to-pr doctor${RESET}`);
    console.log(`  Docs:  ${DIM}https://github.com/JohnRiceML/ticket-to-pr${RESET}\n`);
  } finally {
    rl.close();
  }
}
