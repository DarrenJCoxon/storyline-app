// @ts-nocheck
// Sourcing Register for Pipeline B (Narrative Non-Fiction)
// Filtered view over the research subsystem — items with subtype 'sourced-claim'.
// Writes .storyline/sourcing/register.json and register.md.
// No duplicate storage: the research items are the source of truth.

import pkg from 'fs-extra';
const { ensureDir, writeFile } = pkg;
import { join } from 'path';
import { listItems } from '../../research/capture.js';

const SOURCING_DIR = (projectDir) => join(projectDir, '.storyline', 'sourcing');

function groupByLink(items) {
  const groups = {};
  for (const item of items) {
    const links = Array.isArray(item.links) ? item.links : [];
    if (links.length === 0) {
      const key = 'unlinked';
      groups[key] = groups[key] || [];
      groups[key].push(item);
    } else {
      for (const link of links) {
        groups[link] = groups[link] || [];
        groups[link].push(item);
      }
    }
  }
  return groups;
}

function formatRegisterMarkdown(items, groups) {
  const lines = [
    `# Sourcing Register`,
    ``,
    `*View of research items where subtype = "sourced-claim"*`,
    `*Total: ${items.length} sourced claim(s)*`,
    ``,
  ];

  if (items.length === 0) {
    lines.push(
      `*No sourced claims yet. Add sources via:*`,
      `\`\`\``,
      `npx storyline-vsc research add --subtype sourced-claim --link scene:ch1-s1`,
      `\`\`\``,
      '',
    );
    return lines.join('\n');
  }

  const sortedGroups = Object.keys(groups).sort((a, b) => {
    if (a === 'unlinked') return 1;
    if (b === 'unlinked') return -1;
    return a.localeCompare(b);
  });

  for (const link of sortedGroups) {
    const groupItems = groups[link];
    lines.push(`## ${link === 'unlinked' ? 'Unlinked' : link}`);
    lines.push('');
    for (const item of groupItems) {
      lines.push(`### ${item.title || '(untitled)'}`);
      lines.push(`**ID:** ${item.id} | **Reliability:** ${item.reliability} | **Verification:** ${item.verification}`);
      if (item.sources?.length) {
        lines.push(`**Source(s):** ${item.sources.join('; ')}`);
      }
      if (item.content) {
        lines.push('');
        lines.push(item.content.slice(0, 300) + (item.content.length > 300 ? '…' : ''));
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export async function buildSourcingRegister(projectDir) {
  const dir = SOURCING_DIR(projectDir);
  await ensureDir(dir);

  const allItems = await listItems(projectDir);
  const sourcedClaims = allItems.filter(item => item.subtype === 'sourced-claim');
  const groups = groupByLink(sourcedClaims);

  const register = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    itemCount: sourcedClaims.length,
    items: sourcedClaims.map(item => ({
      id: item.id,
      title: item.title || '(untitled)',
      reliability: item.reliability,
      verification: item.verification,
      links: item.links || [],
      sources: item.sources || [],
      contentPreview: (item.content || '').slice(0, 200).replace(/\n/g, ' '),
    })),
    byLink: Object.fromEntries(
      Object.entries(groups).map(([k, v]) => [k, v.map(i => i.id)]),
    ),
  };

  const jsonPath = join(dir, 'register.json');
  const mdPath   = join(dir, 'register.md');

  await writeFile(jsonPath, JSON.stringify(register, null, 2), 'utf8');
  await writeFile(mdPath, formatRegisterMarkdown(sourcedClaims, groups), 'utf8');

  return { jsonPath, mdPath, itemCount: sourcedClaims.length };
}
