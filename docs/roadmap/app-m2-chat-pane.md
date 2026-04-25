# M2 — Chat Pane

## Goal

The core planning conversation works end-to-end in the VS Code extension.
No Claude Code, no terminal, no skill system. The writer opens the chat pane,
the AI introduces the current stage, they talk, they save to local state.

## Storage

All saves write to local `.storyline/state.json` — no remote calls on save.
The AI provider call is the only network request in the conversation loop.

## Deliverables

### ChatPanel webview

Registered in VS Code's secondary sidebar (right side). Contains:

```
┌────────────────────────────────────┐
│  storyline          847 credits ☀🌙💻│  ← header: wordmark, credits, theme
├────────────────────────────────────┤
│  PLANNING STAGES            ▾      │  ← collapsible rail header
│  ✓ Genre & Foundations             │
│  ✓ Premise                         │
│  ◉ Supporting Cast  ← active       │
│  ○ Relationship Web                │
│  ○ ...                             │
├────────────────────────────────────┤
│  Chat thread               ↕ scroll│
│                                    │
│  [AI free-flowing response]        │
│                                    │
│        ╭────────────────────────╮  │
│        │ User bubble — indented │  │
│        ╰────────────────────────╯  │
│                                    │
│  [AI continues...]                 │
│                                    │
├────────────────────────────────────┤
│  [darker footer bg]                │
│  ┌──────────────────────────────┐  │  ← input with amber focus ring
│  │  Reply to Storyline…     ➤  │  │
│  └──────────────────────────────┘  │
│        ⌘↵ to send · Enter for line │
└────────────────────────────────────┘
```

**Header** (always visible, does not scroll):
- Left: "storyline" wordmark — `story` in body colour, `line` in amber
- Right: credit badge + theme toggle pill (☀️ / 🌙 / 💻)

### Conversation loop

```
1. Extension loads ChatPanel
2. Build system prompt:
     - Stage guide for current stage (from @storyline/core)
     - Current state snapshot (serialised relevant fields only)
     - Any story traps active from prior stages
3. If first message in stage: AI sends opening prompt automatically
4. Writer types → message appended to turn history → AI streams response
5. Writer types "save" or clicks Save button:
     - AI confirms stage data in structured JSON block
     - Extension parses JSON, merges into .storyline/state.json (local write)
     - Stage complete card shown in chat
     - writeAllChapterCards() runs if chapterOutline updated (local write)
     - Stage rail updates
     - Next stage's AI opening prompt fires
```

Turn history is kept per-stage in memory for the session. Completed stages
are collapsed in the rail but their history is retained and readable.

### Message components

**User bubble**
Rounded, `#E8E3D8` (light) / `#2A2A2A` (dark), right-aligned, no avatar.

**AI response**
Free-flowing, left-aligned, no background, no bubble. Inter, `15px`, generous
line-height (`1.7`). Feels like reading an editor's notes, not a chatbot.

**Structured response cards** (rendered from AI output when applicable)

- *Option card* — selectable choice (e.g. "Choose your genre variant").
  Horizontal card, accent border on hover, checkmark on select.
- *Beat card* — a suggested story beat with title + one-line description.
  Expandable on click.
- *Critique badge* — `error` (red), `warning` (amber), `suggestion` (grey).
  Each expandable with fix protocol.
- *Stage complete card* — full-width, amber accent, stage name + summary of
  what was saved. Appears before the next stage opens.

**Save receipt** (shown inline after each save)
Compact — stage name, local file path written. No network call on save.

### Stage progress rail

Collapsible panel at the top of the chat pane. Collapsed by default once
the writer is mid-project — gives maximum room to the conversation.

**Header row** (always visible):
- "Planning stages" label (small caps)
- When collapsed: active stage shown inline — e.g. `4 · Supporting Cast`
- Chevron rotates 90° when collapsed
- Click anywhere on the header to toggle

**Expanded list** — each stage shows:
- State indicator: `○` not started · `◉` active (amber fill) · `●` complete (amber tick)
- Stage name
- Active stage: amber left border + subtle amber background tint
- Smooth CSS `max-height` transition on open/close

