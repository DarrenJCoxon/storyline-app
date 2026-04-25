# M5 — Compile Pipeline

## Goal

Writers can compile their manuscript to EPUB and print-ready PDF from within
the app. No command line, no external tools, no configuration file to hand-edit.

## Deliverables

### CompilePanel webview

A modal-style panel (or sidebar panel) with:
- Book metadata form: title, author, cover image (file picker)
- Format selection: EPUB / Print PDF
- Chapter ordering (drag to reorder if needed, defaults to filename order)
- "Compile" button
- Progress indicator during compile
- "Open output" link when complete

On first open, pre-fills from `compile.config.json` if it exists. Saves back
on each compile.

### EPUB output

Ported from `storyline-vsc` — uses `@lesjoursfr/html-to-epub`.

Pipeline:
1. Read all `.md` files in `manuscript/` in filename order
2. Convert markdown to HTML via `markdown-it`
3. Apply chapter breaks, scene break rendering (`* * *` → `<hr class="scene-break">`)
4. Inject cover image if provided
5. Write `output/<title>-<date>.epub`

Themes ported from `storyline-vsc` (Heritage, Modern Sans, default).

### Print PDF output

Ported from `storyline-vsc` — uses Puppeteer (bundled).

Pipeline:
1. Same markdown → HTML conversion as EPUB
2. Apply print CSS (page margins, running heads, page numbers, orphan/widow control)
3. Render via Puppeteer headless
4. Write `output/<title>-<date>.pdf`

Print spec: A5 (standard trade paperback), 12pt body, appropriate margins.
US Letter variant available via config.

### Compile configuration

`compile.config.json` in project root. Created by the CompilePanel on first
compile, editable directly if needed.

```json
{
  "metadata": {
    "title": "My Novel",
    "author": "Jane Smith",
    "language": "en",
    "coverImage": "assets/cover.jpg"
  },
  "epub": {
    "theme": "heritage"
  },
  "pdf": {
    "pageSize": "A5",
    "theme": "heritage"
  },
  "manuscript": {
    "path": "manuscript",
    "chapterPattern": "chapter-*.md"
  }
}
```

### Commands

- `Storyline: Compile to EPUB` — opens CompilePanel pre-set to EPUB
- `Storyline: Compile to PDF` — opens CompilePanel pre-set to PDF
- `Storyline: Open Output Folder` — reveals `output/` in Finder/Explorer

## Technical tasks

- [ ] Port compile pipeline from `storyline-vsc` (markdown-it, EPUB, PDF)
- [ ] Port all themes (Heritage, Modern Sans)
- [ ] Build CompilePanel webview (metadata form, format selector, progress)
- [ ] Implement `compile.config.json` read/write
- [ ] Wire EPUB compile command
- [ ] Wire PDF compile command
- [ ] Test EPUB output in Apple Books and Kindle Previewer
- [ ] Test PDF output (margins, page numbers, scene breaks)
- [ ] Implement chapter ordering UI (drag handles, defaults to filename order)
- [ ] Implement cover image file picker
- [ ] Register compile commands in `package.json`

## Dependencies

M4 (editor and layout in place, manuscript files exist to compile).

## Success criteria

- EPUB opens correctly in Apple Books — cover image, chapter breaks, correct
  font rendering
- EPUB passes Kindle Previewer validation
- PDF renders correctly at A5 — page numbers, running heads, scene breaks
- 100K word manuscript compiles to EPUB in under 20 seconds
- 100K word manuscript compiles to PDF in under 45 seconds
- `compile.config.json` persists author/title across VS Code restarts
