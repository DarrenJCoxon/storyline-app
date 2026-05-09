// Research index — rebuilds index.json + index.md from items directory.
// Also builds memory entries (same pattern as lib/memory/stage-memory.js)
// so research items flow into the odd-flow MCP namespace alongside planning memory.

import pkg from 'fs-extra';
const { ensureDir, writeFile, readFile, pathExists } = pkg;
import { resolve, join } from 'path';
import { listItems } from './capture.js';
import { appendMemoryLog } from '../memory/stage-memory.js';

const RESEARCH_DIR = (projectDir) => join(projectDir, '.storyline', 'research');
const INDEX_JSON = (projectDir) => join(RESEARCH_DIR(projectDir), 'index.json');
const INDEX_MD = (projectDir) => join(RESEARCH_DIR(projectDir), 'index.md');

const slugify = (s) => (s || '').toString().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// ── Index rebuild ─────────────────────────────────────────────────────

export async function rebuildIndex(projectDir) {
  await ensureDir(RESEARCH_DIR(projectDir));
  const items = await listItems(projectDir);

  const stats = {
    total: items.length,
    byVerification: { verified: 0, pending: 0, disputed: 0, 'needs-follow-up': 0 },
    byReliability: { primary: 0, 'peer-reviewed': 0, secondary: 0, anecdotal: 0 },
    bySubtype: {},
  };

  const indexItems = items.map(item => {
    if (stats.byVerification[item.verification] !== undefined)
      stats.byVerification[item.verification]++;
    if (stats.byReliability[item.reliability] !== undefined)
      stats.byReliability[item.reliability]++;
    stats.bySubtype[item.subtype] = (stats.bySubtype[item.subtype] || 0) + 1;

    return {
      id: item.id,
      title: item.title || '(untitled)',
      subtype: item.subtype,
      reliability: item.reliability,
      verification: item.verification,
      tags: item.tags || [],
      links: item.links || [],
      sources: item.sources || [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      contentPreview: (item.content || '').slice(0, 200).replace(/\n/g, ' '),
    };
  });

  const index = {
    schemaVersion: 1,
    lastRebuilt: new Date().toISOString(),
    projectDir,
    items: indexItems,
    stats,
  };

  await writeFile(INDEX_JSON(projectDir), JSON.stringify(index, null, 2), 'utf8');
  await writeFile(INDEX_MD(projectDir), formatIndexMarkdown(index), 'utf8');

  return index;
}

export async function loadIndex(projectDir) {
  const path = INDEX_JSON(projectDir);
  if (!(await pathExists(path))) return rebuildIndex(projectDir);
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return rebuildIndex(projectDir);
  }
}

function formatIndexMarkdown(index) {
  const { stats, items, lastRebuilt } = index;
  const lines = [
    `# Research Index`,
    ``,
    `Last rebuilt: ${lastRebuilt}`,
    ``,
    `## Summary`,
    ``,
    `- **Total items:** ${stats.total}`,
    `- **Verified:** ${stats.byVerification.verified}`,
    `- **Pending:** ${stats.byVerification.pending}`,
    `- **Disputed:** ${stats.byVerification.disputed}`,
    `- **Needs follow-up:** ${stats.byVerification['needs-follow-up']}`,
    ``,
    `## Items`,
    ``,
  ];

  if (!items.length) {
    lines.push('*No research items yet.*');
  } else {
    for (const item of items) {
      lines.push(`### ${item.title || '(untitled)'}`);
      lines.push(`**ID:** ${item.id} | **Type:** ${item.subtype} | **Reliability:** ${item.reliability} | **Verification:** ${item.verification}`);
      if (item.tags.length) lines.push(`**Tags:** ${item.tags.join(', ')}`);
      if (item.links.length) lines.push(`**Linked to:** ${item.links.join(', ')}`);
      if (item.contentPreview) lines.push(``, item.contentPreview + (item.contentPreview.length === 200 ? '…' : ''));
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Memory integration ────────────────────────────────────────────────
// Research items embed into the same odd-flow namespace as planning memory.
// Each item gets its own memory entry tagged with type:research so stage
// queries don't collide with research retrieval.

export function buildResearchMemoryEntries(items, state) {
  const projectSlug = slugify(
    state?._meta?.projectTitle || state?._meta?.projectPath || 'project',
  );
  const namespace = `novel:${projectSlug}`;

  const entries = [];
  for (const item of items) {
    const tags = ['storyline', 'research', item.subtype, item.verification, projectSlug,
      ...(item.tags || []),
    ];

    if (item.title) {
      entries.push({
        namespace,
        key: `research:${item.id}:title`,
        value: item.title,
        tags,
      });
    }

    if (item.content) {
      entries.push({
        namespace,
        key: `research:${item.id}:content`,
        value: item.content.slice(0, 2000),
        tags,
      });
    }

    if (item.sources?.length) {
      entries.push({
        namespace,
        key: `research:${item.id}:sources`,
        value: item.sources.join(' · '),
        tags,
      });
    }

    if (item.links?.length) {
      entries.push({
        namespace,
        key: `research:${item.id}:links`,
        value: item.links.join(', '),
        tags,
      });
    }

    entries.push({
      namespace,
      key: `research:${item.id}:meta`,
      value: JSON.stringify({
        subtype: item.subtype,
        reliability: item.reliability,
        verification: item.verification,
        tags: item.tags || [],
      }),
      tags,
    });
  }

  return entries.filter(e => e.value !== undefined && String(e.value).trim());
}

export async function syncResearchToMemory(projectDir, state) {
  const items = await listItems(projectDir);
  const entries = buildResearchMemoryEntries(items, state);
  // CB-02: pass projectDir through.
  const result = await appendMemoryLog(entries, projectDir);
  return result;
}
