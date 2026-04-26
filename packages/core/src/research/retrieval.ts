// @ts-nocheck
// Research retrieval — local filter-based retrieval for CLI use.
// Full semantic search happens via mcp__odd-flow__memory_search in the skill,
// using entries synced from lib/research/index.js#syncResearchToMemory.
// This module handles the CLI-side filtered views and the payload builder
// the skill uses to surface research during drafting.

import { listItems } from './capture.js';
import { getItemsForChapter } from './linker.js';

// ── Filter-based retrieval ────────────────────────────────────────────

export async function getItemsByTags(projectDir, tags) {
  if (!tags || !tags.length) return listItems(projectDir);
  return listItems(projectDir, { tags });
}

export async function getItemsByVerification(projectDir, verificationState) {
  return listItems(projectDir, { verification: verificationState });
}

export async function getItemsBySubtype(projectDir, subtype) {
  return listItems(projectDir, { subtype });
}

export async function getItemsByReliability(projectDir, reliability) {
  return listItems(projectDir, { reliability });
}

// Search by title or content text (case-insensitive substring match)
export async function searchItems(projectDir, query) {
  const all = await listItems(projectDir);
  const q = query.toLowerCase();
  return all.filter(item =>
    (item.title || '').toLowerCase().includes(q) ||
    (item.content || '').toLowerCase().includes(q) ||
    (item.tags || []).some(t => t.toLowerCase().includes(q)),
  );
}

// ── Chapter-scoped retrieval ──────────────────────────────────────────

export { getItemsForChapter };

// ── Retrieval payload ─────────────────────────────────────────────────
// Compact representation for the /storyline skill to surface during drafting.
// Semantic ranking is left to the skill (via mcp__odd-flow__memory_search);
// this provides the local filtered set as a starting point.

export async function buildRetrievalPayload(projectDir, { chapterNumber, query, tags } = {}) {
  let items;

  if (chapterNumber != null) {
    items = await getItemsForChapter(projectDir, chapterNumber);
  } else if (query) {
    items = await searchItems(projectDir, query);
  } else if (tags && tags.length) {
    items = await getItemsByTags(projectDir, tags);
  } else {
    items = await listItems(projectDir);
  }

  // Sort: verified first, then by reliability (primary > peer-reviewed > secondary > anecdotal)
  const reliabilityRank = { primary: 0, 'peer-reviewed': 1, secondary: 2, anecdotal: 3 };
  const verificationRank = { verified: 0, pending: 1, 'needs-follow-up': 2, disputed: 3 };

  items.sort((a, b) => {
    const vA = verificationRank[a.verification] ?? 99;
    const vB = verificationRank[b.verification] ?? 99;
    if (vA !== vB) return vA - vB;
    return (reliabilityRank[a.reliability] ?? 99) - (reliabilityRank[b.reliability] ?? 99);
  });

  return {
    context: { chapterNumber, query, tags },
    count: items.length,
    items: items.map(item => ({
      id: item.id,
      title: item.title,
      subtype: item.subtype,
      reliability: item.reliability,
      verification: item.verification,
      tags: item.tags || [],
      links: item.links || [],
      sources: item.sources || [],
      excerpt: (item.content || '').slice(0, 400),
    })),
  };
}
