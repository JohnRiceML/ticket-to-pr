import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { CONFIG, REVIEW_OUTPUT_SCHEMA, isPro, type LockEntry, type TicketDetails, type ReviewOutput } from './config.js';
import { sleep, clamp, extractJsonFromOutput, shellEscape, extractNumber, loadEnv, createWorktree, removeWorktree, getDefaultBranch, validateNoBlockedFiles } from './lib/utils.js';
import { getProjectDir, getProjectNames, getBuildCommand, getBaseBranch, getBlockedFiles, getSkipPR } from './lib/projects.js';
import {
  fetchTicketsByStatus,
  fetchTicketDetails,
  writeReviewResults,
  writeExecutionResults,
  moveTicketStatus,
  writeFailure,
  addComment,
} from './lib/notion.js';
import { PACKAGE_ROOT, CONFIG_DIR } from './lib/paths.js';

// Load .env.local from the user's working directory
loadEnv(join(CONFIG_DIR, '.env.local'));

// Allow running inside a Claude Code session (e.g. during development)
delete process.env.CLAUDECODE;

// -- Subcommand routing --
const subcommand = process.argv[2];
if (subcommand === 'init' || subcommand === 'doctor') {
  const { runInit, runDoctor } = await import('./cli.js');
  await (subcommand === 'init' ? runInit() : runDoctor());
  process.exit(0);
}

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

// -- Prompt loading (bundled with the package) --
const reviewPrompt = readFileSync(join(PACKAGE_ROOT, 'prompts', 'review.md'), 'utf-8');
const executePrompt = readFileSync(join(PACKAGE_ROOT, 'prompts', 'execute.md'), 'utf-8');

// -- Agent Runner --

async function runReviewAgent(ticket: TicketDetails): Promise<void> {
  const projectDir = getProjectDir(ticket.project);
  if (!projectDir) {
    throw new Error(`Unknown project: "${ticket.project}"`);
  }

  log(CYAN, 'REVIEW', `Starting review for "${ticket.title}" in ${ticket.project}`);
  const startTime = Date.now();

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
      model: CONFIG.REVIEW_MODEL,
      cwd: projectDir,
      tools: ['Read', 'Glob', 'Grep', 'Task'],
      allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      maxTurns: CONFIG.REVIEW_MAX_TURNS,
      maxBudgetUsd: CONFIG.REVIEW_BUDGET_USD,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      outputFormat: {
        type: 'json_schema',
        schema: REVIEW_OUTPUT_SCHEMA as Record<string, unknown>,
      },
      stderr: (data: string) => {
        if (data.trim()) log(DIM, 'STDERR', data.trim());
      },
    },
  });

  let output = '';
  let structuredOutput: unknown = undefined;
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
      // Prefer structured_output from json_schema outputFormat
      if ('structured_output' in message && message.structured_output != null) {
        structuredOutput = message.structured_output;
      }
      if (message.result) {
        output = message.result;
      }
    }
  }

  // Prefer structured output (from outputFormat), fall back to JSON extraction from text
  const parsed = (structuredOutput as Record<string, unknown> | undefined) ?? extractJsonFromOutput(output);
  if (!parsed) {
    throw new Error(`Review agent failed to return scores. The agent used all ${CONFIG.REVIEW_MAX_TURNS} turns without producing a result. Try simplifying the ticket description or increasing REVIEW_MAX_TURNS in config.ts.`);
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

  const duration = Math.round((Date.now() - startTime) / 1000);

  // Add audit trail comment
  const comment = [
    '🔍 Review Complete',
    `Ease: ${results.easeScore}/10 | Confidence: ${results.confidenceScore}/10`,
    `Files: ${results.affectedFiles.length} analyzed`,
    `Cost: $${cost.toFixed(2)} | Duration: ${duration}s`,
  ].join('\n');
  await addComment(ticket.id, comment);

  log(GREEN, 'REVIEW', `Done: ease=${results.easeScore} confidence=${results.confidenceScore} cost=$${cost.toFixed(2)}`);
}

