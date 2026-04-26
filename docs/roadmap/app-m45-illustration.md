# M4.5 — Cover & Illustration

## Goal

Writers generate a complete, print-ready wraparound book cover (front, spine,
and back) plus interior illustrations without leaving the app. The cover flows
automatically into the compile pipeline. No designer, no stock photo site,
no separate tool. KDP-upload-ready.

## Why this matters

A professional cover costs £200–600. A wraparound print cover (front + spine
+ back) from a designer costs £400–900. KDP self-publishers routinely ship
with bad covers because they cannot afford good ones.

Storyline generates a complete, publication-quality wraparound cover for under
£0.20 — pre-filled from the writer's own planning state and precisely sized
using their actual manuscript word count. The blurb is drafted from their
planning notes. The spine width is calculated to KDP's exact specification.

The moment a writer finishes planning and sees their book as a real, holdable
object — front cover, spine, back cover — for the first time is the emotional
high point of the product.

## Model

`openai/gpt-5.4-image-2` via OpenRouter.

- ~$0.028 per image (300-token prompt + ~1,700 output tokens at $8/$15 per 1M)
- At 10× markup → ~£0.22 per image
- 272K context window — full chapter synopsis can be included in the prompt
- Exceptional text rendering (title, author name, series tag, decorative text)
- Production-quality composition, atmosphere, and decorative detail
- `is_moderated: true` — suitable for all mainstream fiction; very dark or
  explicit content may be declined

**Resolution capability (confirmed from OpenAI docs):**
- Max edge: 3,840px
- Max total pixels: 8,294,400 (4K equivalent)
- Any custom size — both dimensions must be multiples of 16, aspect ratio ≤ 3:1
- Reliable output up to 2,560×1,440; 4K possible but variable

**Practical cover generation costs:**

| Output | Generations | API cost | At 10× markup |
|--------|------------|---------|---------------|
| Ebook cover (single generation) | 1 | ~$0.028 | ~£0.22 |
| Print wraparound (front + back, composited) | 2 | ~$0.056 | ~£0.44 |
| Realistic iteration budget (10–15 attempts) | 10–15 | ~$0.28–0.42 | ~£2.20–3.30 |

A £10 credit pack yields ~45 single images. A complete set of 20 chapter
headers plus both cover outputs costs the writer under £6.

## Deliverables

### Wraparound cover generator

The headline feature. Accessible from:
- A "Generate Cover" button in the CompilePanel
- Command palette: `Storyline: Generate Cover`

Produces a full wraparound — front cover + spine + back cover — KDP
print-ready. The ebook cover and the print front face are the **same file**,
generated once, used twice. There is no re-generation, no inconsistency.

#### Generation pipeline (2 API calls, 1 composite)

```
Call 1 — Front panel (print resolution, portrait)
  → assets/cover-front.jpg   (1,824 × 2,784px, 300dpi)
  → also saved as assets/cover.jpg  ← ebook cover (identical pixels)

Call 2 — Back panel (same model, front image passed as reference input)
  Prompt: "Back cover, atmospheric continuation of the attached front cover.
           Match the colour palette, texture, and lighting exactly."
  → assets/cover-back.jpg    (1,824 × 2,784px, 300dpi)

Composite (Node `sharp`)
  Spine strip: dominant colour sampled from front cover + rotated title/author text
  Order: back | spine | front  →  assets/cover-wraparound.jpg  (print, KDP upload)
```

The front panel is generated at print resolution and immediately becomes the
ebook cover — no re-generation, same pixels. The back is generated with the
approved front as a reference image input, so GPT Image 2 matches the palette,
texture, and atmosphere exactly. The spine is composited from a colour sampled
from the front — it is never AI-generated, giving the writer direct control
over the narrow text zone.

**Total: 2 API calls (~$0.056), 1 composite step, guaranteed consistency.**

#### Spine width calculation

Spine width is calculated from the manuscript word count (already tracked
in the status bar) using KDP's specification:

