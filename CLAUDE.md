# TicketToPR

**Drag a Notion ticket. Get a pull request.**

Every dev has a backlog full of tasks they know exactly how to do but never have time for — add an endpoint, wire up a new field, fix that copy, refactor that util. TicketToPR clears that pile. Write a ticket in Notion, drag it to a column, and Claude handles the implementation end-to-end: branch, code, build validation, PR. You review and merge. That's it.

### For developers

You're deep in a complex feature when a PM drops three "quick" tickets in your backlog. Each one is 20 minutes of context-switching you can't afford. With TicketToPR, you toss them on the board, drag to Review, glance at the feasibility scores over coffee, drag to Execute, and merge the PRs when you're ready. Your flow stays unbroken.

- **Offload the simple stuff** — endpoint scaffolding, config changes, copy updates, bug fixes with clear repro steps
- **AI scores before AI codes** — every ticket gets an ease/confidence rating and implementation spec before a single line is written
- **Your codebase, your rules** — Claude reads your project's CLAUDE.md and follows your conventions. Build must pass before anything pushes.
- **Full audit trail** — cost, duration, scores, and agent logs posted right on the Notion ticket

### For teams and businesses

- **Anyone can write a ticket** — PMs, designers, and founders can request changes through Notion without touching a terminal
- **Async AI development** — TicketToPR runs in the background, processing tickets while your team sleeps
- **Cost transparency** — every ticket shows exactly what it cost ($0.35-0.55 for simple tasks)
- **Human-in-the-loop** — nothing merges without a developer reviewing the PR

### How it works

1. **Write a ticket** in Notion with a title, description, and project name
2. **Drag to Review** — Claude reads your codebase and scores the ticket (ease, confidence, spec, risks)
3. **Read the scores** — decide if the AI's plan makes sense before any code is written
4. **Drag to Execute** — Claude creates a branch, implements the code, validates the build, pushes, and opens a PR
5. **Review the PR** — merge when you're happy, or drag back to iterate

Every step is logged on the ticket: scores, cost, branch name, PR link, and agent comments for full audit trail. Typical cost: **$0.35 - $0.55 per ticket** for simple tasks.

## Prerequisites

You need all of these installed and working before setup:

| Tool | Install | Verify |
|------|---------|--------|
| **Node.js 18+** | https://nodejs.org or `nvm install 22` | `node --version` |
| **Claude Code CLI** | `npm install -g @anthropic-ai/claude-code` | `claude --version` |
| **Claude authentication** | `claude` (follow login prompts) | `claude "hello"` returns a response |
| **Git** | https://git-scm.com | `git --version` |
| **GitHub CLI** (required for PRs) | `brew install gh` | `gh auth status` |
| **Notion account** | https://notion.so | Can access a workspace |

The Claude CLI must be authenticated with an API key or Anthropic account that has credits. TicketToPR spawns Claude agents via the SDK which bills against your account.

The GitHub CLI must be authenticated for automatic PR creation. Run `gh auth login`, choose **GitHub.com**, **HTTPS**, and authenticate via browser. Verify with `gh auth status`.

## What It Does

Anyone on your team drags a ticket into a column, and this tool does the rest:

```
Backlog         No automation. Park ideas here.
   |
   v
Review          Poller picks up ticket. Claude reads the codebase (read-only).
   |            Writes: Ease (1-10), Confidence (1-10), Spec, Impact, Risks.
   v
Scored          Human reads the scores and spec. Decides go/no-go.
   |
   v
Execute         Poller picks up ticket. Claude creates branch, implements code,
   |            commits changes. Bridge validates build, pushes branch.
   v
In Progress     Set immediately when execute agent starts working.
   |
   v
Done            Branch pushed to origin. PR auto-created on GitHub.
                Branch name, cost, and PR link on ticket.

Failed          Agent errored. Error details in Impact field.
                Drag back to Review or Execute to retry.
```

The human decision point is between **Scored** and **Execute**. You always review the AI's assessment before it writes any code.

## Quick Start

```bash
git clone <repo-url> ~/Projects/ticket-to-pr
cd ~/Projects/ticket-to-pr
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

## Testing & Verification

After completing setup, run this end-to-end test to verify TicketToPR works correctly. This test creates a simple ticket, runs it through the full review-and-execute pipeline, and validates all integrations.

### Pre-flight Checklist

Verify all dependencies are working before testing:

```bash
# Node.js 18+ installed
node --version
# Should output v18.x.x or higher

