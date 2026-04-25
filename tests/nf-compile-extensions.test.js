// NF-09 — Compile pipeline extensions
// Tests: bibliography formatting, endnotes, fact-check report, skill tree SVG,
//        timeline SVG, objection index, reader transform, nf-extras orchestration.

import { describe, it, expect } from 'vitest';

// ── Inline formatters (pure functions, no FS) ──────────────────────────────

import {
  formatChicago,
  formatAPA,
  formatMLA,
} from '../lib/research/compile.js';

// ── SVG builders (pure functions, no FS) ──────────────────────────────────

import { buildSkillTreeSvg } from '../lib/compile/skill-tree-svg.js';
import { buildTimelineSvg } from '../lib/compile/timeline-svg.js';

// ── NF extras inline helpers ───────────────────────────────────────────────

import {
  buildObjectionIndex,
  buildReaderTransformSummary,
} from '../lib/compile/nf-extras.js';

// ── Citation formatters ────────────────────────────────────────────────────

describe('formatChicago', () => {
  it('formats a book with author, title, year, source', () => {
    const item = { author: 'Kahneman, Daniel', title: 'Thinking, Fast and Slow', year: '2011', source: 'Farrar, Straus and Giroux' };
    const result = formatChicago(item);
    expect(result).toContain('Kahneman, Daniel');
    expect(result).toContain('Thinking, Fast and Slow');
    expect(result).toContain('2011');
  });

  it('handles item with no author', () => {
    const item = { title: 'Annual Report', year: '2020', source: 'OECD' };
    const result = formatChicago(item);
    expect(result).toContain('Annual Report');
    expect(result).not.toMatch(/^undefined/);
  });

  it('appends URL when present', () => {
    const item = { author: 'Smith, Jane', title: 'Study', year: '2022', url: 'https://example.com' };
    const result = formatChicago(item);
    expect(result).toContain('https://example.com');
  });

  it('wraps title in italics markdown when no source', () => {
    const item = { author: 'Black, John', title: 'Deep Work', year: '2016' };
    const result = formatChicago(item);
    expect(result).toContain('*Deep Work*');
  });
});

describe('formatAPA', () => {
  it('includes year in parentheses', () => {
    const item = { author: 'Duhigg, Charles', title: 'The Power of Habit', year: '2012' };
    const result = formatAPA(item);
    expect(result).toContain('(2012)');
    expect(result).toContain('Duhigg, Charles');
  });

  it('uses n.d. when no year', () => {
    const item = { author: 'Doe, Jane', title: 'Untitled Study' };
    const result = formatAPA(item);
    expect(result).toContain('(n.d.)');
  });

  it('handles no author', () => {
    const item = { title: 'WHO Report', year: '2021', source: 'World Health Organization' };
    const result = formatAPA(item);
    expect(result).toContain('(2021)');
    expect(result).not.toMatch(/^undefined/);
  });
});

describe('formatMLA', () => {
  it('produces MLA-style citation', () => {
    const item = { author: 'Newport, Cal', title: 'Deep Work', year: '2016', source: 'Grand Central Publishing' };
    const result = formatMLA(item);
    expect(result).toContain('Newport, Cal');
    expect(result).toContain('Deep Work');
    expect(result).toContain('2016');
  });

  it('handles item with no source', () => {
    const item = { author: 'Taleb, Nassim Nicholas', title: 'Antifragile', year: '2012' };
    const result = formatMLA(item);
    expect(result).toContain('*Antifragile*');
  });
});

// ── Skill tree SVG ─────────────────────────────────────────────────────────

