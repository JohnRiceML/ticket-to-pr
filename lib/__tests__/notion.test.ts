import { describe, it, expect } from 'vitest';
import type {
  PageObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints.js';
import {
  extractPlainText,
  blockToMarkdown,
  truncate,
  chunkRichText,
  pageToTicket,
  extractProjectName,
} from '../notion.js';

// -- Test helpers --

function richText(text: string): RichTextItemResponse[] {
  return [{ type: 'text', text: { content: text, link: null }, plain_text: text, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }, href: null }];
}

function makePage(overrides: {
  id?: string;
  name?: string;
  status?: string;
  project?: { type: 'select'; name: string } | { type: 'rich_text'; text: string };
  description?: string;
}): PageObjectResponse {
  const properties: Record<string, unknown> = {};

  if (overrides.name !== undefined) {
    properties.Name = { type: 'title', title: richText(overrides.name) };
  }
  if (overrides.status !== undefined) {
    properties.Status = { type: 'status', status: { name: overrides.status } };
  }
  if (overrides.project) {
    if (overrides.project.type === 'select') {
      properties.Project = { type: 'select', select: { name: overrides.project.name } };
    } else {
      properties.Project = { type: 'rich_text', rich_text: richText(overrides.project.text) };
    }
  }
  if (overrides.description !== undefined) {
    properties.Description = { type: 'rich_text', rich_text: richText(overrides.description) };
  }

  return {
    id: overrides.id ?? 'test-page-id',
    properties,
    object: 'page',
    created_time: '',
    last_edited_time: '',
    archived: false,
    in_trash: false,
    url: '',
    public_url: null,
    parent: { type: 'database_id', database_id: '' },
    icon: null,
    cover: null,
    created_by: { object: 'user', id: '' },
    last_edited_by: { object: 'user', id: '' },
  } as unknown as PageObjectResponse;
}

function makeBlock(type: string, text: string, extra?: Record<string, unknown>): BlockObjectResponse {
  return {
    type,
    [type]: {
      rich_text: richText(text),
      ...extra,
    },
    id: 'block-id',
    object: 'block',
    created_time: '',
    last_edited_time: '',
    has_children: false,
    archived: false,
    in_trash: false,
    parent: { type: 'page_id', page_id: '' },
    created_by: { object: 'user', id: '' },
    last_edited_by: { object: 'user', id: '' },
  } as unknown as BlockObjectResponse;
}

// -- extractPlainText --

describe('extractPlainText', () => {
  it('joins multiple rich text segments', () => {
    const rt: RichTextItemResponse[] = [
      { type: 'text', text: { content: 'hello ', link: null }, plain_text: 'hello ', annotations: {} as never, href: null },
      { type: 'text', text: { content: 'world', link: null }, plain_text: 'world', annotations: {} as never, href: null },
    ];
    expect(extractPlainText(rt)).toBe('hello world');
  });

  it('returns empty string for empty array', () => {
    expect(extractPlainText([])).toBe('');
  });
});

// -- blockToMarkdown --

