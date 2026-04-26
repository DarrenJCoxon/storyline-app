// @ts-nocheck
// Research compile — bibliography, endnotes, and fact-check report generation.
// Reads from the research subsystem; writes derived compile artifacts.
// No new content is captured here — all data comes from planning stages.

import { listItems } from './capture.js';
import { getItemsForChapter } from './linker.js';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// ── Citation formatters ──────────────────────────────────────────────────────

export function formatChicago(item) {
  const author = item.author || '';
  const title = item.title || 'Untitled';
  const year = item.year || 'n.d.';
  const source = item.source || '';
  const url = item.url || '';

  const parts = [];
  if (author) parts.push(`${author}.`);

  if (source) {
    parts.push(`"${title}." *${source}*, ${year}.`);
  } else {
    parts.push(`*${title}*. ${year}.`);
  }

  if (url) parts.push(url);
  return parts.join(' ');
}

export function formatAPA(item) {
  const author = item.author || '';
  const title = item.title || 'Untitled';
  const year = item.year || 'n.d.';
  const source = item.source || '';
  const url = item.url || '';

  const parts = [];
  if (author) parts.push(`${author} (${year}).`);
  else parts.push(`(${year}).`);

  if (source) {
    parts.push(`${title}. *${source}*.`);
  } else {
    parts.push(`*${title}*.`);
  }

  if (url) parts.push(url);
  return parts.join(' ');
}

export function formatMLA(item) {
  const author = item.author || '';
  const title = item.title || 'Untitled';
  const year = item.year || 'n.d.';
  const source = item.source || '';
  const url = item.url || '';

  const parts = [];
  if (author) parts.push(`${author}.`);

  if (source) {
    parts.push(`"${title}." *${source}*, ${year}.`);
  } else {
    parts.push(`*${title}*. ${year}.`);
  }

  if (url) parts.push(url);
  return parts.join(' ');
}

function getFormatter(citationStyle) {
  if (citationStyle === 'apa') return formatAPA;
  if (citationStyle === 'mla') return formatMLA;
  return formatChicago;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function generateBibliography(projectDir, { citationStyle = 'chicago' } = {}) {
  const items = await listItems(projectDir);
  const citable = items.filter(item => item.author || item.source || item.url || item.title);

  const formatter = getFormatter(citationStyle);

  const sorted = [...citable].sort((a, b) => {
    const aLast = (a.author || a.title || '').split(',')[0].trim();
    const bLast = (b.author || b.title || '').split(',')[0].trim();
    return aLast.localeCompare(bLast);
  });

  const entries = sorted.map(item => formatter(item));

  const styleLabel = { chicago: 'Chicago', apa: 'APA', mla: 'MLA' }[citationStyle] || citationStyle;
  const lines = [`# Bibliography\n`, `*Citation style: ${styleLabel}*\n`];
  lines.push(...entries.map(e => `- ${e}`));

  const outputDir = path.join(projectDir, 'output');
  await mkdir(outputDir, { recursive: true });
  const bibPath = path.join(outputDir, 'bibliography.md');
  await writeFile(bibPath, lines.join('\n'), 'utf-8');

  return { bibPath, entryCount: entries.length, citationStyle, entries };
}

export async function generateEndnotesForChapter(projectDir, chapterNumber, { citationStyle = 'chicago' } = {}) {
  const items = await getItemsForChapter(projectDir, chapterNumber);
  const formatter = getFormatter(citationStyle);

  const notes = items.map((item, idx) => ({
    number: idx + 1,
    itemId: item.id,
    title: item.title,
    citation: formatter(item),
    notes: item.notes || null,
  }));

  return { chapterNumber, notes };
}

export async function generateAllEndnotes(projectDir, chapterNumbers, { citationStyle = 'chicago' } = {}) {
  const chapterEndnotes = [];
  for (const chNum of chapterNumbers) {
    const en = await generateEndnotesForChapter(projectDir, chNum, { citationStyle });
    if (en.notes.length > 0) chapterEndnotes.push(en);
  }

  if (chapterEndnotes.length === 0) return null;

  const lines = ['# Endnotes\n'];
  for (const ch of chapterEndnotes) {
    lines.push(`## Chapter ${ch.chapterNumber}\n`);
    lines.push(...ch.notes.map(n => `${n.number}. ${n.citation}`));
    lines.push('');
  }

  const outputDir = path.join(projectDir, 'output');
  await mkdir(outputDir, { recursive: true });
  const endnotePath = path.join(outputDir, 'endnotes.md');
  await writeFile(endnotePath, lines.join('\n'), 'utf-8');

  return { endnotePath, chapterCount: chapterEndnotes.length };
}

export async function generateFactCheckReport(projectDir) {
  const items = await listItems(projectDir);

  const verified = items.filter(i => i.verification === 'verified');
  const pending = items.filter(i => i.verification === 'pending' || !i.verification);
  const disputed = items.filter(i => i.verification === 'disputed');
  const needsFollowUp = items.filter(i => i.verification === 'needs-follow-up');
  const unverified = [...pending, ...disputed, ...needsFollowUp];

  const lines = [
    '# Fact-Check Report\n',
    `| State | Count |`,
    `|-------|-------|`,
    `| Verified | ${verified.length} |`,
    `| Pending | ${pending.length} |`,
    `| Disputed | ${disputed.length} |`,
    `| Needs follow-up | ${needsFollowUp.length} |`,
    `| **Total** | **${items.length}** |`,
    '',
  ];

  if (unverified.length > 0) {
    lines.push('## Unverified Claims\n');
    for (const item of unverified) {
      const state = item.verification || 'pending';
      lines.push(`- **[${state.toUpperCase()}]** ${item.title || item.id}${item.author ? ` — ${item.author}` : ''}`);
      if (item.notes) lines.push(`  > ${item.notes}`);
    }
    lines.push('');
  } else {
    lines.push('All research items have been verified.\n');
  }

  const outputDir = path.join(projectDir, 'output');
  await mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, 'fact-check-report.md');
  await writeFile(reportPath, lines.join('\n'), 'utf-8');

  const summary = {
    total: items.length,
    verified: verified.length,
    pending: pending.length,
    disputed: disputed.length,
    needsFollowUp: needsFollowUp.length,
    unverifiedCount: unverified.length,
  };

  return { reportPath, summary };
}