describe('buildSkillTreeSvg', () => {
  const nodes = [
    { id: 'a', label: 'Fundamentals' },
    { id: 'b', label: 'Intermediate' },
    { id: 'c', label: 'Advanced' },
  ];
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ];

  it('returns a valid SVG string', () => {
    const svg = buildSkillTreeSvg(nodes, edges);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes all node labels', () => {
    const svg = buildSkillTreeSvg(nodes, edges);
    expect(svg).toContain('Fundamentals');
    expect(svg).toContain('Intermediate');
    expect(svg).toContain('Advanced');
  });

  it('includes edge paths', () => {
    const svg = buildSkillTreeSvg(nodes, edges);
    expect(svg).toContain('<path');
    expect(svg).toContain('marker-end');
  });

  it('returns null for empty nodes', () => {
    const svg = buildSkillTreeSvg([], []);
    expect(svg).toBeNull();
  });

  it('handles a single node with no edges', () => {
    const svg = buildSkillTreeSvg([{ id: 'x', label: 'Only Skill' }], []);
    expect(svg).toContain('Only Skill');
  });

  it('truncates long labels', () => {
    const longLabel = 'A'.repeat(40);
    const svg = buildSkillTreeSvg([{ id: 'x', label: longLabel }], []);
    expect(svg).toContain('…');
  });

  it('handles diamond dependency (two parents, one child)', () => {
    const diamondNodes = [
      { id: 'root', label: 'Root' },
      { id: 'left', label: 'Left' },
      { id: 'right', label: 'Right' },
      { id: 'merge', label: 'Merge' },
    ];
    const diamondEdges = [
      { from: 'root', to: 'left' },
      { from: 'root', to: 'right' },
      { from: 'left', to: 'merge' },
      { from: 'right', to: 'merge' },
    ];
    const svg = buildSkillTreeSvg(diamondNodes, diamondEdges);
    expect(svg).toContain('Merge');
    expect(svg).not.toBeNull();
  });
});

// ── Timeline SVG ───────────────────────────────────────────────────────────

