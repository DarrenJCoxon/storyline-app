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
┌────────────────────────────────┐
│  Stage Rail                    │  ← top section, always visible
│  ● Stage 1: Genre ✓            │
│  ● Stage 2: Premise ✓          │
│  ◉ Stage 3: Protagonist ←active│
│  ○ Stage 4: Characters         │
│  ...                           │
├────────────────────────────────┤
│  Chat thread                   │  ← scrollable, fills remaining space
│                                │
│  [AI free-flowing response]    │
│  Here's what we need to build  │
│  for your protagonist...       │
│                                │
│  ╭──────────────────────────╮  │
│  │ User bubble — their text │  │
│  ╰──────────────────────────╯  │
│                                │
│  [AI response continues...]    │
│                                │
├────────────────────────────────┤
│  ┌──────────────────────────┐  │  ← input, pinned to bottom
│  │  Type here...            │  │     shadow on focus
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

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

Vertical list at the top of the pane. Each stage shows:
- Completion state: `○` not started, `◉` active, `●` complete
- Stage name
- Clicking a completed stage expands/collapses its chat history

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
--bg-light:       #F5F3EF;
--bg-dark:        #1A1A1A;
--text-light:     #1C1C1E;
--text-dark:      #E8E6E1;
--accent:         #C9A84C;
--accent-subtle:  rgba(201, 168, 76, 0.12);
--bubble-light:   #E8E3D8;
--bubble-dark:    #2A2A2A;
--font:           'Inter', system-ui, sans-serif;
--font-size-body: 15px;
--line-height:    1.7;
--radius-bubble:  18px;
--radius-card:    10px;
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
- [ ] Build stage progress rail component
- [ ] Build shadow-focus input component with ⌘↵ send
- [ ] Wire save intent → local state.json write → stage complete card
- [ ] Wire chapterOutline save → writeAllChapterCards (local write)
- [ ] Apply design tokens, light/dark mode via VS Code theme kind
- [ ] Framer Motion: stage complete card entrance, message fade-in

## Dependencies

M1 complete (AI provider abstraction, @storyline/core).

## Success criteria

- Full conversation through Stage 3 (Protagonist) works without errors
- state.json is written correctly on save with correct field values
- No network call is made on save (local write only)
- Streaming feels smooth — no jank, no flicker
- Light and dark mode both presentable to an external user
- `⌘↵` sends, `Enter` inserts newline
- Stage rail updates immediately after save
