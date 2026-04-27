# Release Process

How to ship a change across all three systems: **GitHub repo**, **npm package**, and **marketing site**.

## The Three Systems

| System | Location | What lives there |
|--------|----------|------------------|
| **GitHub repo** | `~/Projects/notion-claude-bridge` → `github.com/JohnRiceML/ticket-to-pr` | Source code, CLAUDE.md, README.md, prompts, config |
| **NPM package** | `ticket-to-pr` on npmjs.com | Published dist, bin, prompts, README.md |
| **Marketing site** | `~/Projects/ticket-to-pr-site` → `tickettopr.com` | Next.js site with docs, how-it-works, property tables, lifecycle grid |

All three must stay in sync. A column rename, workflow change, or property update touches all of them.

## Step-by-Step Release

### 1. Make the code change

Work in `~/Projects/notion-claude-bridge`. Edit the source files (`config.ts`, `index.ts`, `lib/`, `prompts/`).

### 2. Update docs in the same repo

These files reference the product behavior and must match the code:

| File | What to check |
|------|---------------|
| `CLAUDE.md` | Workflow diagram, column names, date properties table, status column list, git workflow section, error handling table, troubleshooting, test flow, success criteria, human feedback section |
| `README.md` | Board diagram, column count, date properties table, status column list, git workflow section, error handling table, troubleshooting, test flow, human feedback workflow |

### 3. Build and test

```bash
npm run build    # TypeScript must compile clean
npm test         # All tests must pass
```

### 4. Bump the version

```bash
npm version patch --no-git-tag-version   # 1.4.2 → 1.4.3
# or: npm version minor --no-git-tag-version  # 1.4.x → 1.5.0
```

Use `--no-git-tag-version` because you want to commit everything together, not auto-tag.

**When to use which bump:**
- **Patch** (x.x.1): Bug fixes, doc corrections, config tweaks
- **Minor** (x.1.0): New columns, new features, new agent capabilities
- **Major** (1.0.0): Breaking changes to Notion schema that require user action

### 5. Commit and push the repo

```bash
git add config.ts index.ts lib/notion.ts CLAUDE.md README.md package.json package-lock.json
# Add any other changed files explicitly — never use `git add .`

git commit -m "$(cat <<'EOF'
feat: description of what changed

Details of the change.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

git push origin main
```

### 6. Update the marketing site

In `~/Projects/ticket-to-pr-site`, update these files:

| File | What to check |
|------|---------------|
| `lib/docs-content.ts` | `NOTION_PROPERTIES` array, `STATUS_COLUMNS` array, column descriptions, property count in init wizard output |
| `components/docs/docs-content.tsx` | Property count string, status option count string, pipeline column count string, `grid-cols-N` class |

```bash
cd ~/Projects/ticket-to-pr-site
pnpm build       # Must pass
git add -A
git commit -m "docs: sync with v1.4.3 — description of changes"
git push origin main
```

### 7. Publish to npm

```bash
cd ~/Projects/notion-claude-bridge
npm run build     # Rebuild dist/ with latest changes
npm test          # Sanity check
npm publish       # Publishes to npmjs.com
npm view ticket-to-pr version   # Verify
```

## What Changes Touch What

Use this matrix to know which systems need updating:

| Change type | Repo code | CLAUDE.md | README.md | Site | NPM |
|-------------|:---------:|:---------:|:---------:|:----:|:---:|
| Column added/removed/renamed | x | x | x | x | x |
| Date property added/removed | x | x | x | x | x |
| Workflow order changed | x | x | x | x | x |
| Agent model changed | x | x | x | x | x |
| Bug fix (no behavior change) | x | | | | x |
| Prompt updated | x | | | | x |
| Budget/limit changed | x | x | x | | x |
| New CLI command | x | x | x | x | x |
| New project config field | x | x | x | x | x |
| Build command change | x | | | | x |

**Rule of thumb**: If it changes what the user sees or configures, it touches all five. If it's an internal fix, it's just code + npm.

## Common Oversights

These are real mistakes made during development. Check for each one.

### 1. Column name strings must match exactly

The column names in `config.ts` must match the Notion board **exactly** (case-sensitive). If you rename a column in code but not in Notion (or vice versa), tickets won't move.

```typescript
// config.ts — these strings ARE the Notion column names
COLUMNS: {
  PR_READY: 'PR Ready',    // Must match Notion exactly
  TESTING: 'Testing',
}
```

### 2. Forgetting the site's grid-cols-N class

The lifecycle visualization in `components/docs/docs-content.tsx` uses a Tailwind grid class. If you add or remove a column, update the grid:

```tsx
// 9 columns = grid-cols-9
<div className="grid grid-cols-9 gap-2">
```

Miss this and the layout breaks on desktop.

### 3. Date property sort targets

