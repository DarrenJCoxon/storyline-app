import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { addItem, getItem, editItem, removeItem, listItems } from '../lib/research/capture.js';
import { addLink, removeLink, getLinksForItem, getItemsForTarget, buildLinkSummary } from '../lib/research/linker.js';
import { rebuildIndex, buildResearchMemoryEntries } from '../lib/research/index.js';
import { analyzeGaps } from '../lib/research/critique.js';
import { searchItems, buildRetrievalPayload } from '../lib/research/retrieval.js';

let projectDir;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'storyline-research-'));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

// ── capture ───────────────────────────────────────────────────────────

describe('capture', () => {
  it('adds an item and returns it', async () => {
    const item = await addItem(projectDir, { title: 'Test note', content: 'Some content' });
    expect(item.id).toMatch(/^res-/);
    expect(item.title).toBe('Test note');
    expect(item.content).toBe('Some content');
    expect(item.type).toBe('research');
    expect(item.verification).toBe('pending');
  });

  it('round-trips getItem correctly', async () => {
    const added = await addItem(projectDir, {
      title: 'Round-trip test',
      content: 'Content here',
      subtype: 'quote',
      reliability: 'primary',
      tags: ['london', 'victorian'],
    });
    const retrieved = await getItem(projectDir, added.id);
    expect(retrieved.title).toBe('Round-trip test');
    expect(retrieved.subtype).toBe('quote');
    expect(retrieved.reliability).toBe('primary');
    expect(retrieved.tags).toEqual(['london', 'victorian']);
    expect(retrieved.content).toBe('Content here');
  });

  it('editItem merges updates without losing existing fields', async () => {
    const added = await addItem(projectDir, { title: 'Original', tags: ['a', 'b'] });
    const edited = await editItem(projectDir, added.id, { title: 'Updated', verification: 'verified' });
    expect(edited.title).toBe('Updated');
    expect(edited.verification).toBe('verified');
    expect(edited.tags).toEqual(['a', 'b']); // unchanged
    expect(edited.id).toBe(added.id);       // immutable
  });

  it('removeItem deletes the file', async () => {
    const added = await addItem(projectDir, { title: 'To delete' });
    const removed = await removeItem(projectDir, added.id);
    expect(removed).toBe(true);
    const retrieved = await getItem(projectDir, added.id);
    expect(retrieved).toBeNull();
  });

  it('listItems filters by subtype', async () => {
    await addItem(projectDir, { title: 'A note', subtype: 'note' });
    await addItem(projectDir, { title: 'A quote', subtype: 'quote' });
    const notes = await listItems(projectDir, { subtype: 'note' });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('A note');
  });

  it('listItems filters by verification', async () => {
    await addItem(projectDir, { title: 'Pending' });
    const item = await addItem(projectDir, { title: 'Verified' });
    await editItem(projectDir, item.id, { verification: 'verified' });
    const verified = await listItems(projectDir, { verification: 'verified' });
    expect(verified).toHaveLength(1);
    expect(verified[0].title).toBe('Verified');
  });

  it('listItems filters by tags (any-match)', async () => {
    await addItem(projectDir, { title: 'London item', tags: ['london', 'setting'] });
    await addItem(projectDir, { title: 'Other item', tags: ['paris'] });
    const results = await listItems(projectDir, { tags: ['london'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('London item');
  });

  it('rejects invalid subtype', async () => {
    await expect(addItem(projectDir, { title: 'X', subtype: 'not-a-type' })).rejects.toThrow('Invalid subtype');
  });

  it('rejects missing title', async () => {
    await expect(addItem(projectDir, {})).rejects.toThrow('title is required');
  });
});

// ── linker ────────────────────────────────────────────────────────────

describe('linker', () => {
  it('addLink records link in item frontmatter', async () => {
    const item = await addItem(projectDir, { title: 'Link test' });
    await addLink(projectDir, item.id, 'chapter:5');
    const links = await getLinksForItem(projectDir, item.id);
    expect(links).toContain('chapter:5');
  });

  it('addLink is idempotent', async () => {
    const item = await addItem(projectDir, { title: 'Idempotent' });
    await addLink(projectDir, item.id, 'chapter:5');
    await addLink(projectDir, item.id, 'chapter:5');
    const links = await getLinksForItem(projectDir, item.id);
    expect(links.filter(l => l === 'chapter:5')).toHaveLength(1);
  });

  it('removeLink removes the link', async () => {
    const item = await addItem(projectDir, { title: 'Remove link' });
    await addLink(projectDir, item.id, 'chapter:5');
    await removeLink(projectDir, item.id, 'chapter:5');
    const links = await getLinksForItem(projectDir, item.id);
    expect(links).not.toContain('chapter:5');
  });

  it('getItemsForTarget returns linked items', async () => {
    const itemA = await addItem(projectDir, { title: 'Linked to 5' });
    const itemB = await addItem(projectDir, { title: 'Linked to 6' });
    await addLink(projectDir, itemA.id, 'chapter:5');
    await addLink(projectDir, itemB.id, 'chapter:6');
    const results = await getItemsForTarget(projectDir, 'chapter:5');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Linked to 5');
  });

  it('rejects unknown link type', async () => {
    const item = await addItem(projectDir, { title: 'Test' });
    await expect(addLink(projectDir, item.id, 'unknown:5')).rejects.toThrow('Unknown link type');
  });

  it('buildLinkSummary counts all links', async () => {
    const a = await addItem(projectDir, { title: 'A' });
    const b = await addItem(projectDir, { title: 'B' });
    await addLink(projectDir, a.id, 'chapter:5');
    await addLink(projectDir, b.id, 'chapter:5');
    await addLink(projectDir, b.id, 'chapter:6');
    const summary = await buildLinkSummary(projectDir);
    expect(summary['chapter:5']).toBe(2);
    expect(summary['chapter:6']).toBe(1);
  });
});

// ── index ─────────────────────────────────────────────────────────────

describe('index', () => {
  it('rebuildIndex produces valid index with stats', async () => {
    await addItem(projectDir, { title: 'Note 1', subtype: 'note' });
    await addItem(projectDir, { title: 'Quote 1', subtype: 'quote', reliability: 'primary' });
    const index = await rebuildIndex(projectDir);
    expect(index.items).toHaveLength(2);
    expect(index.stats.total).toBe(2);
    expect(index.stats.byVerification.pending).toBe(2);
    expect(index.stats.byReliability.primary).toBe(1);
  });

  it('buildResearchMemoryEntries produces entries for each item', async () => {
    const item = await addItem(projectDir, {
      title: 'Memory test',
      content: 'Some content',
      tags: ['london'],
    });
    const entries = buildResearchMemoryEntries([{ ...item }], { _meta: { projectTitle: 'Test Novel' } });
    expect(entries.length).toBeGreaterThan(0);
    const titleEntry = entries.find(e => e.key.includes(':title'));
    expect(titleEntry.value).toBe('Memory test');
    expect(titleEntry.tags).toContain('research');
    expect(titleEntry.namespace).toMatch(/^novel:/);
  });

  it('memory entries namespace matches novel harness pattern', async () => {
    const item = await addItem(projectDir, { title: 'NS test' });
    const entries = buildResearchMemoryEntries([{ ...item }], { _meta: { projectTitle: 'My Novel' } });
    expect(entries[0].namespace).toBe('novel:my-novel');
  });
});

// ── retrieval ─────────────────────────────────────────────────────────

describe('retrieval', () => {
  it('searchItems matches title', async () => {
    await addItem(projectDir, { title: 'Victorian sewers', content: 'Details about sewers' });
    await addItem(projectDir, { title: 'Modern transport' });
    const results = await searchItems(projectDir, 'victorian');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Victorian sewers');
  });

  it('searchItems matches content', async () => {
    await addItem(projectDir, { title: 'Note', content: 'Whitechapel was densely populated' });
    const results = await searchItems(projectDir, 'whitechapel');
    expect(results).toHaveLength(1);
  });

  it('buildRetrievalPayload sorts verified before pending', async () => {
    const pending = await addItem(projectDir, { title: 'Pending item' });
    const verified = await addItem(projectDir, { title: 'Verified item', verification: 'verified' });

    // Force verification via edit
    await editItem(projectDir, verified.id, { verification: 'verified' });

    const payload = await buildRetrievalPayload(projectDir, {});
    expect(payload.items[0].verification).toBe('verified');
  });

  it('buildRetrievalPayload filters by chapter via linker', async () => {
    const ch5Item = await addItem(projectDir, { title: 'Ch5 item' });
    await addItem(projectDir, { title: 'Ch6 item' });
    await addLink(projectDir, ch5Item.id, 'chapter:5');

    const payload = await buildRetrievalPayload(projectDir, { chapterNumber: 5 });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].title).toBe('Ch5 item');
  });
});

// ── critique ──────────────────────────────────────────────────────────

describe('critique', () => {
  it('flags chapters with fewer than 2 linked items as thin', async () => {
    const item = await addItem(projectDir, { title: 'Single item' });
    await addLink(projectDir, item.id, 'chapter:1');

    const state = {
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Opening' },
        { chapterNumber: 2, chapterTitle: 'Rising action' },
      ],
    };

    const findings = await analyzeGaps(projectDir, state);
    const thin = findings.thinChapters.map(c => c.chapterNumber);
    expect(thin).toContain(1); // 1 item < threshold of 2
    expect(thin).toContain(2); // 0 items
  });

  it('flags pending items with no sources as unsourced', async () => {
    await addItem(projectDir, { title: 'No source', verification: 'pending', sources: [] });
    const findings = await analyzeGaps(projectDir, {});
    expect(findings.unsourcedItems).toHaveLength(1);
    expect(findings.unsourcedItems[0].title).toBe('No source');
  });

  it('does not flag verified items as unsourced even without sources', async () => {
    const item = await addItem(projectDir, { title: 'Verified no source' });
    await editItem(projectDir, item.id, { verification: 'verified' });
    const findings = await analyzeGaps(projectDir, {});
    expect(findings.unsourcedItems).toHaveLength(0);
  });

  it('counts unverified items accurately', async () => {
    await addItem(projectDir, { title: 'Pending 1' });
    await addItem(projectDir, { title: 'Pending 2' });
    const item = await addItem(projectDir, { title: 'Verified' });
    await editItem(projectDir, item.id, { verification: 'verified' });

    const findings = await analyzeGaps(projectDir, {});
    expect(findings.unverified).toHaveLength(2);
    expect(findings.stats.verified).toBe(1);
  });
});
