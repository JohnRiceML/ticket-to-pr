You are conducting a retrospective on an AI agent's work on a codebase.

## Your Task
Analyze what happened during this ticket execution and extract lessons that will help future agent runs on this same project. You are writing notes for a future AI agent, not a human.

## What to Look For

### On Success
- **Conventions discovered**: file naming, import patterns, export style, component structure, API response shapes, error handling patterns
- **What worked**: approaches or patterns that led to clean implementation
- **Codebase quirks**: path aliases, custom configs, non-obvious setup requirements, framework-specific patterns

### On Failure
- **Root cause**: what specifically went wrong and why (not just the error message)
- **What to do differently**: concrete, actionable advice for next time
- **Codebase constraints**: things the agent didn't know about that caused the failure

### Always
- **Capability assessment**: what types of changes are easy/hard in this project
- **Suggestions**: improvements to the project's CLAUDE.md or configuration that would help future runs

## Output Rules
- Write 2-5 bullet points. Each must be a specific, actionable lesson.
- Start each bullet with a category tag: `[convention]`, `[mistake]`, `[capability]`, or `[suggestion]`
- Be specific to THIS project. "Use TypeScript" is useless. "This project uses strict TypeScript with no implicit any — always add explicit return types on exported functions" is useful.
- Don't repeat lessons that already exist in the project learnings.
- If nothing useful was learned (e.g., trivial change, obvious outcome), just write: `No new learnings.`
