// Skill Tree artifact for Pipeline C (How-To / Skill Ladder)
// Validates the prerequisite graph (DAG) and saves:
//   .storyline/skill-tree.json  — machine-readable DAG
//   .storyline/skill-tree.md    — human-readable outline

import pkg from 'fs-extra';
const { ensureDir, writeFile, pathExists, readFile } = pkg;
import { join } from 'path';

const STORYLINE_DIR = (projectDir) => join(projectDir, '.storyline');

// ── DAG validation ───────────────────────────────────────────────────────────

function buildAdjacency(nodes, edges) {
  const adj = {};
  for (const node of nodes) adj[node.id] = [];
  for (const edge of edges) {
    if (adj[edge.from] !== undefined) {
      adj[edge.from].push(edge.to);
    }
  }
  return adj;
}

function detectCycles(nodes, adj) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  for (const node of nodes) color[node.id] = WHITE;

  const cycles = [];

  function dfs(id, path) {
    color[id] = GRAY;
    for (const neighbor of (adj[id] || [])) {
      if (color[neighbor] === GRAY) {
        const cycleStart = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStart), neighbor]);
      } else if (color[neighbor] === WHITE) {
        dfs(neighbor, [...path, neighbor]);
      }
    }
    color[id] = BLACK;
  }

  for (const node of nodes) {
    if (color[node.id] === WHITE) dfs(node.id, [node.id]);
  }

  return cycles;
}

function findOrphans(nodes, edges) {
  const hasIncoming = new Set(edges.map(e => e.to));
  const hasOutgoing = new Set(edges.map(e => e.from));
  return nodes.filter(n => !hasIncoming.has(n.id) && !hasOutgoing.has(n.id));
}

