// Skill tree SVG renderer — generates a DAG visualization from skill-tree.json.
// Pure JS SVG generation; no Puppeteer required.
// Output: output/skill-tree.svg

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const NODE_W = 180;
const NODE_H = 44;
const COL_GAP = 80;
const ROW_GAP = 24;
const PADDING = 40;

// Assign each node a level = longest path from any root (ensures proper DAG layout)
function assignLevels(nodes, edges) {
  const adj = {};
  const inDeg = {};

  for (const n of nodes) {
    adj[n.id] = [];
    inDeg[n.id] = 0;
  }

  for (const e of edges) {
    if (!adj[e.from]) adj[e.from] = [];
    adj[e.from].push(e.to);
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
  }

  // Kahn's topological sort + longest-path level assignment
  const queue = nodes.filter(n => (inDeg[n.id] || 0) === 0).map(n => n.id);
  const level = {};
  for (const id of queue) level[id] = 0;

  while (queue.length) {
    const id = queue.shift();
    for (const child of (adj[id] || [])) {
      level[child] = Math.max(level[child] || 0, (level[id] || 0) + 1);
      inDeg[child]--;
      if (inDeg[child] === 0) queue.push(child);
    }
  }

  // Any nodes not reached (cycles) get appended after the last level
  const maxSeen = Object.values(level).length > 0 ? Math.max(...Object.values(level)) : 0;
  for (const n of nodes) {
    if (level[n.id] === undefined) level[n.id] = maxSeen + 1;
  }

  return level;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export function buildSkillTreeSvg(nodes, edges) {
  if (nodes.length === 0) return null;

  const level = assignLevels(nodes, edges);
  const maxLevel = Math.max(...Object.values(level));

  // Group by level
  const byLevel = {};
  for (const n of nodes) {
    const l = level[n.id] || 0;
    if (!byLevel[l]) byLevel[l] = [];
    byLevel[l].push(n);
  }

  const totalLevels = maxLevel + 1;
  const maxNodesInLevel = Math.max(...Object.values(byLevel).map(a => a.length));

  const svgW = PADDING * 2 + totalLevels * NODE_W + (totalLevels - 1) * COL_GAP;
  const svgH = PADDING * 2 + maxNodesInLevel * NODE_H + (maxNodesInLevel - 1) * ROW_GAP;

  // Assign x, y per node
  const pos = {};
  for (let l = 0; l <= maxLevel; l++) {
    const levelNodes = byLevel[l] || [];
    const totalH = levelNodes.length * NODE_H + (levelNodes.length - 1) * ROW_GAP;
    const startY = PADDING + (svgH - PADDING * 2 - totalH) / 2;
    const x = PADDING + l * (NODE_W + COL_GAP);

    levelNodes.forEach((n, i) => {
      pos[n.id] = {
        x,
        y: startY + i * (NODE_H + ROW_GAP),
        label: n.label || n.id,
      };
    });
  }

  // Edges (drawn first so nodes appear on top)
  const pathEls = edges.map(e => {
    const from = pos[e.from];
    const to = pos[e.to];
    if (!from || !to) return '';
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}" fill="none" stroke="#4a90d9" stroke-width="1.5" marker-end="url(#arrow)"/>`;
  }).filter(Boolean).join('\n  ');

  // Nodes
  const nodeEls = nodes.map(n => {
    const p = pos[n.id];
    if (!p) return '';
    const label = truncate(p.label, 24);
    return [
      `<rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="6" ry="6" fill="#e8f4fd" stroke="#4a90d9" stroke-width="1.5"/>`,
      `<text x="${p.x + NODE_W / 2}" y="${p.y + NODE_H / 2 + 5}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#1a2b3c">${label}</text>`,
    ].join('\n  ');
  }).filter(Boolean).join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#4a90d9"/>
    </marker>
  </defs>
  <rect width="${svgW}" height="${svgH}" fill="#fafcff"/>
  ${pathEls}
  ${nodeEls}
</svg>`;
}

export async function generateSkillTreeSvg(projectDir) {
  const skillTreePath = path.join(projectDir, '.storyline', 'skill-tree.json');

  let data;
  try {
    const raw = await readFile(skillTreePath, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    return { skipped: true, reason: 'no-skill-tree', message: 'No skill-tree.json found — complete pc-prereqs stage first.' };
  }

  const nodes = data.nodes || [];
  const edges = data.edges || [];

  if (nodes.length === 0) {
    return { skipped: true, reason: 'empty', message: 'Skill tree has no nodes.' };
  }

  const svg = buildSkillTreeSvg(nodes, edges);
  if (!svg) return { skipped: true, reason: 'empty', message: 'Skill tree is empty.' };

  const outputDir = path.join(projectDir, 'output');
  await mkdir(outputDir, { recursive: true });
  const svgPath = path.join(outputDir, 'skill-tree.svg');
  await writeFile(svgPath, svg, 'utf-8');

  return { svgPath, nodeCount: nodes.length, edgeCount: edges.length };
}
