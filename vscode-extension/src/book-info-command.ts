import * as vscode from 'vscode';
import { resolve } from 'path';

// "Storyline: Edit Book Info" — opens a simple form webview where the
// writer can edit their book's metadata (title, author, publisher, ISBN,
// genre, theme, paragraph style). Writes to compile.config.json on save.
// No JSON editing, no terminal, no VS Code settings dive.
//
// This is deliberately a plain-HTML webview (no React bundle) because
// it's just a form — a whole framework would be overkill and adds bundle
// weight the user doesn't need for this surface.

interface BookConfig {
  metadata: {
    title: string;
    subtitle: string | null;
    author: string | null;
    publisher: string;
    language: string;
    identifier: string | null;
    isbn: string | null;
    description: string | null;
    genre: string | null;
    subGenre: string | null;
  };
  theme: string;
  paragraphStyle: 'indented' | 'block';
}

export async function editBookInfo(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Storyline: open a novel project folder first.');
    return;
  }

  const stateFile = vscode.Uri.joinPath(folder.uri, '.storyline', 'state.json');
  try {
    await vscode.workspace.fs.stat(stateFile);
  } catch {
    vscode.window.showErrorMessage(
      'Storyline: no .storyline/state.json found. Run `storyline init` first.',
    );
    return;
  }

  const configPath = vscode.Uri.joinPath(folder.uri, 'compile.config.json');
  const config = await loadOrDefaultConfig(configPath);

  const panel = vscode.window.createWebviewPanel(
    'storyline.bookInfo',
    'Book Info',
    // Beside the active editor — VS Code handles column placement.
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  panel.webview.html = buildFormHtml(config);

  panel.webview.onDidReceiveMessage(async (msg: { type: string; data?: BookConfig }) => {
    if (msg.type === 'save' && msg.data) {
      try {
        const pretty = JSON.stringify(msg.data, null, 2) + '\n';
        await vscode.workspace.fs.writeFile(configPath, new TextEncoder().encode(pretty));
        vscode.window.setStatusBarMessage('Book info saved', 3000);
        panel.dispose();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Storyline: failed to save book info — ${message}`);
      }
    } else if (msg.type === 'cancel') {
      panel.dispose();
    }
  });
}

async function loadOrDefaultConfig(configPath: vscode.Uri): Promise<BookConfig> {
  try {
    const buf = await vscode.workspace.fs.readFile(configPath);
    const parsed = JSON.parse(new TextDecoder().decode(buf));
    return normaliseConfig(parsed);
  } catch {
    return normaliseConfig({});
  }
}

function normaliseConfig(raw: unknown): BookConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  const strOr = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.trim() ? v : fallback;
  return {
    metadata: {
      title: strOr(m.title, ''),
      subtitle: str(m.subtitle),
      author: str(m.author),
      publisher: strOr(m.publisher, 'Independent'),
      language: strOr(m.language, 'en'),
      identifier: str(m.identifier),
      isbn: str(m.isbn),
      description: str(m.description),
      genre: str(m.genre),
      subGenre: str(m.subGenre),
    },
    theme: strOr(r.theme, 'classic-serif'),
    paragraphStyle: r.paragraphStyle === 'block' ? 'block' : 'indented',
  };
}

// Escape values that go into HTML attributes (form field defaults)
function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFormHtml(config: BookConfig): string {
  const m = config.metadata;
  const genres = [
    '', 'Thriller', 'Mystery', 'Romance', 'Fantasy', 'Sci-Fi',
    'Horror', 'Literary Fiction', 'YA', 'Middle Grade',
  ];
  const languages = [
    ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
    ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ja', 'Japanese'],
  ];

  const genreOptions = genres
    .map(g => `<option value="${esc(g)}"${g === (m.genre || '') ? ' selected' : ''}>${esc(g || '— select —')}</option>`)
    .join('');
  const languageOptions = languages
    .map(([code, name]) => `<option value="${esc(code)}"${code === m.language ? ' selected' : ''}>${esc(name)}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Book Info</title>
<style>
  :root {
    color-scheme: light dark;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 32px 80px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    max-width: 680px;
    margin-left: auto;
    margin-right: auto;
  }
  h1 {
    font-size: 1.5em;
    margin: 0 0 4px 0;
  }
  p.lede {
    color: var(--vscode-descriptionForeground);
    margin: 0 0 32px 0;
    font-size: 0.95em;
  }
  section {
    margin-bottom: 28px;
  }
  section > h2 {
    font-size: 0.85em;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 12px 0;
    font-weight: 600;
  }
  .field {
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field label {
    font-size: 0.9em;
    font-weight: 500;
  }
  .field .hint {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
  }
  .row-two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  input[type="text"], select, textarea {
    width: 100%;
    padding: 8px 10px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
    border-radius: 3px;
    font-family: inherit;
    font-size: 0.95em;
  }
  input[type="text"]:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }
  textarea {
    min-height: 80px;
    resize: vertical;
  }
  .radio-group {
    display: flex;
    gap: 16px;
    padding: 4px 0;
  }
  .radio-group label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: normal;
    cursor: pointer;
  }
  .actions {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 12px 32px;
    background: var(--vscode-editor-background);
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button {
    padding: 6px 16px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.95em;
    border: 1px solid transparent;
  }
  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  button.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  button.secondary {
    background: transparent;
    color: var(--vscode-editor-foreground);
    border-color: var(--vscode-widget-border, rgba(128,128,128,0.3));
  }
  button.secondary:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15));
  }
</style>
</head>
<body>
<h1>Book Info</h1>
<p class="lede">These details appear on the title page and in the EPUB metadata readers see in their library apps. You can change any of them later — compiled books will reflect the current values.</p>

<form id="book-form">
  <section>
    <h2>Book</h2>
    <div class="field">
      <label for="title">Title <span class="hint">— required</span></label>
      <input type="text" id="title" value="${esc(m.title)}" required>
    </div>
    <div class="field">
      <label for="subtitle">Subtitle <span class="hint">— optional</span></label>
      <input type="text" id="subtitle" value="${esc(m.subtitle)}">
    </div>
    <div class="field">
      <label for="author">Author</label>
      <input type="text" id="author" value="${esc(m.author)}">
    </div>
    <div class="field">
      <label for="description">Description / blurb <span class="hint">— appears in reader library info</span></label>
      <textarea id="description">${esc(m.description)}</textarea>
    </div>
  </section>

  <section>
    <h2>Publishing</h2>
    <div class="row-two">
      <div class="field">
        <label for="publisher">Publisher</label>
        <input type="text" id="publisher" value="${esc(m.publisher)}">
      </div>
      <div class="field">
        <label for="language">Language</label>
        <select id="language">${languageOptions}</select>
      </div>
    </div>
    <div class="row-two">
      <div class="field">
        <label for="isbn">ISBN <span class="hint">— optional for KDP, required for IngramSpark</span></label>
        <input type="text" id="isbn" value="${esc(m.isbn)}" placeholder="978-1-234567-89-0">
      </div>
      <div class="field">
        <label for="identifier">EPUB identifier <span class="hint">— leave blank to auto-generate</span></label>
        <input type="text" id="identifier" value="${esc(m.identifier)}" placeholder="urn:uuid:…">
      </div>
    </div>
  </section>

  <section>
    <h2>Book Structure</h2>
    <div class="row-two">
      <div class="field">
        <label for="genre">Genre <span class="hint">— used for word-count checks</span></label>
        <select id="genre">${genreOptions}</select>
      </div>
      <div class="field">
        <label for="subGenre">Sub-genre <span class="hint">— free text</span></label>
        <input type="text" id="subGenre" value="${esc(m.subGenre)}" placeholder="Psychological, cozy, etc.">
      </div>
    </div>
  </section>

  <section>
    <h2>Style</h2>
    <div class="field">
      <label>Paragraph style</label>
      <div class="radio-group">
        <label><input type="radio" name="paragraphStyle" value="indented"${config.paragraphStyle === 'indented' ? ' checked' : ''}> Indented (first-line indent, no gap — traditional novel)</label>
      </div>
      <div class="radio-group">
        <label><input type="radio" name="paragraphStyle" value="block"${config.paragraphStyle === 'block' ? ' checked' : ''}> Block (vertical gap between paragraphs)</label>
      </div>
    </div>
    <div class="field">
      <label for="theme">Theme</label>
      <select id="theme">
        <option value="classic-serif"${config.theme === 'classic-serif' ? ' selected' : ''}>Classic Serif</option>
      </select>
      <span class="hint">More themes coming in Milestone 6</span>
    </div>
  </section>
</form>

<div class="actions">
  <button class="secondary" id="cancel">Cancel</button>
  <button class="primary" id="save">Save</button>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const valOrNull = (id) => {
    const v = document.getElementById(id).value.trim();
    return v === '' ? null : v;
  };
  const valOrEmpty = (id) => document.getElementById(id).value.trim();

  document.getElementById('save').addEventListener('click', () => {
    const title = valOrEmpty('title');
    if (!title) {
      document.getElementById('title').focus();
      return;
    }
    const paragraphStyle = document.querySelector('input[name="paragraphStyle"]:checked')?.value || 'indented';
    vscode.postMessage({
      type: 'save',
      data: {
        metadata: {
          title,
          subtitle: valOrNull('subtitle'),
          author: valOrNull('author'),
          publisher: valOrEmpty('publisher') || 'Independent',
          language: valOrEmpty('language') || 'en',
          identifier: valOrNull('identifier'),
          isbn: valOrNull('isbn'),
          description: valOrNull('description'),
          genre: valOrNull('genre'),
          subGenre: valOrNull('subGenre'),
        },
        theme: valOrEmpty('theme') || 'classic-serif',
        paragraphStyle,
      },
    });
  });

  document.getElementById('cancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });
</script>
</body>
</html>`;
}
