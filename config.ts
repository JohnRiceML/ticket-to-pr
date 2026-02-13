export const CONFIG = {
  // Polling
  POLL_INTERVAL_MS: 30_000,

  // Notion column names -> agent modes
  COLUMNS: {
    REVIEW: 'Review',
    SCORED: 'Scored',
    EXECUTE: 'Execute',
    IN_PROGRESS: 'In Progress',
    DONE: 'Done',
    FAILED: 'Failed',
  },

  // Project name (Notion select) -> local directory
  PROJECTS: {
    'PeekABoo': '/Users/johnrice/Projects/PeekABoo',
    // Add more projects here
  } as Record<string, string>,

  // Agent budgets
  REVIEW_BUDGET_USD: 2.00,
  EXECUTE_BUDGET_USD: 15.00,

  // Agent limits
  REVIEW_MAX_TURNS: 15,
  EXECUTE_MAX_TURNS: 50,

  // Build validation command per project (optional)
  BUILD_COMMANDS: {
    'PeekABoo': 'npm run build',
  } as Record<string, string>,

  // Stale lock timeout (30 minutes)
  STALE_LOCK_MS: 30 * 60 * 1000,

  // Maximum concurrent agents (review + execute combined)
  MAX_CONCURRENT_AGENTS: 3,
} as const;

// JSON schema for review agent structured output
export const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    easeScore: { type: 'number', minimum: 1, maximum: 10 },
    confidenceScore: { type: 'number', minimum: 1, maximum: 10 },
    spec: { type: 'string' },
    impactReport: { type: 'string' },
    affectedFiles: { type: 'array', items: { type: 'string' } },
    risks: { type: 'string' },
  },
  required: ['easeScore', 'confidenceScore', 'spec', 'impactReport', 'affectedFiles'],
} as const;

// Types

export interface NotionTicket {
  id: string;
  title: string;
  project: string;
  status: string;
}

export interface TicketDetails extends NotionTicket {
  description: string;
  bodyBlocks: string;
  spec?: string;
  impact?: string;
}

export interface ReviewOutput {
  easeScore: number;
  confidenceScore: number;
  spec: string;
  impactReport: string;
  affectedFiles: string[];
  risks?: string;
}

export interface LockEntry {
  mode: 'review' | 'execute';
  startedAt: number;
}