```
pageCount   = Math.ceil(wordCount / 275)   // ~275 words/page, 6×9, 11pt body
spineInches = paperType === 'cream'
            ? pageCount × 0.002347
            : pageCount × 0.0025            // white paper default
```

Example: 80,000-word novel → 291 pages → **0.73" spine** (white paper).
KDP minimum for spine text: 100 pages / ~0.25". Most novels clear this easily.

#### Cover dimensions and generation strategy

```
// Front panel — print resolution, portrait
frontPx = { w: 1824, h: 2784 }    // (6" + 0.125" bleed) × 300dpi, rounded to ×16
                                    // 5.07MP — well within 8.29MP limit
// → assets/cover-front.jpg   (print front)
// → assets/cover.jpg         (ebook — same file, same pixels)

// Back panel — front image passed as reference input to GPT Image 2
backPx  = { w: 1824, h: 2784 }    // same dimensions
// → assets/cover-back.jpg

// Spine strip — Node `sharp` (not AI-generated)
spinePx = { w: Math.round(spineInches * 300 / 16) * 16, h: 2784 }
// Dominant colour sampled from cover-front.jpg via sharp
// Title + author rendered in matching font, rotated 90°

// Composite
// back | spine | front → assets/cover-wraparound.jpg  (print, KDP upload)
```

#### What populates each zone (all pre-filled from planning state)

**Front cover**
- Title (from `state.title`) — large, dominant
- Author name (from `state.author`)
- Series + book number (from `state.series`) if applicable
- Cover art — atmospheric, genre-appropriate, driven by premise + style direction

**Spine**
- Title — rotated 90°, reading top-to-bottom (standard)
- Author name — below title
- Spine art — continuation of front cover atmosphere or solid field

**Back cover**
- Blurb — AI-generated from planning state using blurb best practice (see below),
  fully editable before it goes anywhere near the image
- Short author bio field (optional, blank by default, editable)
- Barcode zone — blank rectangle, bottom-right, standard KDP dimensions (2" × 1.2")
  — KDP adds the actual barcode; the zone must be left clear
- Back cover art — atmospheric, tonal extension of the front

#### Blurb generation

Writers are notoriously poor at writing their own blurbs — too close to the
book. The AI, having absorbed 14 planning stages, is uniquely positioned to
write a strong one automatically.

**Blurb best practice (encoded in the system prompt):**
- Hook — first line stops the scroll, genre-appropriate
- Introduce protagonist + world in one breath
- Establish the central conflict and what is at stake
- Tease the consequence of failure
- Close with a question or cliffhanger — never resolve it
- ~150–200 words, present tense, third person
- No spoilers, no plot summary, no "in this thrilling tale of…"

**Source data from `state.json`:**

| Field | Stage |
|-------|-------|
| `state.genre` | Stage 1 — Genre & Foundations |
| `state.premise` | Stage 2 — Story Seed |
| `state.protagonist.name`, `.want`, `.need`, `.wound` | Stage 3 — Protagonist Deep Dive |
| `state.logline` | Stage 6 — Logline Refinement |
| `state.beats.catalyst`, `.midpoint`, `.allIsLost` | Stage 7 — Beat Sheet |

**Implementation:** A single call to the `/chat` route (DeepSeek Flash — the
planning model, not the image model). Fast and cheap — costs under 1 credit.
The blurb appears in the cover panel pre-filled and editable. A "Regenerate
blurb" button requests another draft with a different angle. The writer edits
to taste before the image generation begins.

The blurb the writer approves is what goes into the back cover image prompt
verbatim — what they read is what prints.

#### Flow

