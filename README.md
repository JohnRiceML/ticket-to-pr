<div align="center">

# TicketToPR

[![npm version](https://img.shields.io/npm/v/ticket-to-pr.svg)](https://www.npmjs.com/package/ticket-to-pr)

### Drag a Notion ticket. Get a pull request.

AI-powered development automation that turns your Notion backlog into shipped code.

[Get Started](#quick-start) | [How It Works](#how-it-works) | [Pricing](#pricing) | [Docs](https://www.tickettopr.com)

</div>

---

## What is TicketToPR?

TicketToPR is an open-source developer tool that connects your **Notion kanban board** to **Claude Code AI agents**. Write a ticket in Notion, drag it to a column, and Claude handles the rest — reading your codebase, scoring the ticket's feasibility, writing the code, validating the build, and opening a GitHub pull request. You review and merge.

No SaaS. No cloud. Runs entirely on your machine. Your code never leaves your environment.

### The Problem

Every dev has a backlog full of tasks they know exactly how to do but never have time for — add an endpoint, wire up a new field, fix that copy, refactor that util. Each one is 20 minutes of context-switching you can't afford when you're deep in complex feature work.

### The Solution

TicketToPR clears that pile. Toss tickets on your Notion board, drag to Review, glance at the AI's feasibility scores, drag to Execute, and merge the PRs when you're ready. Your flow stays unbroken.

## Key Features

- **Notion-native workflow** — no new tools to learn. If your team uses Notion, you're ready.
- **AI scores before AI codes** — every ticket gets an ease/confidence rating and implementation spec before a single line is written. You always decide go/no-go.
- **Your codebase, your rules** — Claude reads your project's `CLAUDE.md` and follows your conventions, patterns, and constraints.
- **Build validation** — code must pass your build command before anything pushes. No broken PRs.
- **Blocked file guardrails** — configure glob patterns for files the agent must never touch (e.g. migrations, DB schemas). Enforced via prompt injection into both review and execute agents + hard post-diff validation.
- **Full audit trail** — cost, duration, scores, branch name, PR link, and agent comments posted directly on the Notion ticket.
- **Cost transparency** — every ticket shows exactly what it cost. Simple tasks run $0.35-0.55.
- **Human-in-the-loop** — nothing merges without a developer reviewing the PR.
- **Background service** — run continuously or on-demand. Process tickets while you sleep.

## How It Works

```
  YOU                        CLAUDE                      YOU
  write ticket               reads codebase              review scores
  drag to Review             scores feasibility          go/no-go?
                             writes spec + risks

  drag to Execute            creates branch              review PR
                             implements code              merge
                             validates build
                             pushes + opens PR
```

### The Board

TicketToPR uses a Notion board with 7 columns. Each column represents a stage in the pipeline:

```
Backlog          No automation. Park ideas here.
   |
   v
Review           Claude reads the codebase (read-only).
   |             Writes: Ease (1-10), Confidence (1-10), Spec, Impact, Risks.
   v
Scored           Human reads the scores and spec. Decides go/no-go.
   |
   v
Execute          Claude creates branch, implements code, commits changes.
   |             TicketToPR validates build, pushes branch, creates PR.
   v
In Progress      Set automatically when the execute agent starts working.
   |
   v
PR Ready         Branch pushed. PR created on GitHub.
                 Branch name, cost, and PR link written to ticket.

Failed           Agent errored. Error details on ticket.
                 Drag back to Review or Execute to retry.
```

The rhythm is **you, AI, you, AI, AI, you** — three human touchpoints, three AI steps. You're always the decision-maker. The AI is always the worker.

### What It's Great At

- Endpoint scaffolding and API routes
- Config changes and environment wiring
- Copy updates and text changes
- Bug fixes with clear reproduction steps
- Adding fields, props, or form elements
- Refactoring utilities and helpers
- Simple CRUD operations
- Test file scaffolding

### What It's Not For

- Greenfield architecture decisions
- Vague "make it better" tasks
- Large-scale refactors spanning 20+ files
- Tasks requiring human judgment or design sense
- Anything you wouldn't trust a junior dev to do alone

## Quick Start

```bash
npm install -g ticket-to-pr

# Guided setup — configures Notion, projects, and .env.local
ticket-to-pr init

# Verify everything is working
ticket-to-pr doctor

# Test connection
ticket-to-pr --dry-run --once

# Run once (process all pending tickets)
ticket-to-pr --once

# Run continuously (polls every 30s)
ticket-to-pr
```

## Prerequisites

| Tool | Install | Verify |
|------|---------|--------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) or `nvm install 22` | `node --version` |
| **Claude Code CLI** | `npm install -g @anthropic-ai/claude-code` | `claude --version` |
| **Claude authentication** | `claude` (follow login prompts) | `claude "hello"` returns a response |
| **Git** | [git-scm.com](https://git-scm.com) | `git --version` |
| **GitHub CLI** | `brew install gh` | `gh auth status` |
| **Notion account** | [notion.so](https://notion.so) | Can access a workspace |

The Claude CLI must be authenticated with an API key or Anthropic account that has credits. TicketToPR spawns Claude agents via the SDK which bills against your account.

## Setup

### 1. Create a Notion Integration

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations)
2. Click **"New integration"**
3. Name: `TicketToPR`
4. Associated workspace: select yours
5. Capabilities: enable **Read content**, **Update content**, **Insert content**
6. Click Submit
7. Copy the **Internal Integration Token** (starts with `ntn_`)

### 2. Create the Notion Board

Create a new **Board view** database in Notion with these properties:

| Property | Type | Purpose |
|----------|------|---------|
| `Name` | Title | Ticket name (Notion default) |
| `Status` | Status | Board columns (kanban lanes) |
| `Description` | Text | What needs to be done |
| `Project` | Text or Select | Maps to a local directory (must match `projects.json`) |
| `Ease` | Number | 1-10 feasibility score (written by AI) |
| `Confidence` | Number | 1-10 clarity score (written by AI) |
| `Spec` | Text | Implementation plan (written by AI) |
| `Impact` | Text | Files affected + risks (written by AI) |
| `Branch` | Text | Git branch name (written by AI) |
| `Cost` | Text | USD spent on the Claude run |
| `PR URL` | URL | GitHub pull request link (written by AI) |

Add these **7 status columns**:

```
Backlog | Review | Scored | Execute | In Progress | PR Ready | Failed
```

Connect the integration: **"..." menu** on the database page -> **Connections** -> search **TicketToPR** -> add it.

Copy the **database ID** from the URL:

```
https://www.notion.so/yourteam/abc123def456789...?v=...
                                ^^^^^^^^^^^^^^^^^^^^^^^^
                                this is the database ID
```

### 3. Run `init`

The guided setup configures everything interactively — Notion credentials, tools, models, and projects:

```bash
ticket-to-pr init
```

Init validates as you go: invalid Notion tokens and database IDs are rejected immediately (you'll be re-prompted), and it warns about missing tools. If you re-run `init` later, it detects existing config and asks whether to update or start fresh.

### 4. Verify

```bash
ticket-to-pr doctor
# Should show all checks passing, including database schema validation

ticket-to-pr --dry-run --once
# Should connect to Notion and report "No tickets to process"
```

`doctor` now validates your Notion database schema — it checks that all 10 required properties (Name, Status, Project, Ease, Confidence, Spec, Impact, Branch, Cost, PR URL) exist with the correct types, and warns if Project select options don't match `projects.json`.

## Usage

### CLI Commands & Flags

| Command / Flag | Behavior |
|----------------|----------|
| `init` | Guided setup — validates Notion credentials live, auto-detects build commands, generates starter `CLAUDE.md`, configures projects, writes `.env.local` and `projects.json`. Detects existing config on re-run. |
| `doctor` | Diagnostic check — verifies environment, Notion connectivity, database schema, tools, and projects |
| `model` | View current models and available options |
| `model <review\|execute\|both> <model>` | Set the Claude model for an agent. Accepts aliases (`opus`, `sonnet`, `haiku`) or full model IDs. |
| `learnings` | View accumulated project learnings from past agent runs |
| `learnings <project>` | View learnings for a specific project |
| `learnings clear <project>` | Clear a project's learnings file |
| *(none)* | Continuous polling every 30s |
| `--once` | Poll once, wait for agents to finish, exit |
| `--dry-run` | Poll and log what would happen, don't run agents |
| `--dry-run --once` | Single poll, log findings, exit immediately |

### `init` — Guided Setup

Run `ticket-to-pr init` to configure TicketToPR interactively:

```
TicketToPR Setup

  Existing configuration detected
  Update existing config or start fresh? (update):
  Pre-filling from existing config

Step 1: Notion
  Notion token (ntn_...M7qr):     → validates immediately
  ✓ Token valid  My Workspace
  Database ID (306d...ac35):       → validates immediately
  ✓ Database accessible  Dev Board

Step 2: Tools
  ✓ claude  2.1.34 (Claude Code)
  ✓ gh  gh version 2.86.0
  ✓ gh authenticated

Step 3: Models
  Review model (sonnet/opus/haiku) (sonnet):
  Execute model (sonnet/opus/haiku) (opus):

Step 4: Projects
  Project name: MyApp
  Directory: /Users/you/Projects/MyApp
  ✓ Git repo  git@github.com:you/MyApp.git
  Build command (npm run build):                    ← auto-detected from package.json
  Base branch (main):
  Glob patterns the agent must never touch (e.g. **/migrations/**, prisma/schema.prisma, **/*.sql)
  Blocked file patterns (optional, comma-separated):
  Skip automatic PR creation? (N):
  Detected: TypeScript, Next.js, Tailwind CSS       ← auto-detected from project files
  Generate starter CLAUDE.md? (Y):
  ✓ Generated CLAUDE.md  /Users/you/Projects/MyApp/CLAUDE.md
  Edit it to add project-specific rules and conventions.

  Add another project? (N):

Step 5: Save
  ✓ Wrote .env.local
  ✓ Updated projects.json

Ready!
  Test:  ticket-to-pr doctor
  Docs:  https://www.tickettopr.com
```

- **Blocks on bad config** — invalid Notion tokens and database IDs are rejected and re-prompted (won't save broken credentials)
- **Auto-detects build command** — reads `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, or `Makefile` and pre-fills the build command. Press Enter to accept or override.
- **Generates starter CLAUDE.md** — detects your project stack (language, framework, test runner, CSS, ORM) and offers to generate a `CLAUDE.md` with build commands, code style, and file structure. Both agents read this file for context.
- **Re-run safe** — detects existing `.env.local` and `projects.json`, asks "update" or "start fresh"
- **Free tier guard** — warns if you configure multiple projects without a Pro license
- Masks existing secrets when showing defaults

### `doctor` — Diagnostic Check

Run `ticket-to-pr doctor` to verify your setup. It checks everything non-interactively:

```
TicketToPR Doctor

Environment:
  ✓ .env.local exists
  ✓ NOTION_TOKEN set         ntn_...M7qr
  ✓ NOTION_DATABASE_ID set   306d...ac35
  ○ LICENSE_KEY               Free tier

Models:
  ✓ Review model              claude-sonnet-4-6
  ✓ Execute model             claude-opus-4-6

Notion:
  ✓ Token valid               connected to workspace
  ✓ Database accessible

Database Schema:
  ✓ All 10 required properties found
  ✓ Project options match projects.json

Tools:
  ✓ gh installed              gh version 2.86.0
  ✓ gh authenticated
  ✓ claude installed          2.1.34 (Claude Code)

Projects:
  ✓ MyApp                     /Users/you/Projects/MyApp
  ○   Base branch             main (auto-detected)
  ○   Blocked files           none configured

Summary: 14 passed, 3 warnings, 0 failed
Docs: https://www.tickettopr.com
```

- `✓` = passed, `✗` = failed, `○` = warning (non-blocking)
- **Database schema check** — verifies all 10 required Notion properties exist with correct types (Name, Status, Project, Ease, Confidence, Spec, Impact, Branch, Cost, PR URL)
- **Project mismatch detection** — if Project is a Select field, warns when Notion options and `projects.json` keys don't match
- `gh` missing is a warning (PRs won't auto-create but everything else works), `claude` missing is a hard failure
- Exits with code 1 if any hard failures, 0 otherwise

### `model` — Change AI Models

View or change which Claude models the agents use:

```bash
# Show current models and available options
ticket-to-pr model

# Set review model (used for scoring tickets)
ticket-to-pr model review sonnet

# Set execute model (used for writing code)
ticket-to-pr model execute opus

# Set both at once
ticket-to-pr model both haiku
```

Available model aliases:

| Alias | Model ID | Best for |
|-------|----------|----------|
| `opus` | `claude-opus-4-6` | Best quality (recommended for execute) |
| `sonnet` | `claude-sonnet-4-6` | Fast and capable (recommended for review) |
| `sonnet45` | `claude-sonnet-4-5-20250929` | Previous generation Sonnet |
| `haiku` | `claude-haiku-4-5-20251001` | Fastest, lowest cost |

You can also pass a full model ID directly (e.g. `ticket-to-pr model review claude-sonnet-4-5-20250929`). Changes are saved to `.env.local` and take effect on the next poll cycle.

### `learnings` — Project Memory

TicketToPR accumulates learnings from every agent run — successes, failures, patterns, and mistakes. These are automatically injected into future agent prompts so the AI gets smarter about your project over time.

```bash
# View all project learnings
ticket-to-pr learnings

# View learnings for a specific project
ticket-to-pr learnings MyProject

# Clear learnings for a project (start fresh)
ticket-to-pr learnings clear MyProject
```

Learnings are stored in each project directory at `.ticket-to-pr/learnings.md` (auto-gitignored). Failed tickets are especially valuable — the agent learns what not to do next time.

### Your First Ticket

1. Click **"+ New"** on your Notion board
2. **Name**: "Add a hello world test endpoint"
3. **Project**: Your project name from `projects.json`
4. **Description**: `Create a simple GET endpoint at /api/test/hello that returns { message: "hello world" }`
5. Drag to **Review** column
6. Run `ticket-to-pr --once` and watch it score the ticket
7. Check Notion — ticket should be in **Scored** with Ease, Confidence, Spec, Impact filled in
8. Drag to **Execute**, run `ticket-to-pr --once` again
9. Check Notion — ticket should be in **PR Ready** with Branch, Cost, and PR link

Typical cost for this test: **~$0.49** ($0.22 review + $0.27 execute).

### Running as a Background Service (macOS)

For always-on operation, create a launchd plist:

```bash
cat > ~/Library/LaunchAgents/com.ticket-to-pr.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ticket-to-pr</string>
    <key>ProgramArguments</key>
    <array>
        <string>ticket-to-pr</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/Projects/ticket-to-pr/bridge.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/Projects/ticket-to-pr/bridge.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>/Users/YOUR_USERNAME</string>
    </dict>
</dict>
</plist>
EOF
```

Replace `YOUR_USERNAME` and update PATH to include your Node.js binary directory (`which node` to find it).

```bash
# Start (also starts on login)
launchctl load ~/Library/LaunchAgents/com.ticket-to-pr.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.ticket-to-pr.plist

# Watch logs
tail -f ~/Projects/ticket-to-pr/bridge.log
```

## How the AI Agents Work

### Review Agent (Read-Only)

The review agent explores your codebase without modifying anything:

- **Tools**: Read, Glob, Grep, Task
- **Context**: Reads your project's `CLAUDE.md` for architecture rules. If `blockedFiles` are configured, the review agent factors those constraints into scoring.
- **Output**: Ease score, confidence score, implementation spec, impact report, affected files, risks, **acceptance test cases**
- **Budget**: $2.00 max, 25 turns max
- **Typical cost**: $0.15 - $0.50

### Scoring Rubric

| Ease Score | Meaning |
|-----------|---------|
| 8-10 | Single file, < 20 lines, trivial |
| 5-7 | 1-3 files, clear changes |
| 3-4 | Multiple files, design decisions needed |
| 1-2 | Architectural changes, new dependencies |

| Confidence Score | Meaning |
|-----------------|---------|
| 8-10 | Crystal clear requirements, well-known area |
| 5-7 | Some ambiguity, but manageable |
| 3-4 | Vague requirements, may need iteration |
| 1-2 | Too unclear to implement reliably |

### Execute Agent (Write Access)

The execute agent implements the code based on the spec. When the review agent generates acceptance tests, the execute agent follows a **test-first workflow** — writing test files before implementation code.

- **Tools**: Read, Glob, Grep, Edit, Write + limited Bash (git, build, test only)
- **Dev access** (opt-in): When `devAccess` is enabled, additionally allows `npx tsx`, `node`, `npm run`, `npx vitest`, `npx jest`, `npx prisma`, `python`, and `curl` to localhost/127.0.0.1 only
- **Cannot**: push, run destructive commands, modify databases, access the web, curl external hosts
- **Context**: Reads your project's `CLAUDE.md` for conventions and rules
- **Budget**: $15.00 max, 50 turns max
- **Typical cost**: $0.20 - $2.00

### Git Workflow

1. TicketToPR **fetches the latest** from `origin/<baseBranch>` (configurable per project, auto-detected by default)
2. Creates branch `notion/{8-char-id}/{ticket-slug}` based on the fresh remote state
3. Claude implements changes and makes atomic commits (test-first if acceptance tests were generated)
4. **Diff review**: a lightweight Haiku agent reviews the diff against the spec — catches issues before push
5. TicketToPR runs your build command (if configured)
6. If `blockedFiles` patterns are configured, validates no off-limits files were touched
7. All checks pass: pushes branch to origin
8. Creates a GitHub PR via `gh pr create` targeting the base branch (unless `skipPR` is enabled)
9. PR URL written back to the Notion ticket
10. Ticket moves to **PR Ready**
11. Any check fails (diff review, build, blocked files): no code is pushed, ticket moves to **Failed**

## Costs

TicketToPR itself is free. You pay Anthropic for Claude API usage. Based on real usage:

| Task Complexity | Review Cost | Execute Cost | Total |
|----------------|------------|-------------|-------|
| Trivial (1 file, < 20 lines) | $0.15 - $0.25 | $0.20 - $0.50 | **$0.35 - $0.75** |
| Simple (1-3 files) | $0.20 - $0.35 | $0.30 - $1.00 | **$0.50 - $1.35** |
| Medium (3-5 files) | $0.25 - $0.50 | $0.50 - $2.00 | **$0.75 - $2.50** |
| Complex (5+ files) | $0.30 - $0.50 | $2.00 - $8.00 | **$2.30 - $8.50** |

Budget limits prevent runaway costs: $2 per review, $15 per execution.

## Pricing

### Free (Open Source)

Everything you need to get started:

- Full review + execute pipeline
- 1 project
- Sequential processing
- Manual run via CLI
- Community support (GitHub Issues)

### Pro ($99, one-time)

For teams and power users who need scale:

- **Unlimited projects**
- **Parallel execution** (up to 10 concurrent agents)
- Background service support
- Notion audit trail comments
- Priority support
- All future updates included

No subscriptions. Pay once, own it forever. **[Upgrade at www.tickettopr.com](https://www.tickettopr.com)**

## Configuration Reference

All settings in `config.ts`:

| Setting | Default | Purpose |
|---------|---------|---------|
| `REVIEW_MODEL` | `claude-sonnet-4-6` | Review agent model (change with `ticket-to-pr model review <model>`) |
| `EXECUTE_MODEL` | `claude-opus-4-6` | Execute agent model (change with `ticket-to-pr model execute <model>`) |
| `POLL_INTERVAL_MS` | 30000 | How often to check Notion (ms) |
| `REVIEW_BUDGET_USD` | 2.00 | Max USD per review agent run |
| `EXECUTE_BUDGET_USD` | 15.00 | Max USD per execute agent run |
| `REVIEW_MAX_TURNS` | 25 | Max conversation turns for review |
| `EXECUTE_MAX_TURNS` | 50 | Max conversation turns for execute |
| `STALE_LOCK_MS` | 1800000 | Force-release hung agent locks (30 min) |

Project configuration in `projects.json`:

| Field | Purpose |
|-------|---------|
| `projects.<name>.directory` | Absolute path to the project's local git repo |
| `projects.<name>.buildCommand` | Optional build validation command (e.g. `npm run build`) |
| `projects.<name>.baseBranch` | Optional base branch (e.g. `develop`). Falls back to auto-detected default (`main`/`master`). |
| `projects.<name>.blockedFiles` | Optional array of glob patterns the agent must never touch (e.g. `["**/migrations/**", "**/*.sql"]`) |
| `projects.<name>.skipPR` | Optional boolean. Set `true` to push the branch but skip automatic PR creation. |
| `projects.<name>.devAccess` | Optional boolean. Set `true` to let the execute agent run scripts, query DBs, and hit local endpoints. |
| `projects.<name>.envFile` | Optional env file path relative to project directory (e.g. `.env.local`). Loaded into the agent's environment when set. |

## Project Structure

```
ticket-to-pr/
  index.ts              # Poll loop, agent runner, worktree git workflow, graceful shutdown
  cli.ts                # init, doctor, and model commands
  config.ts             # Budgets, column names, license check, TypeScript types
  projects.json         # Your project directories and build commands (git-ignored, copy from example)
  projects.example.json # Template for projects.json
  lib/
    utils.ts            # Pure utilities (shellEscape, loadEnv, getDefaultBranch, worktree helpers)
    projects.ts         # JSON-backed project config loader with caching
    notion.ts           # Notion API helpers (fetch, write, move status)
    __tests__/          # Unit tests (vitest)
  prompts/
    review.md           # Review agent system prompt with scoring rubric
    execute.md          # Execute agent system prompt with safety rules
  .env.local            # NOTION_TOKEN, NOTION_DATABASE_ID, model overrides (git-ignored)
  package.json          # Dependencies: @anthropic-ai/claude-agent-sdk, @notionhq/client, vitest
  tsconfig.json         # ESNext + NodeNext
```

## Adding a New Project

Add to `projects.json` (or re-run `ticket-to-pr init`):

```json
{
  "projects": {
    "MyProject": {
      "directory": "/absolute/path/to/project",
      "buildCommand": "npm run build",
      "baseBranch": "develop",
      "blockedFiles": ["**/migrations/**", "prisma/schema.prisma", "**/*.sql"],
      "skipPR": false
    }
  }
}
```

1. All fields except `directory` are optional — omit any you don't need
2. `baseBranch` — which branch to base feature branches on. Auto-detected (`main`/`master`) if omitted.
3. `blockedFiles` — glob patterns the agent must never touch. Enforced via prompt injection into both review and execute agents, plus a hard post-diff validation before push.
4. `skipPR` — set `true` to push branches without creating a PR (useful for repos that use a different PR workflow)
5. The directory must be a git repo with an `origin` remote
6. If the project has a `CLAUDE.md`, both agents will read it for context
7. Create Notion tickets with `Project` set to the exact key name (case-sensitive)
8. Run `ticket-to-pr doctor` to verify — it shows base branch, blocked files, and skip PR status per project

## Error Handling

| Failure | What Happens |
|---------|-------------|
| Notion API down | Logs error, skips poll cycle, retries next interval |
| Unknown project | Ticket -> Failed with "Unknown project" message listing available projects and case-sensitivity hint |
| Review agent fails | Ticket -> Failed, error written to Impact field with actionable detail |
| Execute agent fails | Worktree cleaned up, ticket -> Failed |
| Build validation fails | Ticket -> Failed with command, directory, and build output (up to 500 chars) |
| Blocked file violation | Ticket -> Failed with list of matched files and patterns. No code is pushed. |
| Push fails | Ticket -> Failed, branch remains local |
| PR creation fails | Ticket still moves to PR Ready (best-effort) |
| Duplicate poll trigger | Skipped via in-memory lock per ticket ID |
| Agent hangs > 30 min | Lock force-released, ticket -> Failed |

## Troubleshooting

<details>
<summary><strong>"API token is invalid"</strong></summary>

- Check `.env.local` has the correct `ntn_` token
- Make sure the integration is connected to the database ("..." -> Connections)
- If you edited `.env.local`, restart TicketToPR

</details>

<details>
<summary><strong>"Claude Code process exited with code 1"</strong></summary>

- Check `bridge.log` or terminal stderr for the actual error
- Make sure `claude` CLI is authenticated: run `claude "test"` manually
- Common cause: running inside another Claude Code session

</details>

<details>
<summary><strong>Ticket stuck in "In Progress"</strong></summary>

- Agent may have crashed mid-execution
- Check logs for the error
- Drag ticket back to Execute to retry, or to Failed

</details>

<details>
<summary><strong>"Unknown project" error</strong></summary>

- The `Project` field on the ticket doesn't match any key in `projects.json`
- Match is case-sensitive: `"MyApp"` != `"myapp"`
- The error message now lists available projects — check the terminal output

</details>

<details>
<summary><strong>Build validation fails but code looks correct</strong></summary>

- Check the branch locally: `git log notion/... --oneline`
- Run the build manually to see the actual error
- Ensure the default branch builds successfully before running tickets
- The error now shows the command, directory, and build output

</details>

<details>
<summary><strong>PR not created after push</strong></summary>

- Install GitHub CLI: `brew install gh`
- Authenticate: `gh auth login`
- Verify: `gh auth status`
- The project must have a GitHub `origin` remote
- PR creation is best-effort — the ticket still moves to PR Ready without it

</details>

<details>
<summary><strong>launchd service not starting</strong></summary>

- Validate plist: `plutil -lint ~/Library/LaunchAgents/com.ticket-to-pr.plist`
- Check PATH includes your Node.js binary directory
- Check logs: `tail -f ~/Projects/ticket-to-pr/bridge.log`

</details>

## Security

- **Your code stays local** — TicketToPR runs on your machine. Code is sent to the Claude API for processing but never stored by TicketToPR.
- **Read-only review** — the review agent cannot modify files. It only reads and analyzes.
- **Sandboxed execution** — the execute agent has no access to the web, cannot push code, and cannot run destructive commands. TicketToPR handles git operations separately.
- **Build gate** — code must pass your build validation before anything is pushed.
- **Blocked file gate** — if `blockedFiles` patterns are configured, they're injected into both the review and execute agent prompts. A hard post-diff check also runs before push. Any violations abort the run — no code reaches origin.
- **Human gate** — pull requests require your review and approval before merging.

## Tech Stack

- **TypeScript** — fully typed, runs with [tsx](https://github.com/privatenumber/tsx)
- **[Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)** — spawns Claude Code agents programmatically
- **[Notion Client](https://github.com/makenotion/notion-sdk-js)** — reads and writes Notion database properties
- **GitHub CLI (`gh`)** — creates pull requests after push
- **Zero external runtime dependencies** beyond the SDK and Notion client

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

> **End users** should install via `npm install -g ticket-to-pr`. The instructions below are for contributors.

```bash
git clone https://github.com/JohnRiceML/ticket-to-pr.git
cd ticket-to-pr
npm install
```

## License

MIT

---

<div align="center">

**Built by [John Rice](https://github.com/JohnRiceML)** | [www.tickettopr.com](https://www.tickettopr.com)

[Get Started](#quick-start) | [Report a Bug](https://github.com/JohnRiceML/ticket-to-pr/issues) | [Request a Feature](https://github.com/JohnRiceML/ticket-to-pr/issues)

</div>
