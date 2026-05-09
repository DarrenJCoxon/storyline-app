// Research linker — bidirectional links between research items and planning targets.
// Targets: chapter:<n>, scene:<ch>-<s>, stage:<stageId>, claim:<id>
// Links are stored in the item's frontmatter links[] field.
// The reverse index (target → items) is derived by scanning all items.

import { getItem, editItem, listItems } from './capture.js';
import { LINK_TYPES } from './schema.js';

function parseLinkTarget(target) {
  const [type, ...rest] = target.split(':');
  if (!LINK_TYPES.includes(type)) throw new Error(`Unknown link type: ${type}. Valid: ${LINK_TYPES.join(', ')}`);
  return { type, identifier: rest.join(':') };
}

// ── Public API ────────────────────────────────────────────────────────

export async function addLink(projectDir, itemId, target) {
  parseLinkTarget(target); // validates
  const item = await getItem(projectDir, itemId);
  if (!item) throw new Error(`Research item not found: ${itemId}`);

  const links = item.links || [];
  if (links.includes(target)) return item; // idempotent

  return editItem(projectDir, itemId, { links: [...links, target] });
}

export async function removeLink(projectDir, itemId, target) {
  const item = await getItem(projectDir, itemId);
  if (!item) throw new Error(`Research item not found: ${itemId}`);

  const links = (item.links || []).filter(l => l !== target);
  return editItem(projectDir, itemId, { links });
}

export async function getLinksForItem(projectDir, itemId) {
  const item = await getItem(projectDir, itemId);
  if (!item) return [];
  return item.links || [];
}

export async function getItemsForTarget(projectDir, target) {
  parseLinkTarget(target); // validates
  const items = await listItems(projectDir);
  return items.filter(item => (item.links || []).includes(target));
}

export async function getItemsForChapter(projectDir, chapterNumber) {
  const target = `chapter:${chapterNumber}`;
  return getItemsForTarget(projectDir, target);
}

export async function validateLinks(projectDir, state) {
  const items = await listItems(projectDir);
  const findings = [];
  const validChapters = new Set(
    (state?.chapterOutline || []).map(c => `chapter:${c.chapterNumber}`),
  );

  for (const item of items) {
    for (const link of (item.links || [])) {
      const { type } = parseLinkTarget(link);
      if (type === 'chapter' && validChapters.size > 0 && !validChapters.has(link)) {
        findings.push({
          itemId: item.id,
          itemTitle: item.title,
          link,
          issue: 'chapter-not-in-outline',
        });
      }
    }
  }

  return findings;
}

// Summary: { target → count } map for all links across all items
export async function buildLinkSummary(projectDir) {
  const items = await listItems(projectDir);
  const summary = {};
  for (const item of items) {
    for (const link of (item.links || [])) {
      summary[link] = (summary[link] || 0) + 1;
    }
  }
  return summary;
}