Each date property sorts a specific column. When you move which column a ticket lands in, the date property that "sorts" it must follow:

| Date property | Sorts this column | Set when |
|---------------|-------------------|----------|
| Reviewed At | Scored | Review agent finishes |
| Executed At | PR Ready | Execute agent finishes |
| Testing At | Testing | QA checklist is posted |
| Failed At | Failed | Ticket fails |
| Done At | Done | Feedback is processed |

**The mistake**: When PR Ready was removed and execute went straight to Testing, "Executed At" needed to sort Testing instead of PR Ready. When PR Ready was restored, it had to switch back. The "Testing At" property also had to be removed and re-added.

### 4. The site property count is hardcoded in multiple places

The marketing site has the property count in **three separate places**:

1. `lib/docs-content.ts` — the `NOTION_PROPERTIES` array length drives the init wizard text
2. `components/docs/docs-content.tsx` — a string like `"these 16 properties"`
3. `components/docs/docs-content.tsx` — a string like `"9 status options"`

All three must be updated together. A `grep -r "properties\|status options\|columns"` across the site catches most of them.

### 5. README.md and CLAUDE.md diverge

Both files describe the same product but CLAUDE.md has more detail (it's the AI's reference). Changes to one must be mirrored in the other. Key sections that must match:

- Workflow diagram (the ASCII column flow)
- Status column list and count
- Date properties table
- Git workflow steps
- Error handling table
- Test flow and success criteria
- Human feedback section

### 6. extractNumber was reading from the wrong place

The PR description builder used `extractNumber()` which tried to regex-parse scores from the Impact text field. But Ease and Confidence are stored as **separate Notion number properties**, not embedded in Impact text. This caused `?` to appear instead of actual scores.

**Fix**: Read number properties directly from the Notion page via `fetchTicketDetails()` and use `ticket.ease` / `ticket.confidence` instead of parsing text.

**Lesson**: When Notion properties are stored as their own typed fields (number, date, URL), read them as properties — don't try to extract them from text fields.

### 7. The execute target column is referenced in many doc sections

When changing where execute pushes tickets, search for the column name in ALL of these:

- Workflow diagram (CLAUDE.md + README.md)
- Test flow expected output (CLAUDE.md)
- Test flow Notion verification (CLAUDE.md)
- Success criteria (CLAUDE.md)
- Git workflow numbered steps (CLAUDE.md + README.md)
- Error handling table (CLAUDE.md + README.md)
- Troubleshooting section (CLAUDE.md + README.md)
- Human feedback "How it works" (CLAUDE.md + README.md)
- PR creation best-effort note (CLAUDE.md + README.md)
- Common first-run issues table (CLAUDE.md)
- Site status columns array (`lib/docs-content.ts`)
- Site docs component (`components/docs/docs-content.tsx`)

That's **12+ locations** across 4 files in 2 repos. Miss one and the docs are wrong.

**Use grep**: `grep -rn "PR Ready\|Testing\|PR_READY" --include="*.md" --include="*.ts" --include="*.tsx"` in both repos.

### 8. npm publish ships whatever is in dist/

`npm publish` uses the `files` array in `package.json`: `dist`, `bin`, `prompts`, `projects.example.json`, `README.md`. If you forget to run `npm run build` before publishing, you ship stale JavaScript.

The `prepublishOnly` script runs build + test as a safeguard, but always verify:

```bash
npm run build && npm test && npm publish
```

### 9. Version bump must happen before commit

`npm version patch --no-git-tag-version` updates `package.json` and `package-lock.json`. If you commit first and bump after, you need another commit. Bump first, then stage everything together.

### 10. Site uses Tailwind — new grid column counts may need safelist

Tailwind purges unused classes. If `grid-cols-9` wasn't used before, it might get purged in production. Check that the class is either:
- Already in use (Tailwind sees it in the source)
- Added to the Tailwind safelist in `tailwind.config.js`

Dynamic class construction like `` `grid-cols-${count}` `` will **always** be purged. Use the full static class name.

## Pre-Publish Checklist

Copy this for each release:

```
[ ] Code change made and working locally
[ ] CLAUDE.md updated (workflow, columns, properties, test flow, errors, troubleshooting)
[ ] README.md updated (same sections as CLAUDE.md)
[ ] npm run build — passes
[ ] npm test — passes
[ ] Version bumped (npm version patch --no-git-tag-version)
[ ] Committed with descriptive message (specific file list, not git add .)
[ ] Pushed to origin main
[ ] Site: lib/docs-content.ts updated (columns, properties, counts)
[ ] Site: components/docs/docs-content.tsx updated (counts, grid class)
[ ] Site: pnpm build — passes
[ ] Site: committed and pushed
[ ] npm publish — succeeded
[ ] npm view ticket-to-pr version — shows new version
[ ] Grep both repos for old column names — zero hits
```