describe('blockToMarkdown', () => {
  it('converts paragraph', () => {
    expect(blockToMarkdown(makeBlock('paragraph', 'Hello'))).toBe('Hello');
  });

  it('converts heading_1', () => {
    expect(blockToMarkdown(makeBlock('heading_1', 'Title'))).toBe('# Title');
  });

  it('converts heading_2', () => {
    expect(blockToMarkdown(makeBlock('heading_2', 'Subtitle'))).toBe('## Subtitle');
  });

  it('converts heading_3', () => {
    expect(blockToMarkdown(makeBlock('heading_3', 'Section'))).toBe('### Section');
  });

  it('converts bulleted_list_item', () => {
    expect(blockToMarkdown(makeBlock('bulleted_list_item', 'Item'))).toBe('- Item');
  });

  it('converts numbered_list_item', () => {
    expect(blockToMarkdown(makeBlock('numbered_list_item', 'Step'))).toBe('1. Step');
  });

  it('converts unchecked to_do', () => {
    expect(blockToMarkdown(makeBlock('to_do', 'Task', { checked: false }))).toBe('- [ ] Task');
  });

  it('converts checked to_do', () => {
    expect(blockToMarkdown(makeBlock('to_do', 'Done', { checked: true }))).toBe('- [x] Done');
  });

  it('converts code block with language', () => {
    const result = blockToMarkdown(makeBlock('code', 'const x = 1', { language: 'typescript' }));
    expect(result).toBe('```typescript\nconst x = 1\n```');
  });

  it('converts code block without language', () => {
    const result = blockToMarkdown(makeBlock('code', 'print("hi")'));
    expect(result).toBe('```\nprint("hi")\n```');
  });

  it('converts quote', () => {
    expect(blockToMarkdown(makeBlock('quote', 'Wise words'))).toBe('> Wise words');
  });

  it('converts divider', () => {
    const block = { type: 'divider', divider: {}, id: 'b', object: 'block', created_time: '', last_edited_time: '', has_children: false, archived: false, in_trash: false, parent: { type: 'page_id', page_id: '' }, created_by: { object: 'user', id: '' }, last_edited_by: { object: 'user', id: '' } } as unknown as BlockObjectResponse;
    expect(blockToMarkdown(block)).toBe('---');
  });

  it('falls back to plain text for unknown types', () => {
    expect(blockToMarkdown(makeBlock('callout', 'Note'))).toBe('Note');
  });
});

// -- truncate --

describe('truncate', () => {
  it('returns string unchanged when under limit', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  it('returns string unchanged at exact limit', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });

  it('truncates with ellipsis when over limit', () => {
    expect(truncate('hello world!', 8)).toBe('hello...');
  });
});

// -- chunkRichText --

describe('chunkRichText', () => {
  it('returns single segment for short text', () => {
    const result = chunkRichText('hello');
    expect(result).toEqual([{ text: { content: 'hello' } }]);
  });

  it('returns single segment at exactly 2000 chars', () => {
    const str = 'x'.repeat(2000);
    const result = chunkRichText(str);
    expect(result).toHaveLength(1);
    expect(result[0].text.content).toHaveLength(2000);
  });

  it('chunks text over 2000 chars into multiple segments', () => {
    const str = 'a'.repeat(4500);
    const result = chunkRichText(str);
    expect(result).toHaveLength(3);
    expect(result[0].text.content).toHaveLength(2000);
    expect(result[1].text.content).toHaveLength(2000);
    expect(result[2].text.content).toHaveLength(500);
  });
});

// -- pageToTicket --

describe('pageToTicket', () => {
  it('extracts all fields from a well-formed page', () => {
    const page = makePage({
      id: 'abc-123',
      name: 'Fix login bug',
      status: 'Review',
      project: { type: 'select', name: 'PeekABoo' },
    });
    const ticket = pageToTicket(page);
    expect(ticket).toEqual({
      id: 'abc-123',
      title: 'Fix login bug',
      project: 'PeekABoo',
      status: 'Review',
    });
  });

  it('returns empty strings for missing properties', () => {
    const page = makePage({ id: 'empty' });
    const ticket = pageToTicket(page);
    expect(ticket.title).toBe('');
    expect(ticket.project).toBe('');
    expect(ticket.status).toBe('');
  });
});

// -- extractProjectName --

describe('extractProjectName', () => {
  it('extracts from select type', () => {
    const page = makePage({ project: { type: 'select', name: 'MyApp' } });
    expect(extractProjectName(page)).toBe('MyApp');
  });

  it('extracts from rich_text type', () => {
    const page = makePage({ project: { type: 'rich_text', text: 'MyApp' } });
    expect(extractProjectName(page)).toBe('MyApp');
  });

  it('returns empty string when Project property is missing', () => {
    const page = makePage({});
    expect(extractProjectName(page)).toBe('');
  });
});