# Claude CLI installed
claude --version
# Should output version number

# GitHub CLI authenticated
gh auth status
# Should show "Logged in to github.com as yourname"

# Notion connection working
npx tsx index.ts --dry-run --once
# Should connect without errors and report "No tickets to process"
```

If any command fails, revisit the Prerequisites and Setup sections.

### Test Ticket Template

Create a new ticket in your Notion board with these exact values:

| Field | Value |
|-------|-------|
| **Name** | Add a health check endpoint |
| **Project** | `PeekABoo` (or your project name from `projects.json` — must match exactly) |
| **Description** | Create a GET endpoint at /api/health that returns `{ status: "ok", timestamp: <current ISO timestamp> }`. No auth required. |
| **Status** | Backlog (default) |

### Step-by-Step Test Flow

#### Step 1: Test Review Agent

1. **Drag the ticket to "Review" column** in Notion
2. **Run TicketToPR once**:
   ```bash
   npx tsx index.ts --once
   ```
3. **Watch the terminal output** — you should see:
   ```
   [POLL] Fetching tickets from Notion...
   [REVIEW] Processing ticket: Add a health check endpoint
   [REVIEW] Running review agent for project: PeekABoo
   [REVIEW] Agent completed successfully
   [REVIEW] Updated ticket with scores and analysis
   ```
4. **Verify in Notion** (refresh the page):
   - Status: **Scored**
   - Ease: number between 1-10 (typically 8-10 for simple tasks)
   - Confidence: number between 1-10 (typically 8-10 for clear requirements)
   - Spec: multi-line implementation plan (file to create, code structure, etc.)
   - Impact: list of affected files and risks
   - Cost: ~$0.15-0.25

#### Step 2: Test Execute Agent

1. **Review the scores and spec** — make sure they look reasonable
2. **Drag the ticket to "Execute" column** in Notion
3. **Run TicketToPR again**:
   ```bash
   npx tsx index.ts --once
   ```
4. **Watch the terminal output** — you should see:
   ```
   [EXECUTE] Processing ticket: Add a health check endpoint
   [EXECUTE] Running execute agent for project: PeekABoo
   [EXECUTE] Agent completed successfully
   [BUILD] Running build validation: npm run build
   [BUILD] Build passed
   [GIT] Pushing branch: notion/abc12345/add-a-health-check-endpoint
   [PR] Created pull request: https://github.com/yourname/PeekABoo/pull/123
   [EXECUTE] Ticket moved to Done
   ```
5. **Verify in Notion** (refresh the page):
   - Status: **Done**
   - Branch: `notion/abc12345/add-a-health-check-endpoint` (actual ID will vary)
   - Cost: updated with execute cost (~$0.20-0.30 added, ~$0.40-0.55 total)
   - PR URL: populated with GitHub pull request link

#### Step 3: Review the PR on GitHub

1. **Click the PR URL** in the Notion ticket
2. **Verify the PR contains**:
   - A new file like `app/api/health/route.ts` or similar
   - Code that returns `{ status: "ok", timestamp: <ISO timestamp> }`
   - PR description with spec, impact, Notion link, and cost
3. **Check the Files Changed tab** — should show only the new endpoint file
4. **Verify the code quality**:
   - Proper TypeScript types
   - Correct Next.js route handler pattern (if Next.js project)
   - No unrelated changes

#### Step 4: Clean Up

1. **Merge or close the test PR**:
   ```bash
   # Close without merging
   gh pr close 123

   # Or merge if you want to keep the health check endpoint
   gh pr merge 123 --squash
   ```
2. **Delete the test branch** (worktree is auto-cleaned, but the branch ref remains):
   ```bash
   cd ~/Projects/PeekABoo  # Or your project path
   git branch -D notion/abc12345/add-a-health-check-endpoint
   ```
3. **Delete the test ticket** in Notion (click "..." -> Delete)

### Expected Costs

Based on this simple test ticket:

- **Review agent**: $0.15 - $0.25
- **Execute agent**: $0.20 - $0.30
- **Total test cost**: ~$0.35 - $0.55

More complex tickets will cost more, but should stay well within the budget limits ($2 review, $15 execute).

### Common First-Run Issues

| Error | Cause | Quick Fix |
|-------|-------|-----------|
| **"API token is invalid"** | Wrong Notion token or integration not connected | Check `.env.local`, reconnect integration in Notion ("..." -> Connections) |
| **"Unknown project: PeekABoo"** | Project field doesn't match `projects.json` | Project name is case-sensitive — must match exactly |
| **"Claude Code process exited with code 1"** | Claude CLI not authenticated | Run `claude "test"` manually to verify authentication |
| **PR URL empty after Done** | GitHub CLI not authenticated | Run `gh auth login` and follow browser authentication |
| **"Build validation failed"** | Build command not configured or project has existing build errors | Check `buildCommand` in `projects.json`, ensure `main` branch builds successfully |
| **Ticket stuck in "In Progress"** | Agent crashed mid-execution | Check logs for errors, drag ticket back to Execute to retry |
| **No output in terminal** | Wrong database ID or token | Verify `NOTION_DATABASE_ID` in `.env.local` matches your board URL |

### Success Criteria

Your test is successful when all of these are true:

- Review agent fills in Ease, Confidence, Spec, Impact, and Cost
- Ticket moves from Review -> Scored automatically
- Execute agent creates a branch and implements the endpoint
- Build validation passes
- Branch is pushed to GitHub
- PR is created automatically
- Ticket moves from Execute -> In Progress -> Done
- PR URL is populated in the ticket
- Code in the PR matches the ticket description
- Total cost is reasonable (~$0.35-0.55 for this simple task)

If all criteria pass, TicketToPR is working correctly and ready for real tickets.

## Setup

### 1. Create Notion Integration

1. Go to https://www.notion.so/profile/integrations
2. Click **"New integration"**
3. Name: `Claude Bridge`
4. Associated workspace: select yours
5. Capabilities: enable **Read content**, **Update content**, **Insert content**
6. Click Submit
7. Copy the **Internal Integration Token** (starts with `ntn_`)

### 2. Create Notion Database

Create a new **Board view** database in Notion. Then add these properties:

| Property | Type | Purpose |
|----------|------|---------|
| `Name` | Title | Ticket name (Notion default - do not rename) |
| `Status` | Status | Board columns - the kanban lanes |
| `Description` | Text | What needs to be done |
| `Project` | Text or Select | Maps to a local directory (must match `projects.json` exactly) |
| `Ease` | Number | 1-10 feasibility score, written by review agent |
| `Confidence` | Number | 1-10 clarity score, written by review agent |
| `Spec` | Text | Implementation plan, written by review agent |
| `Impact` | Text | Files affected + risks, written by review agent |
| `Branch` | Text | Git branch name, written by execute agent |
| `Cost` | Text | USD spent on the Claude run |
| `PR URL` | URL | GitHub pull request link, written by execute agent |

**Add these 7 status columns** (rename defaults + add new ones):

```
Backlog | Review | Scored | Execute | In Progress | Done | Failed
```

**Connect the integration to the database**: Click "..." menu on the database page -> "Connections" -> search "Claude Bridge" -> add it.

**Copy the database ID** from the URL:
```
https://www.notion.so/yourteam/abc123def456789...?v=...
                                ^^^^^^^^^^^^^^^^^^^^^^^^
                                this is the database ID