describe('buildTimelineSvg', () => {
  const events = [
    { date: '1665', description: 'Newton discovers gravity', significance: 'Foundation of physics', cast: ['Newton'] },
    { date: '1687', description: 'Principia Mathematica published', significance: 'Classical mechanics formalised' },
    { date: '1905', description: 'Special Relativity', significance: 'Einstein\'s annus mirabilis', isPivotMoment: true },
  ];

  it('returns a valid SVG string', () => {
    const svg = buildTimelineSvg(events);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('includes event descriptions', () => {
    const svg = buildTimelineSvg(events);
    expect(svg).toContain('Newton discovers gravity');
    expect(svg).toContain('Principia Mathematica published');
    expect(svg).toContain('Special Relativity');
  });

  it('includes dates', () => {
    const svg = buildTimelineSvg(events);
    expect(svg).toContain('1665');
    expect(svg).toContain('1905');
  });

  it('uses different dot colour for pivot moments', () => {
    const svg = buildTimelineSvg(events);
    expect(svg).toContain('#c0392b');
  });

  it('includes significance text', () => {
    const svg = buildTimelineSvg(events);
    expect(svg).toContain('Foundation of physics');
  });

  it('renders the timeline spine line', () => {
    const svg = buildTimelineSvg(events);
    expect(svg).toContain('<line');
  });

  it('returns null for empty events', () => {
    const svg = buildTimelineSvg([]);
    expect(svg).toBeNull();
  });

  it('escapes HTML special chars in labels', () => {
    const evt = [{ date: '2020', description: 'Title with <brackets> & "quotes"' }];
    const svg = buildTimelineSvg(evt);
    expect(svg).toContain('&lt;brackets&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('<brackets>');
  });
});

// ── Objection index ────────────────────────────────────────────────────────

describe('buildObjectionIndex', () => {
  it('returns null when no objections', () => {
    const state = { nfStages: { 'dna-avatar': {} } };
    expect(buildObjectionIndex(state)).toBeNull();
  });

  it('builds markdown from objections array', () => {
    const state = {
      nfStages: {
        'dna-avatar': {
          objections: ['This is too hard', 'I have no time'],
        },
      },
    };
    const md = buildObjectionIndex(state);
    expect(md).toContain('Reader Objection Index');
    expect(md).toContain('This is too hard');
    expect(md).toContain('I have no time');
  });

  it('includes chapter cross-reference when map is present', () => {
    const state = {
      nfStages: {
        'dna-avatar': {
          objections: ['It will not work'],
        },
        'pa-chapters': {
          objectionChapterMap: { 'It will not work': 3 },
        },
      },
    };
    const md = buildObjectionIndex(state);
    expect(md).toContain('Chapter 3');
  });

  it('handles object-shaped objections', () => {
    const state = {
      nfStages: {
        'dna-avatar': {
          objections: [{ objection: 'Too expensive', id: 'obj-1' }],
        },
      },
    };
    const md = buildObjectionIndex(state);
    expect(md).toContain('Too expensive');
  });
});

// ── Reader transformation summary ─────────────────────────────────────────

describe('buildReaderTransformSummary', () => {
  it('returns null when no transform data', () => {
    const state = { nfStages: {} };
    expect(buildReaderTransformSummary(state)).toBeNull();
  });

  it('includes before and after states', () => {
    const state = {
      nfStages: {
        'dna-transform': {
          beforeState: 'Overwhelmed by debt',
          afterState: 'Financially free with a clear plan',
        },
      },
    };
    const md = buildReaderTransformSummary(state);
    expect(md).toContain('Overwhelmed by debt');
    expect(md).toContain('Financially free with a clear plan');
    expect(md).toContain('Before');
    expect(md).toContain('After');
  });

  it('handles only beforeState', () => {
    const state = {
      nfStages: { 'dna-transform': { beforeState: 'Confused about nutrition' } },
    };
    const md = buildReaderTransformSummary(state);
    expect(md).toContain('Confused about nutrition');
  });

  it('handles alternateField names (currentReality / promisedOutcome)', () => {
    const state = {
      nfStages: {
        'dna-transform': {
          currentReality: 'No coding skills',
          promisedOutcome: 'Builds own web apps',
        },
      },
    };
    const md = buildReaderTransformSummary(state);
    expect(md).toContain('No coding skills');
    expect(md).toContain('Builds own web apps');
  });
});

// ── NF extras — fiction skip ───────────────────────────────────────────────
// runNfExtras returns early before touching FS when state is not nonfiction.

describe('runNfExtras — skip logic', () => {
  it('skips entirely for fiction projects', async () => {
    const { runNfExtras } = await import('../lib/compile/nf-extras.js');
    const result = await runNfExtras({ mode: 'fiction' }, '/tmp/fake-project');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('not-nonfiction');
  });

  it('skips for null state', async () => {
    const { runNfExtras } = await import('../lib/compile/nf-extras.js');
    const result = await runNfExtras(null, '/tmp/fake-project');
    expect(result.skipped).toBe(true);
  });
});

// ── Skill tree SVG — level assignment ─────────────────────────────────────

describe('buildSkillTreeSvg — level assignment', () => {
  it('places root nodes at level 0 (leftmost column)', () => {
    const nodes = [{ id: 'root', label: 'Root' }, { id: 'child', label: 'Child' }];
    const edges = [{ from: 'root', to: 'child' }];
    const svg = buildSkillTreeSvg(nodes, edges);
    // Root node rectangle should appear before child rectangle in SVG
    const rootIdx = svg.indexOf('Root');
    const childIdx = svg.indexOf('Child');
    expect(rootIdx).toBeLessThan(childIdx);
  });

  it('handles nodes with no edges (standalone)', () => {
    const nodes = [
      { id: 'a', label: 'Skill A' },
      { id: 'b', label: 'Skill B' },
    ];
    const svg = buildSkillTreeSvg(nodes, []);
    expect(svg).toContain('Skill A');
    expect(svg).toContain('Skill B');
  });
});
