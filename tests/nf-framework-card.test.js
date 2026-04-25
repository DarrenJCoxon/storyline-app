// NF-04 — Framework Card tests
// Schema, template, and skip logic tested without Puppeteer.
// Rendering (PDF/PNG) is integration-only (requires Chrome).

import { describe, it, expect } from 'vitest';

import {
  validateFramework,
  hasFramework,
  extractFramework,
  PLACEHOLDER_FRAMEWORK,
  FRAMEWORK_CARD_SCHEMA_VERSION,
} from '../lib/compile/framework-card/schema.js';

import { buildFrameworkCardHtml } from '../lib/compile/framework-card/template.js';

// ── Schema ────────────────────────────────────────────────────────────────────

describe('validateFramework', () => {
  it('returns no errors for PLACEHOLDER_FRAMEWORK', () => {
    expect(validateFramework(PLACEHOLDER_FRAMEWORK)).toHaveLength(0);
  });

  it('requires modelName', () => {
    const fw = { ...PLACEHOLDER_FRAMEWORK, modelName: '' };
    expect(validateFramework(fw).some(e => /modelName/i.test(e))).toBe(true);
  });

  it('requires title', () => {
    const fw = { ...PLACEHOLDER_FRAMEWORK, title: '' };
    expect(validateFramework(fw).some(e => /title/i.test(e))).toBe(true);
  });

  it('requires author', () => {
    const fw = { ...PLACEHOLDER_FRAMEWORK, author: '' };
    expect(validateFramework(fw).some(e => /author/i.test(e))).toBe(true);
  });

  it('requires principles to be non-empty array', () => {
    expect(validateFramework({ ...PLACEHOLDER_FRAMEWORK, principles: [] }).some(e => /principles/i.test(e))).toBe(true);
    expect(validateFramework({ ...PLACEHOLDER_FRAMEWORK, principles: 'not array' }).some(e => /principles/i.test(e))).toBe(true);
  });

  it('flags principles with missing name', () => {
    const fw = { ...PLACEHOLDER_FRAMEWORK, principles: [{ number: 1 }] };
    expect(validateFramework(fw).some(e => /Principle 1 missing name/i.test(e))).toBe(true);
  });

  it('returns error for null input', () => {
    expect(validateFramework(null)).not.toHaveLength(0);
  });
});

describe('hasFramework', () => {
  it('returns false for fiction state', () => {
    expect(hasFramework({ mode: 'fiction', pipeline: 'novel', nfStages: {} })).toBe(false);
  });

  it('returns false for Pipeline B NF', () => {
    expect(hasFramework({ mode: 'nonfiction', pipeline: 'B', nfStages: {} })).toBe(false);
  });

  it('returns false for Pipeline A with no pa-framework', () => {
    expect(hasFramework({ mode: 'nonfiction', pipeline: 'A', nfStages: {} })).toBe(false);
  });

  it('returns false for Pipeline A with invalid framework', () => {
    const state = {
      mode: 'nonfiction',
      pipeline: 'A',
      nfStages: { 'pa-framework': { modelName: '', principles: [] } },
    };
    expect(hasFramework(state)).toBe(false);
  });

  it('returns true for Pipeline A with valid framework', () => {
    const state = {
      mode: 'nonfiction',
      pipeline: 'A',
      nfStages: {
        'pa-framework': {
          title: 'The Method',
          modelName: '4 Laws',
          author: 'Jane Smith',
          principles: [{ number: 1, name: 'Law One' }],
        },
      },
    };
    expect(hasFramework(state)).toBe(true);
  });
});