```

### 3. Configure Environment

Create `.env.local` in the project root (this file is git-ignored):

```bash
NOTION_TOKEN=ntn_your_token_here
NOTION_DATABASE_ID=your_32_char_hex_database_id

# Optional: override default models (sonnet for review, opus for execute)
# REVIEW_MODEL=claude-sonnet-4-5-20250929
# EXECUTE_MODEL=claude-opus-4-6
```

### 4. Authenticate GitHub CLI

TicketToPR auto-creates pull requests after pushing. This requires `gh` to be authenticated:

```bash
gh auth login
# Choose: GitHub.com → HTTPS → Authenticate via browser
```

Verify it works:

```bash
gh auth status
# Should show: Logged in to github.com as yourname
```

### 5. Register Your Projects

Copy the example and edit — add your projects with their directory and optional build command:

```bash
cp projects.example.json projects.json
```

```json
{
  "projects": {
    "PeekABoo": {
      "directory": "/Users/yourname/Projects/PeekABoo",
      "buildCommand": "npm run build"
    },
    "MyOtherApp": {
      "directory": "/Users/yourname/Projects/MyOtherApp",
      "buildCommand": "cargo build"
    }
  }
}
```

The `Project` field on each Notion ticket must match a key in `projects.json` exactly (case-sensitive). Each project directory must be a git repo with an `origin` remote.

### 6. Verify

```bash
# Should connect to Notion and report "No tickets to process"
npx tsx index.ts --dry-run --once
```

### 7. Create a Test Ticket

1. Click "+ New" on your Notion board
2. Name: "Add a hello world test endpoint"
3. Project: `PeekABoo` (or your project name)
4. Description: `Create a simple GET endpoint at /api/test/hello that returns { message: "hello world" }`
5. Drag to **Review** column
6. Run `npx tsx index.ts --once` and watch it score the ticket
7. Check Notion — ticket should be in **Scored** with Ease, Confidence, Spec, Impact filled in
8. Drag to **Execute**, run `npx tsx index.ts --once` again
9. Check Notion — ticket should be in **Done** with Branch, Cost, and PR link filled in

## Running as a Background Service (macOS)

For always-on operation, use launchd. A plist is provided at:

```
~/Library/LaunchAgents/com.ticket-to-pr.plist
```

**Commands:**

```bash
# Start (also starts automatically on login)
launchctl load ~/Library/LaunchAgents/com.ticket-to-pr.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.ticket-to-pr.plist