1. Writer clicks "Generate Cover"
2. Cover panel opens:
   - Title, author, series (pre-filled from state)
   - Paper type selector (white / cream) — affects spine calculation
   - **Blurb field: AI-generated immediately on panel open, editable,
     "Regenerate" button for a fresh take**
   - Author bio (blank, optional)
   - Style direction (mood, palette, visual references — e.g. "dark Victorian
     engraving, navy and gold, cipher motifs")
3. Calculated spine width shown: "Spine: 0.73" (291 pages, white paper)"
4. Writer edits blurb and style direction, then hits Generate
5. **Call 1 — Front panel generates** (progress indicator, ~15–20s)
   Front cover preview shown. Writer can regenerate until satisfied.
6. Writer approves front → **Call 2 — Back panel generates** (front image
   sent as reference input, ~15–20s)
   Back cover preview shown alongside front. Writer can regenerate back
   independently without touching the approved front.
7. Composite runs automatically (spine sampled + rendered, panels joined)
8. Full wraparound preview shown — writer can zoom front / spine / back
9. "Use this cover":
   - `assets/cover-front.jpg` → also written as `assets/cover.jpg` (ebook, same pixels)
   - `assets/cover-back.jpg` saved
   - `assets/cover-wraparound.jpg` saved (print, KDP upload)
   - CompilePanel updates automatically

The writer approves the front before the back generates — they're never
waiting for both at once, and regenerating the back never changes the front.

#### Prompt construction

The extension builds both prompts — the writer never writes
"a book cover for a thriller called…". The AI already knows the book.

**Front cover prompt:**
```
Generate a professional book cover (front face only). Portrait orientation.
Size: 1824 × 2784px at 300dpi.

Title: "[TITLE]" — large, dominant, must be clearly legible
Author: "[AUTHOR]"
[Series: "[SERIES] Book N of N" if applicable]

Story: [logline from state]
Genre: [genre]
Style: [writer's style direction]

Requirements: publication-quality, suitable for Amazon KDP.
```

**Back cover prompt (front image attached as reference):**
```
Generate a book back cover that is an atmospheric continuation of the
attached front cover. Match its colour palette, texture, and lighting exactly.
Portrait orientation. Size: 1824 × 2784px at 300dpi.

Back cover text (render legibly in a clean serif font, upper portion):
"[blurb text]"
[Author bio if provided, smaller, below blurb]

Bottom-right: leave a clean blank rectangle 600 × 360px (barcode zone — must
be empty, KDP adds the barcode).

Style: continuation of front cover atmosphere — do not introduce new colours
or motifs.
```

### Interior illustration

Accessible from the editor toolbar and a dedicated "Illustrations" panel.

**Types of illustration:**

| Type | Description | Typical use |
|------|-------------|-------------|
| Chapter header | Atmospheric image at the top of each chapter | Fiction, non-fiction |
| Character portrait | Character likeness, can be referenced in subsequent generations | All genres |
| Map | World map, city plan, building layout | Fantasy, thriller, historical |
| Section ornament | Decorative divider between scenes | Literary fiction |
| Diagram / infographic | Explanatory visual | Non-fiction |

**Editor integration:**

A camera icon in the editor toolbar opens the illustration prompt panel.
Context is pre-filled from the current chapter's content and the chapter
card in `docs/chapters/`. Writer adds style direction, generates, approves.

Accepted illustrations save to `assets/illustrations/<chapter>-<slug>.jpg`
and are inserted as a block in the TipTap document at the cursor position.

**Illustrations panel:**

Accessible from the command palette (`Storyline: Illustrations`). Shows all
generated images in a grid, lets the writer manage, regenerate, or delete.
Images are ordered by chapter.

### Character consistency

When generating multiple images of the same character, the writer can upload
a reference image (their first approved portrait) alongside subsequent
prompts. GPT-5.4 Image 2's 272K context window supports rich character
descriptions drawn from `state.characters` to reinforce consistency even
without a reference image.

### Storage

```
assets/
├── cover.jpg              ← generated cover (or writer-supplied)
└── illustrations/
    ├── ch01-opening.jpg
    ├── ch02-market.jpg
    └── ...
```

All images stored locally in the project folder. Writer owns them.
They appear in VS Code's file tree naturally.

### Compile integration

EPUB and PDF compile pipelines pick up `assets/illustrations/` automatically.

- **Cover:** embedded as the EPUB cover image; PDF front page
- **Chapter headers:** inserted above the chapter heading in output
- **Inline illustrations:** positioned at the point of insertion in the prose
- **Section ornaments:** rendered as styled `<hr>` replacements in EPUB

No extra configuration needed — the compile pipeline reads `assets/` and
places images where the TipTap document indicates.

### Credit display

Each generation shows the estimated credit cost before the writer hits
Generate ("~40 credits"). Running total shown in the chat header badge as
with all AI calls.

## Technical tasks

- [ ] Add `POST /illustrate` route to Cloudflare Worker
  - Accepts: `{ licenceKey, prompt, width, height }` (pixel dimensions vary by spine)
  - Validates key + credit balance
  - Calls `openai/gpt-5.4-image-2` via OpenRouter with `modalities: ["image"]`
  - Returns base64 image data URL
  - Deducts credits on completion (same pattern as `/chat`)
- [ ] Implement spine width calculator: `wordCount → pageCount → spineInches → px dimensions`
- [ ] Implement blurb generator:
  - System prompt encoding blurb best practice (hook, stakes, tease, cliffhanger close,
    150–200 words, present tense, no spoilers)
  - Calls `/chat` route (DeepSeek Flash) on cover panel open — not the image model
  - Draws from `state.genre`, `state.premise`, `state.protagonist`, `state.logline`,
    `state.beats.catalyst`, `.midpoint`, `.allIsLost`
  - Result pre-fills blurb textarea, fully editable
  - "Regenerate blurb" button requests a fresh draft (different angle, same source data)
- [ ] Build cover generation panel webview:
  - Paper type selector (white / cream)
  - Calculated spine width display (live, updates on paper type change)
  - Editable blurb field (pre-filled)
  - Optional author bio field
  - Style direction field
  - Generate button with credit estimate
  - Full wraparound preview with zoom (front / spine / back)
  - Regenerate + "Use this cover" actions
- [ ] On cover approval: save `assets/cover-wraparound.jpg` (print) and crop `assets/cover.jpg` (EPUB front face)
- [ ] Build illustration prompt panel (context from current chapter, style input, generate, approve)
- [ ] Build illustrations grid panel (manage all generated images by chapter)
- [ ] Add "Generate Cover" button to CompilePanel
- [ ] Add camera icon to editor toolbar
- [ ] Register `Storyline: Generate Cover` and `Storyline: Illustrations` commands
- [ ] Implement full wraparound prompt builder from `state.json` + spine calc
- [ ] Auto-update CompilePanel cover field when `assets/cover.jpg` changes
- [ ] Implement character reference image upload for consistency
- [ ] Update EPUB compile to use `assets/cover.jpg` (front face) as cover image
- [ ] Update PDF compile to use `assets/cover-wraparound.jpg` as print cover
- [ ] Update PDF compile to position chapter header images above headings
- [ ] Show per-generation credit estimate in UI ("~40 credits")
- [ ] Extend `compile.config.json` with `paperType` and illustration positioning options

## Dependencies

M4 (editor in place for toolbar integration), M5 (compile pipeline — illustration
embedding depends on compile being implemented).

## Success criteria

- Writer completes 14-stage plan and generates a wraparound cover in under 3 minutes
- Spine width calculated correctly for white and cream paper against KDP spec
- `assets/cover-wraparound.jpg` is print-resolution and KDP-uploadable without modification
- `assets/cover.jpg` (front face crop) appears in CompilePanel automatically
- EPUB compiles with front cover and chapter headers correctly embedded
- Print PDF compiles with wraparound cover as front matter
- Generated cover is indistinguishable from a professionally designed cover
  at thumbnail size (Amazon browse grid) — validated by external review
- Barcode zone is a clean blank rectangle in the correct position on the back
- Blurb text renders legibly on the back cover
- Spine title is correctly rotated and legible at the calculated width
- Credit deduction correct on every generation
- Illustrations panel shows all generated images in correct chapter order
- Character portrait consistency maintained across two generations of the
  same character using the reference image flow
