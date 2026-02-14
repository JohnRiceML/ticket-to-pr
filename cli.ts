import { createInterface, type Interface } from 'node:readline';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mask, shellEscape, writeEnvFile, updateProjectsFile } from './lib/utils.js';
import { getProjectNames, getProjectDir } from './lib/projects.js';
import type { Client as NotionClient } from '@notionhq/client';

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

  // Models
  console.log(`\n${BOLD}Models:${RESET}`);
  const { CONFIG } = await import('./config.js');
  printStatus(true, 'Review model', CONFIG.REVIEW_MODEL);
  printStatus(true, 'Execute model', CONFIG.EXECUTE_MODEL);

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
          const db = await client.databases.retrieve({ database_id: dbId }) as { properties: Record<string, { type: string; status?: unknown; select?: { options: Array<{ name: string }> } }> };
          printStatus(true, 'Database accessible');
          track(true);

          // Schema validation
          console.log(`\n${BOLD}Database Schema:${RESET}`);

          const requiredProps: Array<{ name: string; altName?: string; expectedTypes: string[] }> = [
            { name: 'Name', altName: 'Title', expectedTypes: ['title'] },
            { name: 'Status', expectedTypes: ['status'] },
            { name: 'Project', expectedTypes: ['select', 'rich_text'] },
            { name: 'Ease', expectedTypes: ['number'] },
            { name: 'Confidence', expectedTypes: ['number'] },
            { name: 'Spec', expectedTypes: ['rich_text'] },
            { name: 'Impact', expectedTypes: ['rich_text'] },
            { name: 'Branch', expectedTypes: ['rich_text'] },
            { name: 'Cost', expectedTypes: ['rich_text'] },
            { name: 'PR URL', expectedTypes: ['url', 'rich_text'] },
          ];

          let schemaOk = 0;
          let schemaMissing = 0;

          for (const req of requiredProps) {
            const prop = db.properties[req.name] || (req.altName ? db.properties[req.altName] : undefined);
            if (prop && req.expectedTypes.includes(prop.type)) {
              schemaOk++;
            } else if (prop) {
              printStatus(false, `Property "${req.name}"`, `found as ${prop.type}, expected ${req.expectedTypes.join(' or ')}`);
              schemaMissing++;
              track(false);
            } else {
              printStatus(false, `Missing property: "${req.name}"`, `(${req.expectedTypes.join(' or ')})`);
              schemaMissing++;
              track(false);
            }
          }

          if (schemaMissing === 0) {
            printStatus(true, `All ${requiredProps.length} required properties found`);
            track(true);
          } else {
            printStatus(false, `${schemaMissing} properties missing or misconfigured`);
          }

          // Check Project select options vs projects.json
          const projectProp = db.properties.Project;
          if (projectProp?.type === 'select' && projectProp.select) {
            const notionOptions = projectProp.select.options.map((o) => o.name);
            const configProjects = getProjectNames();
            const inNotionNotConfig = notionOptions.filter((n) => !configProjects.includes(n));
            const inConfigNotNotion = configProjects.filter((n) => !notionOptions.includes(n));
            if (inNotionNotConfig.length > 0) {
              printStatus(null, 'Notion has projects not in projects.json', inNotionNotConfig.join(', '));
              track(null);
            }
            if (inConfigNotNotion.length > 0) {
              printStatus(null, 'projects.json has projects not in Notion', inConfigNotNotion.join(', '));
              track(null);
            }
            if (inNotionNotConfig.length === 0 && inConfigNotNotion.length === 0 && configProjects.length > 0) {
              printStatus(true, 'Project options match projects.json');
              track(true);
            }
          }

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
  if (gh.ok) {
    printStatus(true, 'gh installed', gh.output.split('\n')[0]);
    track(true);
  } else {
    printStatus(null, 'gh not found', 'Install: brew install gh && gh auth login (required for automatic PR creation)');
    track(null);
  }

  if (gh.ok) {
    const ghAuth = checkCommand('gh auth status');
    printStatus(ghAuth.ok, 'gh authenticated');
    track(ghAuth.ok);
  } else {
    printStatus(null, 'gh authenticated', 'skipped — gh not installed');
    track(null);
  }

  const claude = checkCommand('claude --version');
  if (claude.ok) {
    printStatus(true, 'claude installed', claude.output.split('\n')[0]);
    track(true);
  } else {
    printStatus(false, 'claude not found', 'Install: npm i -g @anthropic-ai/claude-code — required, agents cannot run without it');
    track(false);
  }

  // Projects
  console.log(`\n${BOLD}Projects:${RESET}`);

  const projectNames = getProjectNames();

  if (projectNames.length === 0) {
    printStatus(null, 'No projects configured', 'add projects to projects.json or run init');
    track(null);
  } else {
    for (const name of projectNames) {
      const dir = getProjectDir(name)!;
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

      const origin = checkCommand(`git -C ${shellEscape(dir)} remote get-url origin`);
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
  const projectsPath = join(__dirname, 'projects.json');

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

  // Re-run detection
  const envExists = existsSync(envPath);
  const projectsExists = existsSync(projectsPath);

  if (envExists && projectsExists) {
    console.log(`  ${YELLOW}Existing configuration detected${RESET}`);
    const mode = await ask(rl, 'Update existing config or start fresh?', {
      defaultValue: 'update',
      validate: (v) => {
        const lower = v.toLowerCase();
        return lower === 'update' || lower === 'fresh' ? null : 'Choose: update / fresh';
      },
    });
    if (mode.toLowerCase() === 'fresh') {
      existingEnv = {};
      console.log(`  ${DIM}Starting from scratch${RESET}`);
    } else {
      console.log(`  ${DIM}Pre-filling from existing config${RESET}`);
    }
    console.log('');
  }

  try {
    // Step 1: Notion
    console.log(`${BOLD}Step 1: Notion${RESET}`);

    // -- Notion token with validation loop --
    let notionToken = '';
    let notionClient: NotionClient | null = null;
    const { Client } = await import('@notionhq/client');

    while (true) {
      const tokenDefault = existingEnv.NOTION_TOKEN ? mask(existingEnv.NOTION_TOKEN) : undefined;
      let tokenInput = await ask(rl, 'Notion token', {
        defaultValue: tokenDefault,
        validate: (v) => (!v ? 'Token is required' : null),
      });
      // If user accepted the masked default, use the actual stored value
      if (tokenInput === tokenDefault && existingEnv.NOTION_TOKEN) {
        tokenInput = existingEnv.NOTION_TOKEN;
      }

      try {
        const client = new Client({ auth: tokenInput });
        const me = await client.users.me({}) as { bot?: { owner?: { workspace?: boolean }; workspace_name?: string } };
        const workspaceName = me.bot?.workspace_name || 'connected';
        printStatus(true, 'Token valid', workspaceName);
        notionToken = tokenInput;
        notionClient = client;
        break;
      } catch {
        printStatus(false, 'Token invalid — check your integration token and try again');
      }
    }

    // -- Database ID with validation loop --
    let databaseId = '';
    while (true) {
      const dbDefault = existingEnv.NOTION_DATABASE_ID ? mask(existingEnv.NOTION_DATABASE_ID) : undefined;
      let dbInput = await ask(rl, 'Database ID', {
        defaultValue: dbDefault,
        validate: (v) => (!v ? 'Database ID is required' : null),
      });
      if (dbInput === dbDefault && existingEnv.NOTION_DATABASE_ID) {
        dbInput = existingEnv.NOTION_DATABASE_ID;
      }

      try {
        const db = await notionClient!.databases.retrieve({ database_id: dbInput }) as { title?: Array<{ plain_text: string }> };
        const dbTitle = db.title?.map((t) => t.plain_text).join('') || 'untitled';
        printStatus(true, 'Database accessible', dbTitle);
        databaseId = dbInput;
        break;
      } catch {
        printStatus(false, 'Database not accessible — check the ID and make sure the integration is connected to this database');
      }
    }

    console.log('');

    // Step 2: Tools
    console.log(`${BOLD}Step 2: Tools${RESET}`);

    const claude = checkCommand('claude --version');
    if (claude.ok) {
      printStatus(true, 'claude', claude.output.split('\n')[0]);
    } else {
      printStatus(false, 'Claude Code CLI not found');
      console.log(`    ${DIM}Install: npm i -g @anthropic-ai/claude-code${RESET}`);
      console.log(`    ${DIM}Then authenticate: claude (follow the prompts)${RESET}`);
      console.log(`    ${RED}This is required — agents cannot run without it.${RESET}`);
    }

    const gh = checkCommand('gh --version');
    if (gh.ok) {
      printStatus(true, 'gh', gh.output.split('\n')[0]);
      const ghAuth = checkCommand('gh auth status');
      printStatus(ghAuth.ok, 'gh authenticated', ghAuth.ok ? undefined : 'run: gh auth login');
    } else {
      printStatus(null, 'GitHub CLI not found');
      console.log(`    ${DIM}Install: brew install gh && gh auth login${RESET}`);
      console.log(`    ${DIM}Required for automatic PR creation. Review/Execute still work without it.${RESET}`);
    }

    console.log('');

    // Step 3: Models
    console.log(`${BOLD}Step 3: Models${RESET}`);
    console.log(`  ${DIM}Choose which Claude model each agent uses.${RESET}`);
    console.log(`  ${DIM}Sonnet = fast/cheap, Opus = best quality, Haiku = fastest/cheapest${RESET}\n`);

    const modelChoices = [
      { label: 'sonnet', id: 'claude-sonnet-4-5-20250929' },
      { label: 'opus',   id: 'claude-opus-4-6' },
      { label: 'haiku',  id: 'claude-haiku-4-5-20251001' },
    ];
    const modelLabels = modelChoices.map((m) => m.label).join('/');

    const reviewModelDefault = existingEnv.REVIEW_MODEL
      ? modelChoices.find((m) => m.id === existingEnv.REVIEW_MODEL)?.label ?? existingEnv.REVIEW_MODEL
      : 'sonnet';
    const reviewModelInput = await ask(rl, `Review model (${modelLabels})`, {
      defaultValue: reviewModelDefault,
      validate: (v) => (modelChoices.some((m) => m.label === v || m.id === v) ? null : `Choose: ${modelLabels}`),
    });
    const reviewModel = modelChoices.find((m) => m.label === reviewModelInput || m.id === reviewModelInput)?.id ?? reviewModelInput;

    const executeModelDefault = existingEnv.EXECUTE_MODEL
      ? modelChoices.find((m) => m.id === existingEnv.EXECUTE_MODEL)?.label ?? existingEnv.EXECUTE_MODEL
      : 'opus';
    const executeModelInput = await ask(rl, `Execute model (${modelLabels})`, {
      defaultValue: executeModelDefault,
      validate: (v) => (modelChoices.some((m) => m.label === v || m.id === v) ? null : `Choose: ${modelLabels}`),
    });
    const executeModel = modelChoices.find((m) => m.label === executeModelInput || m.id === executeModelInput)?.id ?? executeModelInput;

    printStatus(true, 'Review model', reviewModel);
    printStatus(true, 'Execute model', executeModel);

    console.log('');

    // Step 4: Projects
    console.log(`${BOLD}Step 4: Projects${RESET}`);

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
        const origin = checkCommand(`git -C ${shellEscape(dir)} remote get-url origin`);
        if (origin.ok) {
          printStatus(true, 'Git repo', origin.output);
        } else {
          printStatus(null, 'Git repo found but no origin remote', `run: git -C ${dir} remote add origin <url>`);
        }
      } else {
        printStatus(null, 'Not a git repo', `${dir} — you can init git later`);
      }

      const buildCmd = await ask(rl, 'Build command (optional)');

      projects.push({ name, dir, buildCmd: buildCmd || undefined });
      console.log('');

      const another = await ask(rl, 'Add another project?', { defaultValue: 'N' });
      addMore = another.toLowerCase() === 'y' || another.toLowerCase() === 'yes';
      if (addMore) console.log('');
    }

    // Free tier guard
    if (projects.length > 1) {
      const { isPro } = await import('./config.js');
      if (!isPro()) {
        console.log('');
        console.log(`  ${YELLOW}Free tier supports 1 project. You configured ${projects.length}.${RESET}`);
        console.log(`  ${DIM}Upgrade to Pro for unlimited projects, or remove extras.${RESET}`);
        const keepAll = await ask(rl, 'Keep only the first project?', { defaultValue: 'Y' });
        if (keepAll.toLowerCase() === 'y' || keepAll.toLowerCase() === 'yes') {
          const removed = projects.splice(1);
          console.log(`  ${DIM}Kept "${projects[0].name}", removed: ${removed.map((p) => p.name).join(', ')}${RESET}`);
        } else {
          console.log(`  ${DIM}Keeping all ${projects.length} projects — startup will fail without a Pro license.${RESET}`);
        }
      }
    }

    console.log('');

    // Step 5: Save
    console.log(`${BOLD}Step 5: Save${RESET}`);

    // Write .env.local
    const envUpdates: Record<string, string> = {
      NOTION_TOKEN: notionToken,
      NOTION_DATABASE_ID: databaseId,
      REVIEW_MODEL: reviewModel,
      EXECUTE_MODEL: executeModel,
    };
    writeEnvFile(envPath, envUpdates);
    printStatus(true, 'Wrote .env.local');

    // Update projects.json
    if (projects.length > 0) {
      updateProjectsFile(projectsPath, projects);
      printStatus(true, 'Updated projects.json');
    }

    console.log(`\n${BOLD}Ready!${RESET}`);
    console.log(`  Test:  ${DIM}npx tsx index.ts doctor${RESET}`);
    console.log(`  Docs:  ${DIM}https://github.com/JohnRiceML/ticket-to-pr${RESET}\n`);
  } finally {
    rl.close();
  }
}
