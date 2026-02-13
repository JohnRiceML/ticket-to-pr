import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { CONFIG, type LockEntry, type TicketDetails, type ReviewOutput } from './config.js';
import {
  fetchTicketsByStatus,
  fetchTicketDetails,
  writeReviewResults,
  writeExecutionResults,
  moveTicketStatus,
  writeFailure,
} from './lib/notion.js';

// Load .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, '.env.local'));

// Allow running inside a Claude Code session (e.g. during development)
delete process.env.CLAUDECODE;

// -- CLI flags --
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONCE = args.includes('--once');

// -- State --
const activeLocks = new Map<string, LockEntry>();
let shuttingDown = false;
let activeAgentCount = 0;

// -- Logging --
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';

function ts(): string {
  return DIM + new Date().toISOString().slice(11, 19) + RESET;
}

function log(color: string, label: string, msg: string): void {
  console.log(`${ts()} ${color}[${label}]${RESET} ${msg}`);
}

// -- Prompt loading --
const reviewPrompt = readFileSync(join(__dirname, 'prompts', 'review.md'), 'utf-8');
const executePrompt = readFileSync(join(__dirname, 'prompts', 'execute.md'), 'utf-8');

// -- Agent Runner --

async function runReviewAgent(ticket: TicketDetails): Promise<void> {
  const projectDir = CONFIG.PROJECTS[ticket.project];
  if (!projectDir) {
    throw new Error(`Unknown project: "${ticket.project}"`);
  }

  log(CYAN, 'REVIEW', `Starting review for "${ticket.title}" in ${ticket.project}`);

  const prompt = [
    reviewPrompt,
    '',
    '## Ticket',
    `**Title**: ${ticket.title}`,
    '',
    '**Description**:',
    ticket.description,
    '',
    '**Page Content**:',
    ticket.bodyBlocks,
  ].join('\n');

  const messages = query({
    prompt,
    options: {
      cwd: projectDir,
      tools: ['Read', 'Glob', 'Grep', 'Task'],
      allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      maxTurns: CONFIG.REVIEW_MAX_TURNS,
      maxBudgetUsd: CONFIG.REVIEW_BUDGET_USD,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      stderr: (data: string) => {
        if (data.trim()) log(DIM, 'STDERR', data.trim());
      },
    },
  });

  let output = '';
  let cost = 0;

  for await (const message of messages) {
    if (message.type === 'assistant') {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            output = block.text;
          }
        }
      } else if (typeof content === 'string') {
        output = content;
      }
    }
    if (message.type === 'result') {
      cost = message.total_cost_usd ?? 0;
      if (message.subtype !== 'success') {
        throw new Error(`Review agent failed: ${message.subtype}`);
      }
      // Use result text if available
      if (message.result) {
        output = message.result;
      }
    }
  }

  // Parse structured output from the last JSON block in the response
  const parsed = extractJsonFromOutput(output);
  if (!parsed) {
    throw new Error('Review agent did not produce valid JSON output');
  }

  const results: ReviewOutput = {
    easeScore: clamp(Number(parsed.easeScore) || 5, 1, 10),
    confidenceScore: clamp(Number(parsed.confidenceScore) || 5, 1, 10),
    spec: String(parsed.spec ?? ''),
    impactReport: String(parsed.impactReport ?? ''),
    affectedFiles: Array.isArray(parsed.affectedFiles) ? parsed.affectedFiles.map(String) : [],
    risks: parsed.risks ? String(parsed.risks) : undefined,
  };

  await writeReviewResults(ticket.id, results);
  await moveTicketStatus(ticket.id, CONFIG.COLUMNS.SCORED);

  log(GREEN, 'REVIEW', `Done: ease=${results.easeScore} confidence=${results.confidenceScore} cost=$${cost.toFixed(2)}`);
}