# Check status
launchctl list | grep notion

# Watch logs
tail -f ~/Projects/ticket-to-pr/bridge.log
```

If you cloned this repo fresh, create the plist:

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

Replace `YOUR_USERNAME` and update the PATH to include your Node.js bin directory (`which node` to find it). If using nvm, the path looks like `/Users/you/.nvm/versions/node/v22.x.x/bin`.

## CLI Commands & Flags

| Command / Flag | Behavior |
|----------------|----------|
| `init` | Guided setup — configures Notion tokens, projects, `.env.local`, and `projects.json` |
| `doctor` | Diagnostic check — verifies environment, Notion connectivity, tools, and projects |
| (none) | Continuous polling every 30s |
| `--once` | Poll once, wait for agents to finish, exit |
| `--dry-run` | Poll and log what would happen, don't run agents |
| `--dry-run --once` | Single poll, log findings, exit immediately |

## How the Agents Work

### Review Agent (read-only)

- Model: Sonnet 4.5 (configurable via `REVIEW_MODEL` in config.ts)
- Tools: Read, Glob, Grep, Task
- Loads the target project's `CLAUDE.md` for architecture context
- Explores the codebase, then scores the ticket
- Uses structured output (`json_schema`) to guarantee valid JSON response
- Outputs: easeScore, confidenceScore, spec, impactReport, affectedFiles, risks
- Budget: $2.00 max, 25 turns max
- Typical cost: $0.15 - $0.50

### Execute Agent (write access)

- Model: Opus 4.6 (configurable via `EXECUTE_MODEL` in config.ts)
- Tools: Read, Glob, Grep, Edit, Write + limited Bash (git, build, test only)
- Cannot: push, run destructive commands, modify databases, access web
- Loads the target project's `CLAUDE.md` for project-specific rules
- Bridge handles: branch creation, build validation, push, Notion updates
- Budget: $15.00 max, 50 turns max
- Typical cost: $0.20 - $2.00 (simple to medium tasks)

### Git Workflow

1. Bridge creates an isolated git worktree with branch `notion/{8-char-id}/{ticket-slug}`
2. Claude implements changes in the worktree, makes atomic commits
3. Bridge runs build command (if configured for the project)
4. Build passes: bridge pushes branch to origin
5. Bridge creates a GitHub PR via `gh pr create` (includes spec, impact, Notion link, cost)
6. PR URL written back to the ticket's `PR` property
7. Ticket moves to Done with branch name, cost, and PR link
8. Build fails: ticket -> Failed
9. Worktree is always cleaned up when done (main working directory is never touched)

Multiple execute agents can safely target the same project concurrently because each runs in its own worktree.

**PR creation is best-effort** — if `gh` isn't authenticated or the push target has no GitHub remote, the ticket still moves to Done with the branch name. You can always create a PR manually.

## Configuration Reference

Settings in `config.ts`:

| Setting | Default | Purpose |
|---------|---------|---------|
| `REVIEW_MODEL` | `claude-sonnet-4-5-20250929` | Claude model for review agent |
| `EXECUTE_MODEL` | `claude-opus-4-6` | Claude model for execute agent |
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

## File Structure

```
ticket-to-pr/
  index.ts              # Poll loop, agent runner, worktree git workflow, graceful shutdown
  cli.ts                # init (guided setup) and doctor (diagnostic check) commands
  config.ts             # Budgets, column names, license check, TypeScript types
  projects.json         # Your project directories and build commands (git-ignored, copy from example)
  projects.example.json # Template for projects.json
  lib/
    utils.ts            # Pure utilities (shellEscape, clamp, loadEnv, worktree helpers, etc.)
    projects.ts         # JSON-backed project config loader with caching
    notion.ts           # Notion API helpers (fetch, write, move status)
    __tests__/
      utils.test.ts     # Utility function tests
      projects.test.ts  # Project config loader tests
      notion.test.ts    # Notion helper tests
  prompts/
    review.md           # Review agent system prompt with scoring rubric
    execute.md          # Execute agent system prompt with safety rules
  .env.local            # NOTION_TOKEN, NOTION_DATABASE_ID, model overrides (git-ignored)
  package.json          # Dependencies: @anthropic-ai/claude-agent-sdk, @notionhq/client, vitest
  tsconfig.json         # ESNext + NodeNext
  icon.svg              # App icon
  bridge.log            # Runtime logs when using launchd (git-ignored)
