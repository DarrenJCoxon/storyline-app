# Storyline — Claude Code Configuration
# Powered by Save the Cat story planning methodology

## Project Context

Storyline is a planning and writing environment for novelists. It combines a conversational Save the Cat planning harness (run in Claude Code via the `/storyline` skill) with a rich-text VS Code writing surface, a draft→EPUB/PDF compile pipeline, and live preview. Writers use it to plan a book end-to-end, then draft the prose inside the same environment — the AI helps with structure and critique, not prose generation.

## Command

Use `/storyline` to activate the planning harness inside Claude Code.

## Activating the Harness

When the user says anything about:
- Writing, planning, or plotting a novel
- Character arcs, beat sheets, scene outlines
- Story structure, Save the Cat
- Using "storyline"

Route to `/storyline` using the skill system.

## Storyline Commands

- `storyline start` — Start new project or continue existing
- `storyline status` — Show current project state
- `storyline stages` — List all 14 planning stages
- `storyline generate` — Output master planning document

## Core Behaviour

- Character-first, always — protagonist deep dive before beat sheet
- Genre first — establish genre before exploring premise
- Conversational, not templated — no fixed templates, questions adapt to what the writer says
- AI critique after every stage — flag errors with Save the Cat specific reasoning
- Two-pass scene outline — high-level first, approved, then fleshed chapter by chapter
- Organic series detection — notice when a story has multi-book potential
- Never write prose — this harness plans only

## State Files

- `.storyline/state.json` — Full project state with all 14 planning stages
- `output/master-document.md` — Generated planning document when complete

## Save the Cat Beat Reference

The 15 beats in order:
1. Opening Image
2. Setup
3. Catalyst
4. Debate
5. Break Into Two
6. B Story
7. Fun and Games
8. Midpoint
9. Bad Guys Close In
10. All Is Lost
11. Black Moment
12. Break Into Three
13. Finale
14. Final Image
15. End Credits

## Genre Variants

Standard, Puppy Love, Buddy Love, Whydunit, Fool Again, Out of the Box, Traps, Golden Fleece, Institutionalized, Superhero.

## Planning Stages

1. Genre & Foundations
2. Story Seed & Premise
3. Protagonist Deep Dive
4. Supporting Cast
5. Relationship Web
6. Logline Refinement
7. Beat Sheet
8. B Story
9. Subplots
10. Scene Outline
11. Plot Thread Registry
12. Chapter Flesh-Out
13. Consistency & Critique
14. Master Document

## Key Files

- `skill/SKILL.md` — The /storyline command skill definition
- `skill/docs/startup/startup-protocol.md` — Startup routing
- `lib/state/project-state.js` — Full state schema
- `lib/ai/narrative-voice.js` — Save the Cat knowledge
- `lib/ai/model-router.js` — Per-stage model routing (M8 — Haiku / Sonnet / Opus)
- `lib/stages/*.js` — One file per planning stage