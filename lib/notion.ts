import { Client } from '@notionhq/client';
import type {
  PageObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints.js';
import { CONFIG, type NotionTicket, type TicketDetails, type ReviewOutput } from '../config.js';

let _notion: Client | null = null;

function notion(): Client {
  if (!_notion) {
    _notion = new Client({ auth: process.env.NOTION_TOKEN });
  }
  return _notion;
}

function databaseId(): string {
  return process.env.NOTION_DATABASE_ID!;
}

// -- Helpers --

function extractPlainText(richText: RichTextItemResponse[]): string {
  return richText.map((t) => t.plain_text).join('');
}

function getProperty(page: PageObjectResponse, name: string): unknown {
  return (page.properties as Record<string, unknown>)[name];
}

function extractTitle(page: PageObjectResponse): string {
  // Try 'Name' first (Notion default), then 'Title'
  const prop = (getProperty(page, 'Name') ?? getProperty(page, 'Title')) as { title?: RichTextItemResponse[] } | undefined;
  return prop?.title ? extractPlainText(prop.title) : '';
}

function extractRichText(page: PageObjectResponse, name: string): string {
  const prop = getProperty(page, name) as { rich_text?: RichTextItemResponse[] } | undefined;
  return prop?.rich_text ? extractPlainText(prop.rich_text) : '';
}

function extractSelect(page: PageObjectResponse, name: string): string {
  const prop = getProperty(page, name) as { select?: { name: string } | null } | undefined;
  return prop?.select?.name ?? '';
}

function extractStatus(page: PageObjectResponse): string {
  const prop = getProperty(page, 'Status') as { status?: { name: string } | null } | undefined;
  return prop?.status?.name ?? '';
}

function extractProjectName(page: PageObjectResponse): string {
  // Support both Select and Rich Text types for Project
  const prop = getProperty(page, 'Project') as Record<string, unknown> | undefined;
  if (!prop) return '';
  if (prop.type === 'select') {
    const sel = prop.select as { name: string } | null;
    return sel?.name ?? '';
  }
  if (prop.type === 'rich_text') {
    const rt = prop.rich_text as RichTextItemResponse[];
    return rt ? extractPlainText(rt) : '';
  }
  return '';
}

function pageToTicket(page: PageObjectResponse): NotionTicket {
  return {
    id: page.id,
    title: extractTitle(page),
    project: extractProjectName(page),
    status: extractStatus(page),
  };
}

function blockToMarkdown(block: BlockObjectResponse): string {
  const type = block.type as string;
  const data = (block as Record<string, unknown>)[type] as
    | { rich_text?: RichTextItemResponse[] }
    | undefined;
  const text = data?.rich_text ? extractPlainText(data.rich_text) : '';

  switch (type) {
    case 'paragraph':
      return text;
    case 'heading_1':
      return `# ${text}`;
    case 'heading_2':
      return `## ${text}`;
    case 'heading_3':
      return `### ${text}`;
    case 'bulleted_list_item':
      return `- ${text}`;
    case 'numbered_list_item':
      return `1. ${text}`;
    case 'to_do': {
      const todo = (block as Record<string, unknown>)[type] as { checked?: boolean };
      return `- [${todo?.checked ? 'x' : ' '}] ${text}`;
    }
    case 'code': {
      const code = (block as Record<string, unknown>)[type] as { language?: string };
      return `\`\`\`${code?.language ?? ''}\n${text}\n\`\`\``;
    }
    case 'quote':
      return `> ${text}`;
    case 'divider':
      return '---';
    default:
      return text;
  }
}

// -- Exported Functions --

/**
 * Fetch all tickets with a given status from the Notion database.
 */
export async function fetchTicketsByStatus(status: string): Promise<NotionTicket[]> {
  const response = await notion().databases.query({
    database_id: databaseId(),
    filter: {
      property: 'Status',
      status: { equals: status },
    },
  });

  return response.results
    .filter((r): r is PageObjectResponse => 'properties' in r)
    .map(pageToTicket);
}

/**
 * Read full ticket details including page body blocks.
 */
export async function fetchTicketDetails(pageId: string): Promise<TicketDetails> {
  const [page, blocksResponse] = await Promise.all([
    notion().pages.retrieve({ page_id: pageId }) as Promise<PageObjectResponse>,
    notion().blocks.children.list({ block_id: pageId, page_size: 100 }),
  ]);

  const blocks = blocksResponse.results.filter(
    (b): b is BlockObjectResponse => 'type' in b,
  );
  const bodyBlocks = blocks.map(blockToMarkdown).filter(Boolean).join('\n\n');

  const ticket = pageToTicket(page);
  return {
    ...ticket,
    description: extractRichText(page, 'Description'),
    bodyBlocks,
    spec: extractRichText(page, 'Spec') || undefined,
    impact: extractRichText(page, 'Impact') || undefined,
  };
}

/**
 * Write review results back to the ticket properties.
 */
export async function writeReviewResults(pageId: string, results: ReviewOutput): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    Ease: { number: results.easeScore },
    Confidence: { number: results.confidenceScore },
    Spec: {
      rich_text: [{ text: { content: truncate(results.spec, 2000) } }],
    },
    Impact: {
      rich_text: [
        {
          text: {
            content: truncate(
              `${results.impactReport}\n\nFiles: ${results.affectedFiles.join(', ')}${results.risks ? `\n\nRisks: ${results.risks}` : ''}`,
              2000,
            ),
          },
        },
      ],
    },
  };

  try {
    await notion().pages.update({ page_id: pageId, properties });
  } catch (e) {
    // If Confidence property doesn't exist yet, retry without it
    const errMsg = String(e);
    if (errMsg.includes('Confidence')) {
      delete properties.Confidence;
      await notion().pages.update({ page_id: pageId, properties });
    } else {
      throw e;
    }
  }
}

/**
 * Write execution results back to the ticket.
 */
export async function writeExecutionResults(
  pageId: string,
  results: { branch: string; cost: number; prUrl?: string },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    Branch: {
      rich_text: [{ text: { content: results.branch } }],
    },
    Cost: {
      rich_text: [{ text: { content: `$${(Math.round(results.cost * 100) / 100).toFixed(2)}` } }],
    },
  };

  if (results.prUrl) {
    properties['PR URL'] = {
      url: results.prUrl,
    };
  }

  await notion().pages.update({ page_id: pageId, properties });
}

/**
 * Move a ticket to a new status column.
 */
export async function moveTicketStatus(pageId: string, newStatus: string): Promise<void> {
  await notion().pages.update({
    page_id: pageId,
    properties: {
      Status: { status: { name: newStatus } },
    },
  });
}

/**
 * Write error details and move ticket to Failed.
 */
export async function writeFailure(pageId: string, error: string): Promise<void> {
  await notion().pages.update({
    page_id: pageId,
    properties: {
      Status: { status: { name: CONFIG.COLUMNS.FAILED } },
      Impact: {
        rich_text: [{ text: { content: truncate(`ERROR: ${error}`, 2000) } }],
      },
    },
  });
}

/**
 * Add a comment to a Notion page (best-effort).
 * Used for agent audit trail - does not throw if it fails.
 */
export async function addComment(pageId: string, text: string): Promise<void> {
  try {
    await notion().comments.create({
      parent: { page_id: pageId },
      rich_text: [{ text: { content: text } }],
    });
  } catch (e) {
    // Best-effort: log but don't throw
    console.warn(`[NOTION] Failed to add comment to ${pageId}:`, e);
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