Clicking a completed stage in the expanded list collapses/expands its
chat history in the thread below. Collapse state stored in `globalState`.

### Input box

- Multiline textarea, grows up to 4 lines before scrolling
- No border at rest
- Subtle drop shadow on focus (`box-shadow: 0 0 0 2px rgba(201,168,76,0.15)`)
- `⌘↵` / `Ctrl↵` to send (not Enter alone — writers use Enter for newlines)
- Small send button (arrow icon) appears on the right when text is present

### Streaming

AI response streams token by token. A blinking cursor (`|`) follows the
last character while streaming. On completion the cursor disappears.
Content appended to a pre-rendered container, not re-rendered per token.

## Design tokens

```css
/* ── Dark mode ───────────────────────────────── */
--chat-bg-dark:        #1A1A1A;
--chat-rail-bg-dark:   #141414;
--chat-foot-bg-dark:   #111111;
--text-dark:           #E8E6E1;
--text-muted-dark:     #787573;
--bubble-dark:         #252525;

/* ── Light mode — Moleskine paper ───────────── */
--chat-bg-light:       #F2F1EF;
--chat-rail-bg-light:  #E9E8E5;
--chat-foot-bg-light:  #E2E1DE;
--text-light:          #1E1C1A;
--text-muted-light:    #6B6865;
--bubble-light:        #E6E4E0;

/* ── Shared ──────────────────────────────────── */
--accent-dark:         #C9A84C;
--accent-light:        #B8922A;
--accent-glow:         rgba(201, 168, 76, 0.20);
--accent-sub:          rgba(201, 168, 76, 0.11);
--font-ui:             'Inter', system-ui, sans-serif;
--font-serif:          'Lora', Georgia, 'Times New Roman', serif;
--font-sans:           'Inter', system-ui, sans-serif;
--font-size-body:      13.5px;
--line-height:         1.75;
--radius-bubble:       16px 16px 3px 16px;
--radius-card:         10px;
--col-sep-dark:        rgba(255, 255, 255, 0.08);
--col-sep-light:       rgba(0, 0, 0, 0.09);
```

## Technical tasks

- [ ] Register `ChatPanel` in `extension.ts` as secondary sidebar view
- [ ] Build webview with React + Vite, wired to VS Code message API
- [ ] Port stage guides, story traps, coaching personas to `@storyline/core`
- [ ] Implement conversation loop: system prompt builder, turn history manager
- [ ] Implement streaming message renderer (no re-render per token)
- [ ] Build user bubble component
- [ ] Build AI free-flow response component
- [ ] Build option card, beat card, critique badge, stage complete card
- [ ] Build collapsible stage rail (CSS max-height transition, chevron rotation)
- [ ] Store rail collapsed/expanded state in `globalState`
- [ ] Show active stage name inline in rail header when collapsed
- [ ] Build theme toggle pill (☀️/🌙/💻) in chat header
- [ ] Implement theme switching (add/remove `light` class, store in `globalState`)
- [ ] Wire `auto` mode to `prefers-color-scheme` media query listener
- [ ] Build credit badge in chat header (reads from `globalState` credit balance)
- [ ] Build shadow-focus input component with ⌘↵ send
- [ ] Wire save intent → local state.json write → stage complete card
- [ ] Wire chapterOutline save → writeAllChapterCards (local write)
- [ ] Apply dark/light design tokens — do NOT inherit from VS Code theme colours
- [ ] Framer Motion: stage complete card entrance, message fade-in

## Dependencies

M1 complete (AI provider abstraction, @storyline/core).

## Success criteria

- Full conversation through Stage 3 (Protagonist) works without errors
- state.json is written correctly on save with correct field values
- No network call is made on save (local write only)
- Streaming feels smooth — no jank, no flicker
- Light mode (Moleskine paper) and dark mode both presentable to an external user
- Theme toggle switches instantly with smooth CSS transitions on all colour values
- Stage rail collapses and expands smoothly; active stage visible when collapsed
- Credit balance displayed correctly in chat header
- `⌘↵` sends, `Enter` inserts newline
- Stage rail updates immediately after save