```

## Adding a New Project

1. Add to `projects.json`:
   ```json
   "MyProject": {
     "directory": "/absolute/path/to/project",
     "buildCommand": "npm run build"
   }
   ```
2. `buildCommand` is optional — omit it if you don't need build validation
3. Make sure the directory is a git repo with an `origin` remote
4. If the project has a `CLAUDE.md`, both agents will read it for context
5. Create Notion tickets with `Project` set to `"MyProject"`

No other code changes needed.

## Error Handling

| Failure | What Happens |
|---------|-------------|
| Notion API down | Logs error, skips poll cycle, retries next interval |
| Unknown project | Ticket -> Failed with "Unknown project" message |
| Review agent fails | Ticket -> Failed, error written to Impact field |
| Execute agent fails | Worktree cleaned up, ticket -> Failed |
| Build validation fails | Ticket -> Failed, branch kept locally for inspection |
| Push fails | Ticket -> Failed, branch remains local |
| PR creation fails | Ticket still moves to Done (best-effort), logged as warning |
| Duplicate poll trigger | Skipped (in-memory lock per ticket ID) |
| Agent hangs > 30 min | Lock force-released, ticket -> Failed |

## Troubleshooting

**"API token is invalid"**
- Check `.env.local` has the correct `ntn_` token
- Make sure the integration is connected to the database ("..." -> Connections)
- Token is loaded lazily — if you edit `.env.local`, restart TicketToPR

**"Claude Code process exited with code 1"**
- Check `bridge.log` or terminal stderr for the actual error
- Common cause: running inside another Claude Code session (TicketToPR handles this, but nested agents may still conflict)
- Make sure `claude` CLI is authenticated: run `claude "test"` manually

**Ticket stuck in "In Progress"**
- Agent may have crashed mid-execution
- Check logs for the error
- Drag ticket back to Execute to retry, or to Failed

**"Unknown project" error**
- The `Project` field value on the ticket doesn't match any key in `projects.json`
- Match is case-sensitive: "PeekABoo" != "peekaboo"

**Build validation fails but code looks correct**
- The build runs in the worktree with the agent's changes
- Check the branch locally: `git log notion/... --oneline`
- Run the build manually to see the actual error

**PR not created after push**
- Make sure `gh` is installed: `brew install gh`
- Make sure `gh` is authenticated: `gh auth login`
- Verify with `gh auth status` — should show "Logged in to github.com"
- The project repo must have a GitHub `origin` remote
- Check logs for `[PR] Failed to create PR:` messages
- PR creation is best-effort — the ticket still moves to Done without it

**launchd service not starting**
- Validate plist: `plutil -lint ~/Library/LaunchAgents/com.ticket-to-pr.plist`
- Check PATH includes your Node.js binary directory
- Check logs: `tail -f ~/Projects/ticket-to-pr/bridge.log`

## Costs

Based on real usage:

| Phase | Typical Cost | Budget Limit |
|-------|-------------|-------------|
| Review | $0.15 - $0.50 | $2.00 |
| Execute (trivial, 1-2 files) | $0.20 - $0.50 | $15.00 |
| Execute (medium, 3-5 files) | $0.50 - $2.00 | $15.00 |
| Execute (complex, 5+ files) | $2.00 - $8.00 | $15.00 |

First end-to-end test (hello world endpoint): **$0.49 total** ($0.22 review + $0.27 execute).

## Future Enhancements

- Write agent logs as Notion page comments for audit trail
- Parallel ticket execution (configurable concurrency limit)
- Auto-retry failed tickets with exponential backoff
- Cost tracking dashboard aggregated per project/week
- Linux systemd service support
