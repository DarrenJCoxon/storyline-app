// Serves the Storyline Terms of Service and Privacy Policy as HTML pages.
//
// The canonical text lives in docs/TERMS.md and docs/PRIVACY.md in the
// repository. To avoid build-time markdown processing inside the Worker, the
// content is embedded here as a string constant. When you update the markdown
// source, regenerate the constants below by re-running the conversion (see
// the comment at the bottom of this file).

import { TERMS_HTML, PRIVACY_HTML } from './legal-content.js'

const PAGE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    background: #fafafa;
    margin: 0;
    padding: 48px 24px;
  }
  main {
    max-width: 720px;
    margin: 0 auto;
    background: #fff;
    padding: 48px 56px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  h1 { font-size: 28px; margin-top: 0; }
  h2 { font-size: 20px; margin-top: 32px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
  h3 { font-size: 16px; margin-top: 24px; }
  a { color: #c47b00; }
  p, li { font-size: 15px; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  table { border-collapse: collapse; margin: 16px 0; width: 100%; }
  th, td { border: 1px solid #e5e5e5; padding: 8px 12px; text-align: left; font-size: 14px; }
  th { background: #f7f7f7; }
  footer { text-align: center; color: #888; font-size: 13px; margin-top: 32px; }
  @media (max-width: 600px) {
    main { padding: 24px 20px; }
    body { padding: 20px 0; }
  }
`

function page(title: string, body: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Storyline</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>${body}</main>
<footer>Storyline · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>
</body>
</html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export function handleTerms(): Response {
  return page('Terms of Service', TERMS_HTML)
}

export function handlePrivacy(): Response {
  return page('Privacy Policy', PRIVACY_HTML)
}
