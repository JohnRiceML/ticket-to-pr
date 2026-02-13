# Parallel Ticket Execution

## Overview

The bridge now supports processing multiple tickets concurrently with a configurable limit. This improves throughput when multiple tickets are waiting in the Review or Execute columns.

## Configuration

**File: `config.ts`**

```typescript
// Maximum concurrent agents (review + execute combined)
MAX_CONCURRENT_AGENTS: 3,
```

Default is 3. This means:
- Up to 3 agents can run simultaneously
- Review and Execute agents share the same concurrency pool
- When the limit is reached, additional tickets wait for the next poll cycle

## How It Works

### Concurrency Control

1. **Poll cycle detects pending tickets** in Review and Execute columns
2. **Checks available slots**: `MAX_CONCURRENT_AGENTS - activeLocks.size`
3. **Launches agents** up to the available slots
4. **Queues remaining tickets** for the next poll (30s default interval)

### Execution Flow

```
Poll finds 5 tickets (2 review, 3 execute)
activeLocks.size = 1 (one agent already running)
availableSlots = 3 - 1 = 2

Result:
- Launch 2 new agents immediately
- 3 tickets queued for next poll
- Total running: 3 agents (max)
```

### Implementation Details

**Lines 394-420 in `index.ts`:**

```typescript
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
  handleTicket(mode, details);
}
```

## Key Features

### 1. Shared Concurrency Pool
- Review and Execute agents count toward the same limit
- Prioritizes tickets in order: Review first, then Execute
- Simple and predictable behavior

### 2. No Job Queue Library
- Uses existing `activeLocks` Map for concurrency tracking
- No external dependencies
- Tickets that exceed the limit wait for the next poll cycle

### 3. One-Shot Mode (`--once`)
- Still waits for ALL launched agents to complete
- Works correctly with parallel execution
- Lines 483-491 in `index.ts` handle this

### 4. Graceful Shutdown
- Waits for all running agents (up to 5 minutes)
- Works with parallel agents
- Lines 404-428 in `index.ts` handle this

## Example Logs

### Normal Operation
```
14:06:23 [POLL] Checking Notion board...
14:06:24 [POLL] Found 2 ticket(s) to review
14:06:24 [POLL] Found 3 ticket(s) to execute
14:06:24 [QUEUE] Launching 3 agent(s) (0 already running, 3 max)
14:06:24 [QUEUE] 2 ticket(s) queued for next poll (concurrency limit reached)
14:06:24 [REVIEW] Starting review for "Fix login bug" in PeekABoo
14:06:24 [EXECUTE] Starting execution for "Add dark mode" on branch notion/abc123/add-dark-mode
14:06:24 [REVIEW] Starting review for "Update docs" in PeekABoo
```

### At Capacity
```
14:06:54 [POLL] Checking Notion board...
14:06:54 [POLL] Found 5 ticket(s) to execute
14:06:54 [QUEUE] Launching 0 agent(s) (3 already running, 3 max)
14:06:54 [QUEUE] 5 ticket(s) queued for next poll (concurrency limit reached)
```

### Startup
```
14:06:00 [START] Notion-Claude Bridge
14:06:00 [CONFIG] Poll interval: 30s
14:06:00 [CONFIG] Max concurrent agents: 3
14:06:00 [CONFIG] Projects: PeekABoo
14:06:00 [CONFIG] Review budget: $2 / Execute budget: $15
```

## Adjusting Concurrency

To change the concurrency limit, edit `config.ts`:

```typescript
// Process more tickets in parallel
MAX_CONCURRENT_AGENTS: 5,

// Process tickets sequentially (original behavior)
MAX_CONCURRENT_AGENTS: 1,

// Higher throughput for powerful machines
MAX_CONCURRENT_AGENTS: 10,
```

## Testing

The implementation:
- ✅ Compiles cleanly with `npx tsc --noEmit`
- ✅ Preserves existing single-ticket behavior when limit = 1
- ✅ Uses no external dependencies
- ✅ Works with `--once` and `--dry-run` flags
- ✅ Handles graceful shutdown correctly

## Performance Impact

**Before (Sequential):**
- 1 ticket processed per poll cycle
- 5 tickets = 5 poll cycles = ~2.5 minutes minimum

**After (Parallel, limit=3):**
- Up to 3 tickets processed per poll cycle
- 5 tickets = 2 poll cycles = ~1 minute minimum
- 2.5x throughput improvement

**Considerations:**
- Higher concurrency = more API calls to Notion and Claude
- Review agents are read-only (safe to parallelize)
- Execute agents modify code (test coverage prevents conflicts)
- Notion API rate limits are respected (fetches are sequential)