async function runExecuteAgent(ticket: TicketDetails): Promise<void> {
  const projectDir = getProjectDir(ticket.project);
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
  const worktreeDir = join(projectDir, '.worktrees', branchName.replace(/\//g, '_'));

  // Resolve per-project guardrails
  const baseBranch = getBaseBranch(ticket.project) || getDefaultBranch(projectDir);
  const blockedFiles = getBlockedFiles(ticket.project);
  const skipPR = getSkipPR(ticket.project);

  log(MAGENTA, 'EXECUTE', `Starting execution for "${ticket.title}" on branch ${branchName}`);
  const startTime = Date.now();

  // Move to In Progress immediately
  await moveTicketStatus(ticket.id, CONFIG.COLUMNS.IN_PROGRESS);

  // Git: create isolated worktree (fetches origin/<baseBranch> first)
  createWorktree(projectDir, branchName, worktreeDir, baseBranch);

  let cost = 0;
  let commitCount = 0;

  try {
    const promptParts = [
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
    ];

    if (blockedFiles.length > 0) {
      promptParts.push(
        '',
        '## BLOCKED FILES — DO NOT TOUCH',
        'The following file patterns are off-limits. Do NOT create, modify, or delete any files matching these patterns. Violations will cause the entire run to fail.',
        '',
        ...blockedFiles.map((p) => `- \`${p}\``),
      );
    }

    const prompt = promptParts.join('\n');

    const messages = query({
      prompt,
      options: {
        model: CONFIG.EXECUTE_MODEL,
        cwd: worktreeDir,
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

    // Count commits made
    try {
      const commitLog = execSync(`git log ${shellEscape(baseBranch)}..${shellEscape(branchName)} --oneline`, { cwd: worktreeDir, stdio: 'pipe' });
      commitCount = commitLog.toString().trim().split('\n').filter(Boolean).length;
    } catch {
      // If branch doesn't exist or no commits, count is 0
      commitCount = 0;
    }

    // Post-execution: validate build
    const buildCmd = getBuildCommand(ticket.project);
    let buildPassed = true;
    if (buildCmd) {
      log(YELLOW, 'VALIDATE', `Running: ${buildCmd}`);
      try {
        execSync(buildCmd, { cwd: worktreeDir, stdio: 'pipe', timeout: 120_000 });
        log(GREEN, 'VALIDATE', 'Build passed');
      } catch (e) {
        buildPassed = false;
        let detail = '';
        if (e && typeof e === 'object' && 'stderr' in e) {
          detail = String((e as { stderr: unknown }).stderr).slice(0, 500);
        }
        if (!detail && e && typeof e === 'object' && 'stdout' in e) {
          detail = String((e as { stdout: unknown }).stdout).slice(0, 500);
        }
        throw new Error(`Build validation failed.\nCommand: ${buildCmd}\nDirectory: ${worktreeDir}\n${detail ? `Output:\n${detail}` : (e instanceof Error ? e.message : String(e))}`);
      }
    }

    // Post-execution: validate no blocked files were touched
    if (blockedFiles.length > 0) {
      const violations = validateNoBlockedFiles(worktreeDir, baseBranch, blockedFiles);
      if (violations.length > 0) {
        throw new Error(
          `Blocked file violation — the agent modified files that are off-limits:\n${violations.map((v) => `  - ${v}`).join('\n')}\n\nNo code was pushed. Fix the blocked file patterns in projects.json or adjust the ticket scope.`
        );
      }
      log(GREEN, 'VALIDATE', 'No blocked file violations');
    }

    // Push branch
    log(CYAN, 'PUSH', `Pushing ${branchName}`);
    execSync(`git push -u origin ${shellEscape(branchName)}`, { cwd: worktreeDir, stdio: 'pipe' });

    // Create PR (unless skipPR is configured)
    let prUrl = '';
    if (skipPR) {
      log(YELLOW, 'PR', 'Skipping PR creation (skipPR enabled for this project)');
    } else {
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
          `gh pr create --title ${shellEscape(ticket.title)} --body ${shellEscape(prBody)} --base ${shellEscape(baseBranch)} --head ${branchName}`,
          { cwd: worktreeDir, stdio: 'pipe', timeout: 30_000 },
        );
        prUrl = prResult.toString().trim();
        log(GREEN, 'PR', `Created: ${prUrl}`);
      } catch (e) {
        // PR creation is best-effort — don't fail the ticket over it
        log(YELLOW, 'PR', `Failed to create PR: ${e instanceof Error ? e.message : e}`);
      }
    }

    // Update Notion
    await writeExecutionResults(ticket.id, { branch: branchName, cost, prUrl });
    await moveTicketStatus(ticket.id, CONFIG.COLUMNS.DONE);

    const duration = Math.round((Date.now() - startTime) / 1000);

    // Add success audit trail comment
    const comment = [
      '✅ Execute Complete',
      `Branch: ${branchName}`,
      prUrl ? `PR: ${prUrl}` : 'PR: Not created',
      `Build: ${buildPassed ? 'PASS' : 'N/A'}`,
      `Commits: ${commitCount}`,
      `Cost: $${cost.toFixed(2)} | Duration: ${duration}s`,
    ].join('\n');
    await addComment(ticket.id, comment);

    log(GREEN, 'EXECUTE', `Done: branch=${branchName} cost=$${cost.toFixed(2)}${prUrl ? ` pr=${prUrl}` : ''}`);
  } catch (error) {
    // On failure, add failure audit trail comment
    const duration = Math.round((Date.now() - startTime) / 1000);
    const errMsg = error instanceof Error ? error.message : String(error);
    const comment = [
      '❌ Execute Failed',
      `Error: ${errMsg.slice(0, 500)}`,
      `Phase: execution`,
      `Cost: $${cost.toFixed(2)} | Duration: ${duration}s`,
    ].join('\n');
    await addComment(ticket.id, comment);
    throw error;
  } finally {
    // Always clean up the worktree
    removeWorktree(projectDir, worktreeDir);
  }
}

// -- Orchestration --

async function handleTicket(mode: 'review' | 'execute', ticket: TicketDetails): Promise<void> {
  const lockKey = ticket.id;

  if (activeLocks.has(lockKey)) {
    return; // Already being processed
  }

  // Check project mapping
  if (!getProjectDir(ticket.project)) {
    const known = getProjectNames();
    log(RED, 'ERROR', `Unknown project "${ticket.project}" for ticket "${ticket.title}". Available projects: ${known.join(', ')}. Check that the Notion Project field matches projects.json exactly (case-sensitive).`);
    await writeFailure(ticket.id, `Unknown project: "${ticket.project}". Available projects: ${known.join(', ')}. Check that the Notion Project field matches projects.json exactly (case-sensitive).`);
    return;
  }

  const lockEntry = { mode, startedAt: Date.now() };
  activeLocks.set(lockKey, lockEntry);
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

    // Add failure comment for review (execute handles its own failure comments)
    if (mode === 'review') {
      const duration = Math.round((Date.now() - lockEntry.startedAt) / 1000);
      const comment = [
        '❌ Review Failed',
        `Error: ${errMsg.slice(0, 500)}`,
        `Phase: review`,
        `Duration: ${duration}s`,
      ].join('\n');
      await addComment(ticket.id, comment);
    }

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

    // Collect all pending tickets (review first, then execute)
    const allPendingTickets = [
      ...pendingReview.map((t) => ({ ticket: t, mode: 'review' as const })),
      ...pendingExecute.map((t) => ({ ticket: t, mode: 'execute' as const })),
    ];

    // Launch agents up to concurrency limit
    const availableSlots = CONFIG.MAX_CONCURRENT_AGENTS - activeLocks.size;
    const ticketsToProcess = allPendingTickets.slice(0, Math.max(0, availableSlots));

    if (ticketsToProcess.length > 0) {
      log(CYAN, 'QUEUE', `Launching ${ticketsToProcess.length} agent(s) (${activeLocks.size} already running, ${CONFIG.MAX_CONCURRENT_AGENTS} max)`);
    }

    if (ticketsToProcess.length < allPendingTickets.length) {
      const queued = allPendingTickets.length - ticketsToProcess.length;
      log(YELLOW, 'QUEUE', `${queued} ticket(s) queued for next poll (concurrency limit reached)`);
    }

    // Fire and forget - runs in background, lock prevents duplicates
    for (const { ticket, mode } of ticketsToProcess) {
      if (shuttingDown) break;
      const details = await fetchTicketDetails(ticket.id);
      handleTicket(mode, details).catch((err) => {
        log(RED, 'UNHANDLED', `Unexpected error in ${mode} for "${details.title}": ${err instanceof Error ? err.message : err}`);
      });
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
    console.error("Missing NOTION_TOKEN. Run 'npx tsx index.ts init' to configure, or create .env.local manually.");
    process.exit(1);
  }
  if (!process.env.NOTION_DATABASE_ID) {
    console.error("Missing NOTION_DATABASE_ID. Run 'npx tsx index.ts init' to configure, or create .env.local manually.");
    process.exit(1);
  }

  setupShutdown();

  const pro = isPro();
  const projectNames = getProjectNames();

  // Free tier: enforce 1-project limit
  if (!pro && projectNames.length > CONFIG.FREE_MAX_PROJECTS) {
    console.error(
      `Free tier supports ${CONFIG.FREE_MAX_PROJECTS} project. You have ${projectNames.length} configured.` +
      `\nRemove extra projects from projects.json, or add a LICENSE_KEY to .env.local to unlock unlimited projects.`
    );
    process.exit(1);
  }

  console.log('');
  log(GREEN, 'START', `TicketToPR ${pro ? '(Pro)' : '(Free)'}`);
  log(DIM, 'CONFIG', `Poll interval: ${CONFIG.POLL_INTERVAL_MS / 1000}s`);
  log(DIM, 'CONFIG', `Max concurrent agents: ${CONFIG.MAX_CONCURRENT_AGENTS}${pro ? '' : ' (upgrade to Pro for up to 10)'}`);
  log(DIM, 'CONFIG', `Projects: ${projectNames.join(', ')}`);
  log(DIM, 'CONFIG', `Review: ${CONFIG.REVIEW_MODEL} ($${CONFIG.REVIEW_BUDGET_USD} budget)`);
  log(DIM, 'CONFIG', `Execute: ${CONFIG.EXECUTE_MODEL} ($${CONFIG.EXECUTE_BUDGET_USD} budget)`);
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

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