async function runExecuteAgent(ticket: TicketDetails): Promise<void> {
  const projectDir = CONFIG.PROJECTS[ticket.project];
  if (!projectDir) {
    throw new Error(`Unknown project: "${ticket.project}"`);
  }

  // Create branch name
  const shortId = ticket.id.replace(/-/g, '').slice(0, 8);
  const slug = ticket.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const branchName = `notion/${shortId}/${slug}`;

  log(MAGENTA, 'EXECUTE', `Starting execution for "${ticket.title}" on branch ${branchName}`);

  // Move to In Progress immediately
  await moveTicketStatus(ticket.id, CONFIG.COLUMNS.IN_PROGRESS);

  // Git: create and checkout branch
  try {
    execSync(`git checkout -b ${branchName}`, { cwd: projectDir, stdio: 'pipe' });
  } catch {
    // Branch might already exist (retry scenario)
    try {
      execSync(`git checkout ${branchName}`, { cwd: projectDir, stdio: 'pipe' });
    } catch (e) {
      throw new Error(`Failed to checkout branch ${branchName}: ${e}`);
    }
  }

  let cost = 0;

  try {
    const prompt = [
      executePrompt,
      '',
      '## Ticket',
      `**Title**: ${ticket.title}`,
      '',
      '**Description**:',
      ticket.description,
      '',
      '**Spec**:',
      ticket.spec ?? '(no spec provided)',
      '',
      '**Impact Analysis**:',
      ticket.impact ?? '(no impact analysis provided)',
      '',
      '**Page Content**:',
      ticket.bodyBlocks,
    ].join('\n');

    const messages = query({
      prompt,
      options: {
        cwd: projectDir,
        allowedTools: [
          'Read', 'Glob', 'Grep', 'Edit', 'Write', 'Task',
          'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git status:*)',
          'Bash(git diff:*)', 'Bash(git log:*)',
          'Bash(npm run build:*)', 'Bash(npm test:*)', 'Bash(npx tsc:*)',
        ],
        disallowedTools: ['WebFetch', 'WebSearch'],
        maxTurns: CONFIG.EXECUTE_MAX_TURNS,
        maxBudgetUsd: CONFIG.EXECUTE_BUDGET_USD,
        permissionMode: 'acceptEdits',
        settingSources: ['project'],
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        stderr: (data: string) => {
          if (data.trim()) log(DIM, 'STDERR', data.trim());
        },
      },
    });

    for await (const message of messages) {
      if (message.type === 'result') {
        cost = message.total_cost_usd ?? 0;
        if (message.subtype !== 'success') {
          throw new Error(`Execute agent failed: ${message.subtype}`);
        }
      }
    }

    // Post-execution: validate build
    const buildCmd = CONFIG.BUILD_COMMANDS[ticket.project];
    if (buildCmd) {
      log(YELLOW, 'VALIDATE', `Running: ${buildCmd}`);
      try {
        execSync(buildCmd, { cwd: projectDir, stdio: 'pipe', timeout: 120_000 });
        log(GREEN, 'VALIDATE', 'Build passed');
      } catch (e) {
        const buildErr = e instanceof Error ? e.message : String(e);
        throw new Error(`Build validation failed: ${buildErr}`);
      }
    }

    // Push branch
    log(CYAN, 'PUSH', `Pushing ${branchName}`);
    execSync(`git push -u origin ${branchName}`, { cwd: projectDir, stdio: 'pipe' });

    // Create PR
    let prUrl = '';
    try {
      log(CYAN, 'PR', 'Creating pull request...');
      const prBody = [
        '## Summary',
        '',
        ticket.spec ?? ticket.description,
        '',
        '## Impact',
        '',
        ticket.impact ?? '_No impact analysis_',
        '',
        `## Notion Ticket`,
        '',
        `[View in Notion](https://www.notion.so/${ticket.id.replace(/-/g, '')})`,
        '',
        '---',
        `Cost: $${cost.toFixed(2)} | Review: Ease ${extractNumber(ticket, 'ease')}/10, Confidence ${extractNumber(ticket, 'confidence')}/10`,
      ].join('\n');

      const prResult = execSync(
        `gh pr create --title ${shellEscape(ticket.title)} --body ${shellEscape(prBody)} --base main --head ${branchName}`,
        { cwd: projectDir, stdio: 'pipe', timeout: 30_000 },
      );
      prUrl = prResult.toString().trim();
      log(GREEN, 'PR', `Created: ${prUrl}`);
    } catch (e) {
      // PR creation is best-effort — don't fail the ticket over it
      log(YELLOW, 'PR', `Failed to create PR: ${e instanceof Error ? e.message : e}`);
    }

    // Update Notion
    await writeExecutionResults(ticket.id, { branch: branchName, cost, prUrl });
    await moveTicketStatus(ticket.id, CONFIG.COLUMNS.DONE);

    log(GREEN, 'EXECUTE', `Done: branch=${branchName} cost=$${cost.toFixed(2)}${prUrl ? ` pr=${prUrl}` : ''}`);
  } catch (error) {
    // On failure, clean up: checkout main, optionally delete branch
    try {
      execSync('git checkout main', { cwd: projectDir, stdio: 'pipe' });
    } catch {
      // Best effort
    }
    throw error;
  } finally {
    // Always return to main branch
    try {
      execSync('git checkout main', { cwd: projectDir, stdio: 'pipe' });
    } catch {
      // Best effort
    }
  }
}

// -- Orchestration --

