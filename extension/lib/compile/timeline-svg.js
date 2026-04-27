// Timeline SVG renderer — generates a vertical timeline visualization from timeline.json.
// Pure JS SVG generation; no Puppeteer required.
// Output: output/timeline.svg

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const SVG_W = 720;
const ROW_H = 60;
const LINE_X = 160;
const DOT_R = 7;
const DATE_MAX_X = LINE_X - 16;
const LABEL_X = LINE_X + 20;
const PADDING_Y = 30;
const FONT = 'sans-serif';

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, max) {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function buildTimelineSvg(events) {
  if (!events || events.length === 0) return null;

  const svgH = PADDING_Y * 2 + events.length * ROW_H;
  const lineY1 = PADDING_Y + ROW_H / 2;
  const lineY2 = PADDING_Y + (events.length - 1) * ROW_H + ROW_H / 2;

  const rows = events.map((evt, i) => {
    const y = PADDING_Y + i * ROW_H + ROW_H / 2;
    const date = esc(truncate(evt.date || evt.year || '', 22));
    const label = esc(truncate(evt.description || evt.event || evt.title || '', 55));
    const sig = esc(truncate(evt.significance || '', 45));
    const cast = esc(truncate((evt.cast || []).join(', '), 40));

    // Alternate dot fill for pivot moment
    const isPivot = !!evt.isPivotMoment;
    const dotFill = isPivot ? '#c0392b' : '#4a90d9';

    const sigEl = sig
      ? `<text x="${LABEL_X}" y="${y + 16}" font-family="${FONT}" font-size="10" fill="#666" font-style="italic">${sig}</text>`
      : '';
    const castEl = cast
      ? `<text x="${LABEL_X}" y="${y + 28}" font-family="${FONT}" font-size="9" fill="#999">${cast}</text>`
      : '';

    return [
      `<circle cx="${LINE_X}" cy="${y}" r="${DOT_R}" fill="${dotFill}" stroke="white" stroke-width="2"/>`,
      `<text x="${DATE_MAX_X}" y="${y + 4}" font-family="${FONT}" font-size="10" fill="#555" text-anchor="end">${date}</text>`,
      `<text x="${LABEL_X}" y="${y + 2}" font-family="${FONT}" font-size="12" font-weight="bold" fill="#1a2b3c">${label}</text>`,
      sigEl,
      castEl,
    ].filter(Boolean).join('\n  ');
  }).join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${svgH}" viewBox="0 0 ${SVG_W} ${svgH}">
  <rect width="${SVG_W}" height="${svgH}" fill="#fafcff"/>
  <line x1="${LINE_X}" y1="${lineY1}" x2="${LINE_X}" y2="${lineY2}" stroke="#4a90d9" stroke-width="2"/>
  ${rows}
</svg>`;
}

export async function generateTimelineSvg(projectDir) {
  const timelinePath = path.join(projectDir, '.storyline', 'timeline.json');

  let data;
  try {
    const raw = await readFile(timelinePath, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    return { skipped: true, reason: 'no-timeline', message: 'No timeline.json found — complete pb-timeline stage first.' };
  }

  const events = data.events || [];
  if (events.length === 0) {
    return { skipped: true, reason: 'empty', message: 'Timeline has no events.' };
  }

  const svg = buildTimelineSvg(events);
  if (!svg) return { skipped: true, reason: 'empty', message: 'Timeline is empty.' };

  const outputDir = path.join(projectDir, 'output');
  await mkdir(outputDir, { recursive: true });
  const svgPath = path.join(outputDir, 'timeline.svg');
  await writeFile(svgPath, svg, 'utf-8');

  return { svgPath, eventCount: events.length };
}
