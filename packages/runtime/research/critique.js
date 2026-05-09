// Research gap analysis — identifies thin coverage, unsourced claims,
// low-reliability-only chapters, and unverified items.
// Output format suits both CLI display and inclusion in master document critique.

import { listItems } from './capture.js';
import { getItemsForChapter } from './linker.js';

const THIN_THRESHOLD = 2; // chapters with fewer linked items than this are flagged

// ── Gap analysis ──────────────────────────────────────────────────────

export async function analyzeGaps(projectDir, state) {
  const items = await listItems(projectDir);

  const chapters = state?.chapterOutline || [];

  // Chapters with thin research coverage
  const thinChapters = [];
  for (const ch of chapters) {
    const linked = await getItemsForChapter(projectDir, ch.chapterNumber);
    if (linked.length < THIN_THRESHOLD) {
      thinChapters.push({
        chapterNumber: ch.chapterNumber,
        chapterTitle: ch.chapterTitle || `Chapter ${ch.chapterNumber}`,
        linkedCount: linked.length,
      });
    }
  }

  // Items with no sources and verification still pending
  const unsourcedItems = items.filter(item =>
    item.verification === 'pending' &&
    (!item.sources || item.sources.length === 0),
  ).map(item => ({ id: item.id, title: item.title, subtype: item.subtype }));

  // Chapters where all linked evidence is anecdotal
  const lowReliabilityOnly = [];
  for (const ch of chapters) {
    const linked = await getItemsForChapter(projectDir, ch.chapterNumber);
    if (!linked.length) continue;
    const allAnecdotal = linked.every(item => item.reliability === 'anecdotal');
    if (allAnecdotal) {
      lowReliabilityOnly.push({
        chapterNumber: ch.chapterNumber,
        chapterTitle: ch.chapterTitle || `Chapter ${ch.chapterNumber}`,
        itemCount: linked.length,
      });
    }
  }

  // All unverified items (pending + disputed + needs-follow-up)
  const unverified = items
    .filter(item => item.verification !== 'verified')
    .map(item => ({ id: item.id, title: item.title, verification: item.verification, subtype: item.subtype }));

  // Tag coverage map
  const tagCoverage = {};
  for (const item of items) {
    for (const tag of (item.tags || [])) {
      tagCoverage[tag] = (tagCoverage[tag] || 0) + 1;
    }
  }

  const stats = {
    total: items.length,
    verified: items.filter(i => i.verification === 'verified').length,
    pending: items.filter(i => i.verification === 'pending').length,
    disputed: items.filter(i => i.verification === 'disputed').length,
    needsFollowUp: items.filter(i => i.verification === 'needs-follow-up').length,
    primaryOrPeerReviewed: items.filter(i =>
      i.reliability === 'primary' || i.reliability === 'peer-reviewed',
    ).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    stats,
    thinChapters,
    unsourcedItems,
    lowReliabilityOnly,
    unverified,
    tagCoverage,
  };
}

// ── CLI display ───────────────────────────────────────────────────────

export function formatGapsReport(findings) {
  const { stats, thinChapters, unsourcedItems, lowReliabilityOnly, unverified } = findings;
  const lines = [
    `Research Gap Analysis — ${findings.generatedAt.slice(0, 10)}`,
    ``,
    `Overview: ${stats.total} items | ${stats.verified} verified | ${stats.pending} pending | ${stats.disputed} disputed`,
    `Strong sources: ${stats.primaryOrPeerReviewed} of ${stats.total} items are primary or peer-reviewed`,
  ];

  if (thinChapters.length) {
    lines.push('', `Thin chapters (< ${THIN_THRESHOLD} linked items):`);
    for (const ch of thinChapters) {
      lines.push(`  Ch${ch.chapterNumber} "${ch.chapterTitle}" — ${ch.linkedCount} item(s)`);
    }
  } else {
    lines.push('', '✓ All chapters have adequate research coverage');
  }

  if (unsourcedItems.length) {
    lines.push('', `Unsourced items (pending + no sources):`);
    for (const item of unsourcedItems.slice(0, 10)) {
      lines.push(`  [${item.subtype}] ${item.title}`);
    }
    if (unsourcedItems.length > 10) lines.push(`  … and ${unsourcedItems.length - 10} more`);
  }

  if (lowReliabilityOnly.length) {
    lines.push('', `Chapters with only anecdotal evidence:`);
    for (const ch of lowReliabilityOnly) {
      lines.push(`  Ch${ch.chapterNumber} "${ch.chapterTitle}" — ${ch.itemCount} item(s), all anecdotal`);
    }
  }

  if (unverified.length) {
    lines.push('', `Unverified items: ${unverified.length}`);
    const disputed = unverified.filter(i => i.verification === 'disputed');
    if (disputed.length) {
      lines.push(`  Disputed (resolve these first):`);
      for (const item of disputed) lines.push(`    ${item.title}`);
    }
  }

  if (!thinChapters.length && !unsourcedItems.length && !lowReliabilityOnly.length && !unverified.length) {
    lines.push('', '✓ No significant research gaps detected');
  }

  return lines.join('\n');
}