async function handleTicket(mode: 'review' | 'execute', ticket: TicketDetails): Promise<void> {
  const lockKey = ticket.id;

  if (activeLocks.has(lockKey)) {
    return; // Already being processed
  }

  // Check project mapping
  if (!CONFIG.PROJECTS[ticket.project]) {
    log(RED, 'ERROR', `Unknown project "${ticket.project}" for ticket "${ticket.title}"`);
    await writeFailure(ticket.id, `Unknown project: "${ticket.project}". Known projects: ${Object.keys(CONFIG.PROJECTS).join(', ')}`);
    return;
  }

  activeLocks.set(lockKey, { mode, startedAt: Date.now() });
  activeAgentCount++;

  try {
    if (mode === 'review') {
      await runReviewAgent(ticket);
    } else {
      await runExecuteAgent(ticket);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(RED, 'FAILED', `${mode} failed for "${ticket.title}": ${errMsg}`);

    try {
      await writeFailure(ticket.id, errMsg);
    } catch (notionErr) {
      log(RED, 'NOTION', `Failed to write failure to Notion: ${notionErr}`);
    }
  } finally {
    activeLocks.delete(lockKey);
    activeAgentCount--;
  }
}

function clearStaleLocks(): void {
  const now = Date.now();
  for (const [id, lock] of activeLocks) {
    if (now - lock.startedAt > CONFIG.STALE_LOCK_MS) {
      log(YELLOW, 'STALE', `Releasing stale lock for ${id} (mode: ${lock.mode})`);
      activeLocks.delete(id);
    }
  }
}

async function poll(): Promise<void> {
  if (shuttingDown) return;

  log(DIM, 'POLL', `Checking Notion board...${DRY_RUN ? ' (dry-run)' : ''}`);

  try {
    // Clear stale locks
    clearStaleLocks();

    // Fetch tickets in Review and Execute columns
    const [reviewTickets, executeTickets] = await Promise.all([
      fetchTicketsByStatus(CONFIG.COLUMNS.REVIEW),
      fetchTicketsByStatus(CONFIG.COLUMNS.EXECUTE),
    ]);

    const pendingReview = reviewTickets.filter((t) => !activeLocks.has(t.id));
    const pendingExecute = executeTickets.filter((t) => !activeLocks.has(t.id));

    if (pendingReview.length > 0) {
      log(CYAN, 'POLL', `Found ${pendingReview.length} ticket(s) to review`);
    }
    if (pendingExecute.length > 0) {
      log(MAGENTA, 'POLL', `Found ${pendingExecute.length} ticket(s) to execute`);
    }
    if (pendingReview.length === 0 && pendingExecute.length === 0) {
      log(DIM, 'POLL', 'No tickets to process');
    }

    if (DRY_RUN) return;

    // Process tickets (one at a time per poll to avoid overload)
    for (const ticket of pendingReview) {
      if (shuttingDown) break;
      const details = await fetchTicketDetails(ticket.id);
      // Fire and forget - runs in background, lock prevents duplicates
      handleTicket('review', details);
    }

    for (const ticket of pendingExecute) {
      if (shuttingDown) break;
      const details = await fetchTicketDetails(ticket.id);
      handleTicket('execute', details);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(RED, 'POLL', `Error during poll: ${errMsg}`);
  }
}

// -- Graceful Shutdown --

function setupShutdown(): void {
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    log(YELLOW, 'SHUTDOWN', 'Received signal, waiting for active agents to finish...');

    // Wait up to 5 minutes for active agents
    const deadline = Date.now() + 5 * 60 * 1000;
    while (activeAgentCount > 0 && Date.now() < deadline) {
      log(YELLOW, 'SHUTDOWN', `${activeAgentCount} agent(s) still running...`);
      await sleep(5_000);
    }

    if (activeAgentCount > 0) {
      log(RED, 'SHUTDOWN', `Force exiting with ${activeAgentCount} agent(s) still running`);
    } else {
      log(GREEN, 'SHUTDOWN', 'All agents finished. Exiting cleanly.');
    }

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// -- Main --

async function main(): Promise<void> {
  // Validate environment
  if (!process.env.NOTION_TOKEN) {
    console.error('Missing NOTION_TOKEN in .env.local');
    process.exit(1);
  }
  if (!process.env.NOTION_DATABASE_ID) {
    console.error('Missing NOTION_DATABASE_ID in .env.local');
    process.exit(1);
  }

  setupShutdown();

  console.log('');
  log(GREEN, 'START', 'Notion-Claude Bridge');
  log(DIM, 'CONFIG', `Poll interval: ${CONFIG.POLL_INTERVAL_MS / 1000}s`);
  log(DIM, 'CONFIG', `Projects: ${Object.keys(CONFIG.PROJECTS).join(', ')}`);
  log(DIM, 'CONFIG', `Review budget: $${CONFIG.REVIEW_BUDGET_USD} / Execute budget: $${CONFIG.EXECUTE_BUDGET_USD}`);
  if (DRY_RUN) log(YELLOW, 'CONFIG', 'DRY-RUN mode: polling only, no agents will run');
  if (ONCE) log(YELLOW, 'CONFIG', 'ONE-SHOT mode: will exit after first poll');
  console.log('');

  // First poll
  await poll();

  if (ONCE) {
    // In one-shot mode, wait for any agents that were launched
    while (activeAgentCount > 0) {
      log(DIM, 'WAIT', `${activeAgentCount} agent(s) still running...`);
      await sleep(5_000);
    }
    log(GREEN, 'DONE', 'One-shot complete');
    process.exit(0);
  }

  // Poll loop
  while (!shuttingDown) {
    await sleep(CONFIG.POLL_INTERVAL_MS);
    await poll();
  }
}

// -- Utilities --

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function extractJsonFromOutput(text: string): Record<string, unknown> | null {
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

function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

function extractNumber(ticket: TicketDetails, field: string): string {
  // Pull ease/confidence from the impact text if available
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

function loadEnv(filepath: string): void {
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

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
