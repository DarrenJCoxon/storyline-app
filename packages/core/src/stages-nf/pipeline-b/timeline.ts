// @ts-nocheck
// Timeline artifact for Pipeline B (Narrative Non-Fiction)
// Saves .storyline/timeline.json and .storyline/timeline.md from pb-timeline stage data.

import pkg from 'fs-extra';
const { ensureDir, writeFile } = pkg;
import { join } from 'path';

const STORYLINE_DIR = (projectDir) => join(projectDir, '.storyline');

function formatTimelineMarkdown(data) {
  const { timelineSpan, pivotMoment, timelineEvents = [] } = data;

  const lines = [
    `# Timeline`,
    ``,
    timelineSpan ? `**Span:** ${timelineSpan}` : '',
    pivotMoment ? `**Pivot moment:** ${pivotMoment}` : '',
    ``,
    `## Events`,
    ``,
  ].filter(l => l !== undefined);

  if (timelineEvents.length === 0) {
    lines.push('*No events recorded.*', '');
  } else {
    lines.push(
      '| Date | Event | Cast | Significance | Source |',
      '|------|-------|------|--------------|--------|',
      ...timelineEvents.map(e => {
        const date  = (e.date || '').replace(/\|/g, '/');
        const event = (e.event || '').replace(/\|/g, '/');
        const cast  = (e.castInvolved || '').replace(/\|/g, '/');
        const sig   = (e.significance || '').replace(/\|/g, '/');
        const src   = (e.sourceNote || '').replace(/\|/g, '/');
        return `| ${date} | ${event} | ${cast} | ${sig} | ${src} |`;
      }),
      '',
    );
  }

  return lines.join('\n');
}

export async function saveTimeline(projectDir, data) {
  const dir = STORYLINE_DIR(projectDir);
  await ensureDir(dir);

  const json = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    timelineSpan: data.timelineSpan || null,
    pivotMoment: data.pivotMoment || null,
    events: (data.timelineEvents || []).map((e, i) => ({
      index: i + 1,
      date: e.date || null,
      event: e.event || null,
      castInvolved: e.castInvolved || null,
      significance: e.significance || null,
      sourceNote: e.sourceNote || null,
    })),
  };

  const jsonPath = join(dir, 'timeline.json');
  const mdPath   = join(dir, 'timeline.md');

  await writeFile(jsonPath, JSON.stringify(json, null, 2), 'utf8');
  await writeFile(mdPath, formatTimelineMarkdown(data), 'utf8');

  return { jsonPath, mdPath, eventCount: json.events.length };
}

export async function loadTimeline(projectDir) {
  const { pathExists, readFile } = pkg;
  const jsonPath = join(STORYLINE_DIR(projectDir), 'timeline.json');
  if (!(await pathExists(jsonPath))) return null;
  try {
    return JSON.parse(await readFile(jsonPath, 'utf8'));
  } catch {
    return null;
  }
}
