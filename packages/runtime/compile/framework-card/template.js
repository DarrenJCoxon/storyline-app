// Framework Card HTML/CSS template
// Produces a self-contained single-page HTML document.
// Letter size (8.5in × 11in) for print; screenshot at 2× gives ~1632×2112px.

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Darken a hex color by a percentage for the model banner
function darkenHex(hex, pct = 0.15) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const d = 1 - pct;
  const toHex = n => Math.round(Math.max(0, n * d)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function buildPrinciplesGrid(principles) {
  const count = principles.length;

  if (count <= 4) {
    // 2×2 grid (or 1×1, 1×2, 2×1 for fewer)
    const cols = count <= 2 ? count : 2;
    const rows = Math.ceil(count / cols);
    const cells = principles.map(p => `
      <div class="principle-cell">
        <div class="principle-number">${escHtml(String(p.number || ''))}</div>
        <div class="principle-name">${escHtml(p.name || '')}</div>
        ${p.description ? `<div class="principle-desc">${escHtml(p.description)}</div>` : ''}
      </div>`).join('');

    return `<div class="principles-grid" style="grid-template-columns: repeat(${cols}, 1fr);">${cells}</div>`;
  }

  // List layout for 5+ principles
  const items = principles.map(p => `
    <div class="principle-list-item">
      <span class="principle-number-inline">${escHtml(String(p.number || ''))}</span>
      <div class="principle-list-content">
        <div class="principle-name">${escHtml(p.name || '')}</div>
        ${p.description ? `<div class="principle-desc">${escHtml(p.description)}</div>` : ''}
      </div>
    </div>`).join('');

  const cols = count >= 8 ? 2 : 1;
  return `<div class="principles-list" style="column-count: ${cols};">${items}</div>`;
}

export function buildFrameworkCardHtml(framework) {
  const accent = framework.coverAccent || '#1e3a5f';
  const bannerBg = darkenHex(accent, 0.2);
  const principles = Array.isArray(framework.principles) ? framework.principles : [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(framework.title)} — Framework Card</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    width: 8.5in;
    height: 11in;
    font-family: 'Georgia', 'Times New Roman', serif;
    background: #fff;
    color: #1a1a1a;
  }

  .page {
    width: 8.5in;
    height: 11in;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ─────────────────────────────────────────────── */
  .header {
    background: ${escHtml(accent)};
    color: #fff;
    padding: 1.6rem 2.4rem 1.4rem;
    flex-shrink: 0;
  }

  .header-label {
    font-size: 0.62rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    opacity: 0.7;
    margin-bottom: 0.4rem;
    font-family: 'Arial', sans-serif;
  }

  .book-title {
    font-size: 1.55rem;
    font-weight: bold;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }

  .book-subtitle {
    font-size: 0.95rem;
    margin-top: 0.35rem;
    opacity: 0.82;
    font-style: italic;
    line-height: 1.35;
  }

  /* ── Model Banner ───────────────────────────────────────── */
  .model-banner {
    background: ${escHtml(bannerBg)};
    color: #fff;
    padding: 1rem 2.4rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .model-label {
    font-size: 0.58rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.7;
    font-family: 'Arial', sans-serif;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .model-name {
    font-size: 1.25rem;
    font-weight: bold;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  /* ── Principles ─────────────────────────────────────────── */
  .principles-container {
    flex: 1;
    padding: 1.6rem 2.4rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }

  /* Grid layout (≤4 principles) */
  .principles-grid {
    display: grid;
    gap: 1rem;
    height: 100%;
  }

  .principle-cell {
    background: #f7f8fa;
    border-left: 4px solid ${escHtml(accent)};
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }

  /* List layout (5+ principles) */
  .principles-list {
    column-gap: 1.5rem;
  }

  .principle-list-item {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.9rem;
    break-inside: avoid;
    align-items: flex-start;
  }

  .principle-number-inline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.6rem;
    height: 1.6rem;
    background: ${escHtml(accent)};
    color: #fff;
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: bold;
    font-family: 'Arial', sans-serif;
    flex-shrink: 0;
    margin-top: 0.1rem;
  }

  .principle-list-content { flex: 1; }

  /* Shared principle elements */
  .principle-number {
    font-size: 2rem;
    font-weight: bold;
    color: ${escHtml(accent)};
    line-height: 1;
    margin-bottom: 0.3rem;
    font-family: 'Arial', sans-serif;
  }

  .principle-name {
    font-size: 0.95rem;
    font-weight: bold;
    line-height: 1.3;
    color: #1a1a1a;
  }

  .principle-desc {
    font-size: 0.78rem;
    color: #555;
    margin-top: 0.3rem;
    line-height: 1.45;
    font-style: italic;
  }

  /* ── Footer ─────────────────────────────────────────────── */
  .footer {
    flex-shrink: 0;
    padding: 0.9rem 2.4rem;
    border-top: 2px solid ${escHtml(accent)};
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .footer-author {
    font-size: 0.82rem;
    color: #555;
    font-style: italic;
  }

  .footer-label {
    font-size: 0.58rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #aaa;
    font-family: 'Arial', sans-serif;
  }

  @media print {
    html, body { width: 8.5in; height: 11in; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-label">Framework Card</div>
    <div class="book-title">${escHtml(framework.title)}</div>
    ${framework.subtitle ? `<div class="book-subtitle">${escHtml(framework.subtitle)}</div>` : ''}
  </div>

  <div class="model-banner">
    <span class="model-label">The Framework</span>
    <span class="model-name">${escHtml(framework.modelName)}</span>
  </div>

  <div class="principles-container">
    ${buildPrinciplesGrid(principles)}
  </div>

  <div class="footer">
    <span class="footer-author">${escHtml(framework.author)}</span>
    <span class="footer-label">storyline</span>
  </div>
</div>
</body>
</html>`;
}