function topologicalSort(nodes, adj) {
  const inDegree = {};
  for (const node of nodes) inDegree[node.id] = 0;
  for (const [, neighbors] of Object.entries(adj)) {
    for (const n of neighbors) {
      if (inDegree[n] !== undefined) inDegree[n]++;
    }
  }

  const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const order = [];

  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const neighbor of (adj[id] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  return order;
}

export function validateSkillTree(nodes, edges) {
  const errors = [];
  const warnings = [];

  if (!nodes || nodes.length === 0) {
    errors.push('No sub-skills defined. Complete Stage 4 (Skill Decomposition) first.');
    return { valid: false, errors, warnings, cycles: [], orphans: [], topologicalOrder: [] };
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  const invalidEdges = edges.filter(e => !nodeIds.has(e.from) || !nodeIds.has(e.to));
  if (invalidEdges.length > 0) {
    invalidEdges.forEach(e => errors.push(`Edge references unknown skill ID: "${e.from}" → "${e.to}"`));
  }

  const validEdges = edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
  const adj = buildAdjacency(nodes, validEdges);

  const cycles = detectCycles(nodes, adj);
  for (const cycle of cycles) {
    errors.push(`Cycle detected: ${cycle.join(' → ')}. Prerequisites cannot be circular.`);
  }

  const orphans = findOrphans(nodes, validEdges);
  for (const orphan of orphans) {
    warnings.push(`Sub-skill "${orphan.id}" (${orphan.name}) has no prerequisite relationships — it is isolated in the graph.`);
  }

  const roots = nodes.filter(n => !validEdges.some(e => e.to === n.id));
  if (roots.length === 0 && validEdges.length > 0) {
    errors.push('No root node found — every skill requires a prerequisite. The graph has a cycle or missing entry point.');
  } else if (roots.length > 3) {
    warnings.push(`${roots.length} root nodes (no prerequisites). Most books start with 1–2 foundational skills. More may indicate loose decomposition.`);
  }

  const topoOrder = cycles.length === 0 ? topologicalSort(nodes, adj) : [];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cycles,
    orphans: orphans.map(o => o.id),
    topologicalOrder: topoOrder,
    roots: roots.map(r => r.id),
  };
}

// ── Markdown rendering ────────────────────────────────────────────────────────

function formatSkillTreeMarkdown(nodes, edges, validation, targetSkill) {
  const lines = [
    `# Skill Tree`,
    ``,
    targetSkill ? `**Target skill:** ${targetSkill}` : '',
    `**Nodes:** ${nodes.length} sub-skills | **Edges:** ${edges.length} prerequisites`,
    ``,
  ].filter(l => l !== undefined);

  if (validation.errors.length > 0) {
    lines.push('## Validation Errors', '');
    validation.errors.forEach(e => lines.push(`- ✗ ${e}`));
    lines.push('');
  }
  if (validation.warnings.length > 0) {
    lines.push('## Warnings', '');
    validation.warnings.forEach(w => lines.push(`- ⚠ ${w}`));
    lines.push('');
  }

  lines.push('## Learning Order (Topological)', '');
  if (validation.topologicalOrder.length > 0) {
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    validation.topologicalOrder.forEach((id, i) => {
      const node = nodeMap[id];
      const prereqs = edges.filter(e => e.to === id).map(e => e.from);
      const prereqStr = prereqs.length > 0 ? ` ← requires: ${prereqs.join(', ')}` : ' ← (root)';
      lines.push(`${i + 1}. **${node?.name || id}** \`${id}\`${prereqStr}`);
      if (node?.description) lines.push(`   ${node.description}`);
    });
  } else if (validation.cycles.length > 0) {
    lines.push('*Cannot compute order — graph has cycles. Fix errors above first.*');
  } else {
    lines.push('*No prerequisite edges defined — all skills are roots.*');
    nodes.forEach((n, i) => lines.push(`${i + 1}. **${n.name}** \`${n.id}\``));
  }

  lines.push('');
  return lines.join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function saveSkillTree(projectDir, decompose, prereqs, targetSkill) {
  const dir = STORYLINE_DIR(projectDir);
  await ensureDir(dir);

  const subSkills = Array.isArray(decompose?.subSkills) ? decompose.subSkills : [];
  const nodes = subSkills.map(s => ({
    id: s.id || s.name?.toLowerCase().replace(/\s+/g, '-') || `skill-${Math.random().toString(36).slice(2, 6)}`,
    name: s.name || s.id || '',
    description: s.description || '',
    chapterAssignment: s.chapterAssignment || null,
  }));

  const prereqEdges = Array.isArray(prereqs?.prereqEdges) ? prereqs.prereqEdges : [];
  const edges = [];
  for (const entry of prereqEdges) {
    const requires = typeof entry.requires === 'string'
      ? entry.requires.split(',').map(s => s.trim()).filter(Boolean)
      : Array.isArray(entry.requires) ? entry.requires : [];
    for (const dep of requires) {
      edges.push({ from: dep, to: entry.skillId });
    }
  }

  const validation = validateSkillTree(nodes, edges);

  const json = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    targetSkill: targetSkill || null,
    nodes,
    edges,
    validation: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      topologicalOrder: validation.topologicalOrder,
      roots: validation.roots,
      orphans: validation.orphans,
    },
  };

  const jsonPath = join(dir, 'skill-tree.json');
  const mdPath   = join(dir, 'skill-tree.md');

  await writeFile(jsonPath, JSON.stringify(json, null, 2), 'utf8');
  await writeFile(mdPath, formatSkillTreeMarkdown(nodes, edges, validation, targetSkill), 'utf8');

  return {
    jsonPath,
    mdPath,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    topologicalOrder: validation.topologicalOrder,
  };
}

export async function loadSkillTree(projectDir) {
  const jsonPath = join(STORYLINE_DIR(projectDir), 'skill-tree.json');
  if (!(await pathExists(jsonPath))) return null;
  try {
    return JSON.parse(await readFile(jsonPath, 'utf8'));
  } catch {
    return null;
  }
}
