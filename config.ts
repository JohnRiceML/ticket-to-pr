// -- License --

import { verify } from 'node:crypto';

const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGtiFnwyCAHWl1b1yzm2wY14LiY8e0xfsXhQULcRaStM=
-----END PUBLIC KEY-----`;

let _proCache: boolean | null = null;

export function isPro(): boolean {
  if (_proCache !== null) return _proCache;

  const key = process.env.LICENSE_KEY;
  if (!key?.startsWith('ncb_pro_')) {
    _proCache = false;
    return false;
  }

  const rest = key.slice('ncb_pro_'.length);
  const dotIndex = rest.indexOf('.');
  if (dotIndex === -1) {
    _proCache = false;
    return false;
  }

  try {
    const buyerId = Buffer.from(rest.slice(0, dotIndex), 'base64url');
    const signature = Buffer.from(rest.slice(dotIndex + 1), 'base64url');
    _proCache = verify(null, buyerId, LICENSE_PUBLIC_KEY, signature);
  } catch {
    _proCache = false;
  }
  return _proCache;
}

const FREE_MAX_PROJECTS = 1;
const FREE_MAX_CONCURRENT = 1;
const PRO_MAX_CONCURRENT = 10;

export const CONFIG = {
  // Polling
  POLL_INTERVAL_MS: 30_000,

  // Notion column names -> agent modes
  COLUMNS: {
    REVIEW: 'Review',
    SCORED: 'Scored',
    EXECUTE: 'Execute',
    IN_PROGRESS: 'In Progress',
    DONE: 'PR Ready',
    FAILED: 'Failed',
  },

  // Agent budgets
  REVIEW_BUDGET_USD: 2.00,
  EXECUTE_BUDGET_USD: 15.00,

  // Agent models (env override → default)
  get REVIEW_MODEL(): string {
    return process.env.REVIEW_MODEL || 'claude-sonnet-4-6';
  },
  get EXECUTE_MODEL(): string {
    return process.env.EXECUTE_MODEL || 'claude-opus-4-6';
  },

  // Agent limits
  REVIEW_MAX_TURNS: 25,
  EXECUTE_MAX_TURNS: 50,

  // Stale lock timeout (30 minutes)
  STALE_LOCK_MS: 30 * 60 * 1000,

  // Maximum concurrent agents (review + execute combined)
  get MAX_CONCURRENT_AGENTS(): number {
    return isPro() ? PRO_MAX_CONCURRENT : FREE_MAX_CONCURRENT;
  },

  // Free tier project limit
  FREE_MAX_PROJECTS,
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