describe('extractFramework', () => {
  it('returns null for null state', () => {
    expect(extractFramework(null)).toBeNull();
  });

  it('returns null when pa-framework has no modelName', () => {
    expect(extractFramework({ nfStages: { 'pa-framework': { title: 'X' } } })).toBeNull();
  });

  it('pulls title from dna-title when not set on framework', () => {
    const state = {
      nfStages: {
        'pa-framework': {
          modelName: '4 Laws',
          author: 'Jane',
          principles: [{ number: 1, name: 'Law One' }],
        },
        'dna-title': { workingTitle: 'The Clarity Method' },
      },
    };
    const fw = extractFramework(state);
    expect(fw.title).toBe('The Clarity Method');
  });

  it('uses coverAccent from framework when present', () => {
    const state = {
      nfStages: {
        'pa-framework': {
          title: 'T', modelName: 'M', author: 'A',
          principles: [{ number: 1, name: 'P' }],
          coverAccent: '#ff0000',
        },
      },
    };
    expect(extractFramework(state).coverAccent).toBe('#ff0000');
  });

  it('defaults coverAccent to #1e3a5f', () => {
    const state = {
      nfStages: {
        'pa-framework': {
          title: 'T', modelName: 'M', author: 'A',
          principles: [{ number: 1, name: 'P' }],
        },
      },
    };
    expect(extractFramework(state).coverAccent).toBe('#1e3a5f');
  });
});

// ── Template ──────────────────────────────────────────────────────────────────

describe('buildFrameworkCardHtml', () => {
  it('produces valid HTML string', () => {
    const html = buildFrameworkCardHtml(PLACEHOLDER_FRAMEWORK);
    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes book title', () => {
    const html = buildFrameworkCardHtml(PLACEHOLDER_FRAMEWORK);
    expect(html).toContain(PLACEHOLDER_FRAMEWORK.title);
  });

  it('includes model name', () => {
    const html = buildFrameworkCardHtml(PLACEHOLDER_FRAMEWORK);
    expect(html).toContain(PLACEHOLDER_FRAMEWORK.modelName);
  });

  it('includes all principle names', () => {
    const html = buildFrameworkCardHtml(PLACEHOLDER_FRAMEWORK);
    for (const p of PLACEHOLDER_FRAMEWORK.principles) {
      expect(html).toContain(p.name);
    }
  });

  it('includes author', () => {
    const html = buildFrameworkCardHtml(PLACEHOLDER_FRAMEWORK);
    expect(html).toContain(PLACEHOLDER_FRAMEWORK.author);
  });

  it('applies coverAccent in CSS', () => {
    const html = buildFrameworkCardHtml({ ...PLACEHOLDER_FRAMEWORK, coverAccent: '#abcdef' });
    expect(html).toContain('#abcdef');
  });

  it('uses grid layout for 4 principles', () => {
    const html = buildFrameworkCardHtml(PLACEHOLDER_FRAMEWORK); // 4 principles
    expect(html).toContain('class="principles-grid"');
    expect(html).not.toContain('class="principles-list"');
  });

  it('uses list layout for 6 principles', () => {
    const fw = {
      ...PLACEHOLDER_FRAMEWORK,
      principles: [1,2,3,4,5,6].map(n => ({ number: n, name: `Law ${n}` })),
    };
    const html = buildFrameworkCardHtml(fw);
    expect(html).toContain('class="principles-list"');
    expect(html).not.toContain('class="principles-grid"');
  });

  it('uses 2-column list for 8+ principles', () => {
    const fw = {
      ...PLACEHOLDER_FRAMEWORK,
      principles: [1,2,3,4,5,6,7,8].map(n => ({ number: n, name: `Law ${n}` })),
    };
    const html = buildFrameworkCardHtml(fw);
    expect(html).toContain('column-count: 2');
  });

  it('escapes HTML in title to prevent XSS', () => {
    const fw = { ...PLACEHOLDER_FRAMEWORK, title: '<script>alert(1)</script>' };
    const html = buildFrameworkCardHtml(fw);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders without subtitle element when absent', () => {
    const fw = { ...PLACEHOLDER_FRAMEWORK, subtitle: '' };
    const html = buildFrameworkCardHtml(fw);
    expect(html).not.toContain('class="book-subtitle"');
  });

  it('includes subtitle when present', () => {
    const html = buildFrameworkCardHtml(PLACEHOLDER_FRAMEWORK);
    expect(html).toContain(PLACEHOLDER_FRAMEWORK.subtitle);
  });

  it('FRAMEWORK_CARD_SCHEMA_VERSION is 1', () => {
    expect(FRAMEWORK_CARD_SCHEMA_VERSION).toBe(1);
  });
});
