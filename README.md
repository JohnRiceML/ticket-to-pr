<div align="center">

# TicketToPR

### Drag a Notion ticket. Get a pull request.

AI-powered development automation that turns your Notion backlog into shipped code.

[Get Started](#quick-start) | [How It Works](#how-it-works) | [Pricing](#pricing) | [Documentation](#setup)

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
Done             Branch pushed. PR created on GitHub.
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
git clone https://github.com/JohnRiceML/ticket-to-pr.git
cd ticket-to-pr
npm install

# Guided setup — configures Notion, projects, and .env.local
npx tsx index.ts init

# Verify everything is working
npx tsx index.ts doctor

# Test connection
npx tsx index.ts --dry-run --once

# Run once (process all pending tickets)
npx tsx index.ts --once

# Run continuously (polls every 30s)
npx tsx index.ts
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
| `Project` | Text or Select | Maps to a local directory (must match `config.ts`) |
| `Ease` | Number | 1-10 feasibility score (written by AI) |
| `Confidence` | Number | 1-10 clarity score (written by AI) |
| `Spec` | Text | Implementation plan (written by AI) |
| `Impact` | Text | Files affected + risks (written by AI) |
| `Branch` | Text | Git branch name (written by AI) |
| `Cost` | Text | USD spent on the Claude run |
| `PR URL` | URL | GitHub pull request link (written by AI) |

Add these **7 status columns**:

```
Backlog | Review | Scored | Execute | In Progress | Done | Failed
```

Connect the integration: **"..." menu** on the database page -> **Connections** -> search **TicketToPR** -> add it.

Copy the **database ID** from the URL:

```
https://www.notion.so/yourteam/abc123def456789...?v=...
                                ^^^^^^^^^^^^^^^^^^^^^^^^
                                this is the database ID
```

### 3. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```bash
NOTION_TOKEN=ntn_your_token_here
NOTION_DATABASE_ID=your_32_char_hex_database_id
```

### 4. Authenticate GitHub CLI

```bash
gh auth login
# Choose: GitHub.com -> HTTPS -> Authenticate via browser

gh auth status
# Should show: Logged in to github.com as yourname
```

### 5. Register Your Projects

Edit `config.ts`:

```typescript
PROJECTS: {
  'MyApp': '/Users/yourname/Projects/MyApp',
},

BUILD_COMMANDS: {
  'MyApp': 'npm run build',
},
```

The `Project` field on each Notion ticket must match a key in `PROJECTS` exactly (case-sensitive). Each project directory must be a git repo with an `origin` remote.

### 6. Verify

```bash
npx tsx index.ts --dry-run --once
# Should connect to Notion and report "No tickets to process"
```

## Usage

### CLI Commands & Flags

| Command / Flag | Behavior |
|----------------|----------|
| `init` | Guided setup — configures Notion tokens, projects, `.env.local`, and `config.ts` |
| `doctor` | Diagnostic check — verifies environment, Notion connectivity, tools, and projects |
| *(none)* | Continuous polling every 30s |
| `--once` | Poll once, wait for agents to finish, exit |
| `--dry-run` | Poll and log what would happen, don't run agents |
| `--dry-run --once` | Single poll, log findings, exit immediately |

### `init` — Guided Setup

Run `npx tsx index.ts init` to configure TicketToPR interactively. It walks you through four steps:

```
TicketToPR Setup

Step 1: Notion
  Notion token: ntn_...          → tests connectivity immediately
  ✓ Token valid
  Database ID: abc123...         → tests database access
  ✓ Database accessible

Step 2: Tools
  ✓ gh  gh version 2.86.0
  ✓ gh authenticated
  ✓ claude  2.1.34 (Claude Code)

Step 3: Projects
  Project name: MyApp
  Directory: /Users/you/Projects/MyApp
  ✓ Git repo  git@github.com:you/MyApp.git
  Build command (optional): npm run build

  Add another project? (N):

Step 4: Save
  ✓ Wrote .env.local
  ✓ Updated config.ts

Ready!
  Test:  npx ticket-to-pr doctor
  Docs:  https://github.com/JohnRiceML/ticket-to-pr
```

- Masks existing secrets when showing defaults — safe to re-run
- Updates `.env.local` and `config.ts` in place (won't duplicate entries)
- Validates directories, git repos, and Notion connectivity as you go

### `doctor` — Diagnostic Check

Run `npx tsx index.ts doctor` to verify your setup. It checks everything non-interactively:

```
TicketToPR Doctor

Environment:
  ✓ .env.local exists
  ✓ NOTION_TOKEN set        ntn_...M7qr
  ✓ NOTION_DATABASE_ID set  306d...ac35
  ○ LICENSE_KEY              Free tier

Notion:
  ✓ Token valid              connected to workspace
  ✓ Database accessible

Tools:
  ✓ gh installed             gh version 2.86.0
  ✓ gh authenticated
  ✓ claude installed         2.1.34 (Claude Code)

Projects:
  ✓ MyApp                    /Users/you/Projects/MyApp

Summary: 10 passed, 1 warnings, 0 failed
Docs: https://github.com/JohnRiceML/ticket-to-pr
```

- `✓` = passed, `✗` = failed, `○` = warning (non-blocking)
- Exits with code 1 if any hard failures, 0 otherwise
- Run after `init` to confirm everything works, or anytime to diagnose issues

### Your First Ticket

1. Click **"+ New"** on your Notion board
2. **Name**: "Add a hello world test endpoint"
3. **Project**: Your project name from `config.ts`
4. **Description**: `Create a simple GET endpoint at /api/test/hello that returns { message: "hello world" }`
5. Drag to **Review** column
6. Run `npx tsx index.ts --once` and watch it score the ticket
7. Check Notion — ticket should be in **Scored** with Ease, Confidence, Spec, Impact filled in
8. Drag to **Execute**, run `npx tsx index.ts --once` again
9. Check Notion — ticket should be in **Done** with Branch, Cost, and PR link

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
        <string>npx</string>
        <string>tsx</string>
        <string>index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/Projects/ticket-to-pr</string>
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
- **Context**: Reads your project's `CLAUDE.md` for architecture rules
- **Output**: Ease score, confidence score, implementation spec, impact report, affected files, risks
- **Budget**: $2.00 max, 15 turns max
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

The execute agent implements the code based on the spec:

- **Tools**: Read, Glob, Grep, Edit, Write + limited Bash (git, build, test only)
- **Cannot**: push, run destructive commands, modify databases, access the web
- **Context**: Reads your project's `CLAUDE.md` for conventions and rules
- **Budget**: $15.00 max, 50 turns max
- **Typical cost**: $0.20 - $2.00

### Git Workflow

1. TicketToPR creates branch `notion/{8-char-id}/{ticket-slug}` from `main`
2. Claude implements changes and makes atomic commits
3. TicketToPR runs your build command (if configured)
4. Build passes: pushes branch to origin
5. Creates a GitHub PR via `gh pr create` (includes spec, impact, Notion link, cost)
6. PR URL written back to the Notion ticket
7. Ticket moves to **Done**
8. Build fails: branch kept locally, ticket moves to **Failed**

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

No subscriptions. Pay once, own it forever.

## Configuration Reference

All settings in `config.ts`:

| Setting | Default | Purpose |
|---------|---------|---------|
| `POLL_INTERVAL_MS` | 30000 | How often to check Notion (ms) |
| `REVIEW_BUDGET_USD` | 2.00 | Max USD per review agent run |
| `EXECUTE_BUDGET_USD` | 15.00 | Max USD per execute agent run |
| `REVIEW_MAX_TURNS` | 15 | Max conversation turns for review |
| `EXECUTE_MAX_TURNS` | 50 | Max conversation turns for execute |
| `STALE_LOCK_MS` | 1800000 | Force-release hung agent locks (30 min) |
| `PROJECTS` | `{}` | Notion project name -> local directory path |
| `BUILD_COMMANDS` | `{}` | Project name -> build validation command |

## Project Structure

```
ticket-to-pr/
  index.ts              # Poll loop, agent runner, git workflow, graceful shutdown
  cli.ts                # init (guided setup) and doctor (diagnostic check) commands
  config.ts             # Project mappings, budgets, column names, license gating
  lib/
    notion.ts           # Notion API helpers (fetch, write, move status)
  prompts/
    review.md           # Review agent system prompt with scoring rubric
    execute.md          # Execute agent system prompt with safety rules
  .env.local            # NOTION_TOKEN + NOTION_DATABASE_ID (git-ignored)
  package.json          # Dependencies: @anthropic-ai/claude-agent-sdk, @notionhq/client
  tsconfig.json         # ESNext + NodeNext
```

## Adding a New Project

```typescript
// config.ts
PROJECTS: {
  'MyProject': '/absolute/path/to/project',
},
BUILD_COMMANDS: {
  'MyProject': 'npm run build',  // optional
},
```

1. The directory must be a git repo with an `origin` remote
2. If the project has a `CLAUDE.md`, both agents will read it for context
3. Create Notion tickets with `Project` set to the exact key name
4. No other code changes needed

## Error Handling

| Failure | What Happens |
|---------|-------------|
| Notion API down | Logs error, skips poll cycle, retries next interval |
| Unknown project | Ticket -> Failed with "Unknown project" message |
| Review agent fails | Ticket -> Failed, error written to Impact field |
| Execute agent fails | Checks out main, ticket -> Failed |
| Build validation fails | Ticket -> Failed, branch kept locally for inspection |
| Push fails | Ticket -> Failed, branch remains local |
| PR creation fails | Ticket still moves to Done (best-effort) |
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

- The `Project` field on the ticket doesn't match any key in `config.ts`
- Match is case-sensitive: `"MyApp"` != `"myapp"`

</details>

<details>
<summary><strong>Build validation fails but code looks correct</strong></summary>

- Check the branch locally: `git log notion/... --oneline`
- Run the build manually to see the actual error
- Ensure `main` branch builds successfully before running tickets

</details>

<details>
<summary><strong>PR not created after push</strong></summary>

- Install GitHub CLI: `brew install gh`
- Authenticate: `gh auth login`
- Verify: `gh auth status`
- The project must have a GitHub `origin` remote
- PR creation is best-effort — the ticket still moves to Done without it

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
- **Human gate** — pull requests require your review and approval before merging.

## Tech Stack

- **TypeScript** — fully typed, runs with [tsx](https://github.com/privatenumber/tsx)
- **[Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)** — spawns Claude Code agents programmatically
- **[Notion Client](https://github.com/makenotion/notion-sdk-js)** — reads and writes Notion database properties
- **GitHub CLI (`gh`)** — creates pull requests after push
- **Zero external runtime dependencies** beyond the SDK and Notion client

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/JohnRiceML/ticket-to-pr.git
cd ticket-to-pr
npm install
```

## License

MIT

---

<div align="center">

**Built by [John Rice](https://github.com/JohnRiceML)**

[Get Started](#quick-start) | [Report a Bug](https://github.com/JohnRiceML/ticket-to-pr/issues) | [Request a Feature](https://github.com/JohnRiceML/ticket-to-pr/issues)

</div>
