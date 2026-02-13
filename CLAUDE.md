# Notion-Claude Bridge

A local TypeScript poller that watches a Notion kanban board and triggers Claude Code agents to review and implement tickets automatically. Drag a ticket into "Review" and get a feasibility score, spec, and impact analysis. Drag it into "Execute" and Claude creates a branch, implements the code, validates the build, and pushes.

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

The Claude CLI must be authenticated with an API key or Anthropic account that has credits. The bridge spawns Claude agents via the SDK which bills against your account.

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
git clone <repo-url> ~/Projects/notion-claude-bridge
cd ~/Projects/notion-claude-bridge
npm install
cp .env.local.example .env.local   # Then edit with your tokens (see Setup below)

# Test connection
npx tsx index.ts --dry-run --once

# Run once (process all pending tickets)
npx tsx index.ts --once

# Run continuously (polls every 30s)
npx tsx index.ts
```

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
| `Project` | Text or Select | Maps to a local directory (must match `config.ts` exactly) |
| `Ease` | Number | 1-10 feasibility score, written by review agent |
| `Confidence` | Number | 1-10 clarity score, written by review agent |
| `Spec` | Text | Implementation plan, written by review agent |
| `Impact` | Text | Files affected + risks, written by review agent |
| `Branch` | Text | Git branch name, written by execute agent |
| `Cost` | Text | USD spent on the Claude run |
| `PR` | URL | GitHub pull request link, written by execute agent |

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

Create `.env.local` in the project root:

```bash
NOTION_TOKEN=ntn_your_token_here
NOTION_DATABASE_ID=your_32_char_hex_database_id
```

### 4. Authenticate GitHub CLI

The bridge auto-creates pull requests after pushing. This requires `gh` to be authenticated:

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

Edit `config.ts` — add your project to `PROJECTS` and optionally `BUILD_COMMANDS`:

```typescript
PROJECTS: {
  'PeekABoo': '/Users/yourname/Projects/PeekABoo',
  'MyOtherApp': '/Users/yourname/Projects/MyOtherApp',
},

BUILD_COMMANDS: {
  'PeekABoo': 'npm run build',
  'MyOtherApp': 'cargo build',
},
```

The `Project` field on each Notion ticket must match a key in `PROJECTS` exactly (case-sensitive). Each project directory must be a git repo with an `origin` remote.

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
~/Library/LaunchAgents/com.notion-claude-bridge.plist
```

**Commands:**

```bash
# Start (also starts automatically on login)
launchctl load ~/Library/LaunchAgents/com.notion-claude-bridge.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.notion-claude-bridge.plist

# Check status
launchctl list | grep notion

# Watch logs
tail -f ~/Projects/notion-claude-bridge/bridge.log
```

If you cloned this repo fresh, create the plist:

```bash
cat > ~/Library/LaunchAgents/com.notion-claude-bridge.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.notion-claude-bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>npx</string>
        <string>tsx</string>
        <string>index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/Projects/notion-claude-bridge</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/Projects/notion-claude-bridge/bridge.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/Projects/notion-claude-bridge/bridge.log</string>
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

## CLI Flags

| Flag | Behavior |
|------|----------|
| (none) | Continuous polling every 30s |
| `--once` | Poll once, wait for agents to finish, exit |
| `--dry-run` | Poll and log what would happen, don't run agents |
| `--dry-run --once` | Single poll, log findings, exit immediately |

## How the Agents Work

### Review Agent (read-only)

- Tools: Read, Glob, Grep, Task
- Loads the target project's `CLAUDE.md` for architecture context
- Explores the codebase, then scores the ticket
- Outputs JSON with: easeScore, confidenceScore, spec, impactReport, affectedFiles, risks
- Budget: $2.00 max, 15 turns max
- Typical cost: $0.15 - $0.50

### Execute Agent (write access)

- Tools: Read, Glob, Grep, Edit, Write + limited Bash (git, build, test only)
- Cannot: push, run destructive commands, modify databases, access web
- Loads the target project's `CLAUDE.md` for project-specific rules
- Bridge handles: branch creation, build validation, push, Notion updates
- Budget: $15.00 max, 50 turns max
- Typical cost: $0.20 - $2.00 (simple to medium tasks)

### Git Workflow

1. Bridge creates branch `notion/{8-char-id}/{ticket-slug}` from main
2. Claude implements changes, makes atomic commits
3. Bridge runs build command (if configured for the project)
4. Build passes: bridge pushes branch to origin
5. Bridge creates a GitHub PR via `gh pr create` (includes spec, impact, Notion link, cost)
6. PR URL written back to the ticket's `PR` property
7. Ticket moves to Done with branch name, cost, and PR link
8. Build fails: branch kept locally, ticket -> Failed
9. Always checks out main when done

**PR creation is best-effort** — if `gh` isn't authenticated or the push target has no GitHub remote, the ticket still moves to Done with the branch name. You can always create a PR manually.

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
| `PROJECTS` | {} | Notion project name -> local directory path |
| `BUILD_COMMANDS` | {} | Project name -> build validation command |

## File Structure

```
notion-claude-bridge/
  index.ts              # Poll loop, agent runner, git workflow, graceful shutdown
  config.ts             # Project mappings, budgets, column names, TypeScript types
  lib/
    notion.ts           # Notion API helpers (fetch, write, move status)
  prompts/
    review.md           # Review agent system prompt with scoring rubric
    execute.md          # Execute agent system prompt with safety rules
  .env.local            # NOTION_TOKEN + NOTION_DATABASE_ID (git-ignored)
  package.json          # Dependencies: @anthropic-ai/claude-agent-sdk, @notionhq/client
  tsconfig.json         # ESNext + NodeNext
  icon.svg              # App icon
  bridge.log            # Runtime logs when using launchd (git-ignored)
```

## Adding a New Project

1. Add to `PROJECTS` in `config.ts`:
   ```typescript
   'MyProject': '/absolute/path/to/project',
   ```
2. Optionally add a build command:
   ```typescript
   'MyProject': 'npm run build',
   ```
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
| Execute agent fails | Checks out main, ticket -> Failed |
| Build validation fails | Ticket -> Failed, branch kept locally for inspection |
| Push fails | Ticket -> Failed, branch remains local |
| PR creation fails | Ticket still moves to Done (best-effort), logged as warning |
| Duplicate poll trigger | Skipped (in-memory lock per ticket ID) |
| Agent hangs > 30 min | Lock force-released, ticket -> Failed |

## Troubleshooting

**"API token is invalid"**
- Check `.env.local` has the correct `ntn_` token
- Make sure the integration is connected to the database ("..." -> Connections)
- Token is loaded lazily — if you edit `.env.local`, restart the bridge

**"Claude Code process exited with code 1"**
- Check `bridge.log` or terminal stderr for the actual error
- Common cause: running inside another Claude Code session (the bridge handles this, but nested agents may still conflict)
- Make sure `claude` CLI is authenticated: run `claude "test"` manually

**Ticket stuck in "In Progress"**
- Agent may have crashed mid-execution
- Check logs for the error
- Drag ticket back to Execute to retry, or to Failed

**"Unknown project" error**
- The `Project` field value on the ticket doesn't match any key in `config.ts` PROJECTS
- Match is case-sensitive: "PeekABoo" != "peekaboo"

**Build validation fails but code looks correct**
- The build runs in the project directory with the agent's changes
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
- Validate plist: `plutil -lint ~/Library/LaunchAgents/com.notion-claude-bridge.plist`
- Check PATH includes your Node.js binary directory
- Check logs: `tail -f ~/Projects/notion-claude-bridge/bridge.log`

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
