# Storyline Next-Level Codebase Plan

This plan captures the codebase review findings and turns them into an execution roadmap. The goal is to move Storyline from a strong planning harness plus emerging app shell into a unified writing intelligence system: local-first, plan-aware, critique-rich, and reliable enough for serious book work.

## Strategic Direction

Storyline's strongest product thesis is not "AI writes your book." It is "AI helps you build, test, remember, and refine the book you are writing." The next level is a closed loop:

1. Plan the book with structured methodology.
2. Draft inside the same environment.
3. Compare the draft against the plan.
4. Surface risks, drift, missing promises, and continuity issues.
5. Let the writer decide whether to revise the draft or evolve the plan.

The codebase already contains most of the raw material for this: planning state, stage transitions, critique concepts, compile tooling, extension panels, backend chat, and non-fiction research primitives. The main work is consolidation, correctness, and turning those pieces into one coherent engine.

## Current Strengths

- Clear product identity: local-first writing, Save the Cat planning, and critique over prose generation.
- Mature planning harness with strong stage concepts, startup protocols, doctor checks, and state files.
- Real compile pipeline for EPUB/PDF rather than a placeholder export feature.
- Rich non-fiction planning system with research, Book DNA, framework cards, and pipeline variants.
- Thoughtful roadmap documents that already recognize the risks of premature platform expansion.
- Emerging standalone app architecture with onboarding, chat, editor, compile, cover, and backend pieces.

## Critical Stabilization Work

### 1. Restore the Storyline Brain in Managed Chat

Managed chat currently does not carry the full Storyline prompt contract to the backend. The extension builds a system prompt, but the managed provider serializes only licence key, messages, and stage id. The backend then forwards only model and messages to OpenRouter.

Impact: managed/free users may get generic AI instead of the Storyline persona, Save the Cat rules, stage constraints, and project-aware behavior.

Plan:

- Include the system prompt in managed provider requests.
- Have the backend explicitly compose trusted server-side system instructions with safe client context.
- Add tests proving managed chat receives stage-aware instructions.
- Add an opening-prompt path that does not call the model with an empty message list.

Acceptance criteria:

- Managed chat can answer with the correct stage behavior.
- Empty opening prompt calls do not hit the backend.
- Tests cover system prompt propagation without exposing secrets.

### 2. Fix BYOK and Local Model Routing

The app passes `model: ''` into BYOK and local providers. OpenAI-compatible, Anthropic, and Ollama providers all depend on a usable model id.

Plan:

- Add a provider-specific model setting.
- Define safe defaults for OpenAI-compatible, Anthropic, and Ollama providers.
- Validate model configuration before sending requests.
- Surface a clear setup error in the UI instead of failing inside provider calls.

Acceptance criteria:

- BYOK chat works with configured OpenAI-compatible and Anthropic models.
- Ollama uses a configured local model.
- Provider tests cover missing, defaulted, and custom model values.

### 3. Repair Extension Compile Integration

The new extension's compile runner resolves the root compile modules through a brittle relative path and compiled CommonJS output appears incompatible with the root ESM compile files.

Plan:

- Extract compile logic into a package such as `@storyline/compile`, or temporarily route extension compilation through the CLI as the older extension does.
- Remove cross-package relative path imports from compiled extension output.
- Add an integration test for compile from the extension context.

Acceptance criteria:

- Extension compile works from source and packaged extension builds.
- The compile path does not depend on workspace layout accidents.
- CLI and extension compile behavior share one implementation.

### 4. Make Critique and Master Document Real Required Stages

Fiction stages 13 and 14 can currently be treated as skippable because their required fields are empty arrays. That undermines the promise that Storyline includes critique and a final master planning document.

Plan:

- Replace empty skippable requirements with explicit completion markers.
- Update master document generation to write state metadata as well as the markdown artifact.
- Teach doctor/verify-stage to detect missing critique and stale/missing master document output.
- Add tests showing `chapterOutline` does not complete the full planning flow by itself.

Acceptance criteria:

- Stage 13 cannot be skipped silently.
- Stage 14 records when the master document was generated.
- Doctor reports stale or missing final planning artifacts.

### 5. Fix Streaming Parsers

The Anthropic BYOK stream parser drops the final buffered chunk when the stream ends without a trailing newline. Similar SSE readers should be checked for the same bug.

Plan:

- Process any leftover buffer after stream completion.
- Share a tested SSE parsing helper across providers.
- Add tests for final chunk with and without trailing newline.

Acceptance criteria:

- The failing `Hello!` streaming test passes.
- OpenAI-compatible and Anthropic streaming both preserve final chunks.

### 6. Align Cover and Blurb Generation with Current State

The blurb generator reads stale field names, so cover and blurb prompts miss the richest planning data.

Plan:

- Update extraction to use current state fields such as `premise.rawLogline`, `premise.conceptHook`, `logline.sentence`, and nested beat keys.
- Add a state adapter so illustration features do not depend on raw schema details.
- Add tests using a real planning-state fixture.

Acceptance criteria:

- Cover and blurb generation uses protagonist, premise, logline, genre, tone, and key beats from current state.
- State schema changes fail tests instead of silently degrading prompts.

### 7. Harden Credits, Licensing, and Free Access

Backend credit accounting reads a balance and later writes a decremented value. Concurrent streams can overspend. The public free key also needs a clearer product and abuse-prevention model.

Plan:

- Move credit reservation before model streaming.
- Use atomic or durable credit accounting instead of plain read-modify-write KV updates.
- Replace the single public free key with per-install grants, signed anonymous activations, or a deliberate no-auth trial model.
- Decide whether BYOK requires a software licence, managed credits, both, or neither.

Acceptance criteria:

- Concurrent requests cannot spend the same credit twice.
- Free onboarding cannot drain a shared global key.
- Product docs and code agree on BYOK/licence behavior.

## Architecture Consolidation

### Create `@storyline/engine`

There is visible drift between root `lib/` code and `packages/core/`. The most important architectural move is to define one shared engine package that owns:

- State schema and migrations.
- Stage transitions and completion rules.
- Stage guides, coaching personas, and story traps.
- Model routing policy.
- Project validation and doctor checks.
- Typed actions for safe state updates.

Consumers:

- CLI harness.
- VS Code extension.
- Standalone/Tauri app.
- Backend validation and prompt composition.
- Test fixtures.

Acceptance criteria:

- No duplicated stage guide or transition logic across `lib/` and `packages/core/`.
- CLI and extension derive current stage the same way.
- State fixtures are shared across unit and integration tests.

### Introduce Deterministic State Patching

The app should not rely on loose model output to mutate project state. Use typed actions or JSON Patch with validation.

Plan:

- Define one action contract per planning stage.
- Validate action payloads with the shared schema.
- Present a "what will be saved" diff before writing important changes.
- Log state changes in a project-local history file.

Acceptance criteria:

- Invalid AI-generated updates cannot corrupt `.storyline/state.json`.
- Writers can inspect major plan changes before accepting them.
- State edits are auditable and reversible.

## Product Bets

### 1. The Book Brain

Build a project memory layer from planning state, manuscript files, critiques, research, character notes, plot threads, and compile metadata.

Capabilities:

- Ask questions of the current book.
- Retrieve relevant planning context while drafting.
- Track promises, open loops, timeline facts, and character commitments.
- Support fiction continuity and non-fiction claim/source grounding.

### 2. Plan-vs-Draft Critique

Make critique concrete and book-specific.

Capabilities:

- Detect where a chapter diverges from the outline.
- Flag missing beat intent, weak scene turns, unresolved threads, and character inconsistency.
- Let the writer mark drift as intentional and update the plan.
- Produce chapter-level and whole-book critique dashboards.

### 3. Story Bible and Continuity Dashboard

Turn planning data into a living story bible.

Sections:

- Characters and arcs.
- Relationships.
- World rules.
- Timeline.
- Plot threads.
- Subplots.
- Promises and payoffs.
- Draft coverage by chapter.

### 4. Visual Identity Board

Cover and illustration generation should become a reusable visual system, not a one-off prompt form.

Capabilities:

- Store approved motifs, palettes, title treatment, and reference descriptions.
- Generate covers from current story state.
- Keep visual continuity across a series.
- Separate marketing copy, cover direction, and illustration prompts.

### 5. Research and Citation Workspace

The non-fiction subsystem points toward a broader research workspace.

Capabilities:

- Source capture and claim registry.
- Evidence status per chapter.
- Citation/export support.
- Retrieval-augmented critique for unsupported claims.
- Fiction worldbuilding research support without forcing academic citation workflows.

### 6. Academic Book Category

Add an academic category to non-fiction so Storyline can support books built around instruction, curriculum, exam preparation, and structured learning outcomes.

Initial book types:

- Textbook.
- Revision guide.

Capabilities:

- Define target learner, course level, syllabus/standard, prerequisites, and learning outcomes.
- Plan chapters around concepts, worked examples, practice tasks, summaries, and assessment checkpoints.
- Track coverage against a curriculum map or exam specification.
- Support revision-guide patterns such as concise explanations, memory aids, common mistakes, practice questions, mark-scheme guidance, and spaced recap.
- Add critique checks for pedagogical sequence, cognitive load, concept scaffolding, assessment alignment, and missing prerequisite knowledge.
- Extend compile output with academic front/back matter such as learning objectives, chapter summaries, glossaries, answer keys, references, and indexes.

## Suggested Milestones

### Milestone A: Make the Current App Trustworthy

- Fix managed system prompt propagation.
- Fix BYOK/local model configuration.
- Fix streaming parser final chunks.
- Fix backend typecheck.
- Add `.gitignore` coverage for generated app/backend artifacts and local secrets.
- Decide and document BYOK/licence behavior.

### Milestone B: Consolidate the Engine

- Extract `@storyline/engine`.
- Move shared schemas, transitions, stage guides, traps, and state validation.
- Update CLI and extension to consume the same package.
- Add shared fixtures and compatibility tests.

### Milestone C: Make Compile a Shared Capability

- Extract compile into `@storyline/compile` or route through the CLI.
- Add extension compile integration tests.
- Verify packaged extension behavior.
- Keep EPUB/PDF behavior identical across entry points.

### Milestone D: Build Plan-Aware Drafting

- Add manuscript indexing.
- Add plan-vs-draft comparison.
- Add chapter critique cards.
- Add "update plan from draft" and "revise draft toward plan" workflows.

### Milestone E: Launch the Book Brain

- Create unified project memory.
- Add query UI in chat/editor sidecar.
- Track promises, threads, timeline facts, and character commitments.
- Add continuity dashboard.

### Milestone F: Expand Beyond Text

- Connect cover/blurb generation to current state.
- Add visual identity board.
- Add series continuity support.
- Add research and citation workspace for non-fiction.

### Milestone G: Add Academic Non-Fiction

- Add an academic non-fiction category.
- Add `Textbook` and `Revision Guide` as first-class book types.
- Extend non-fiction schemas for learner profile, course level, syllabus, learning outcomes, prerequisites, assessment style, and curriculum coverage.
- Add planning stages or stage variants for concept sequence, worked examples, practice questions, chapter summaries, and answer keys.
- Add critique checks for pedagogy, scaffolding, cognitive load, exam alignment, and revision effectiveness.
- Extend compile templates for textbook/revision-guide conventions such as objectives, exercises, glossaries, answer sections, and indexes.

## Engineering Quality Gates

Before a beta-quality standalone release:

- Root tests pass from a clean install.
- Extension tests pass.
- Backend tests and typecheck pass.
- Core package test script either has tests or uses a non-failing no-test mode.
- Packaged extension can chat, save state, compile, and generate cover assets.
- No local secrets or generated build artifacts are left unignored.
- Managed and BYOK modes have separate test coverage.
- State migrations are tested with real old fixtures.

## Open Product Decisions

- Does BYOK require a paid Storyline licence, or is payment only for managed credits?
- Is the standalone app primarily a VS Code extension, a Tauri app, or both for the next release?
- Should critique be mandatory before master document generation?
- How much project context should be sent to managed AI versus summarized locally first?
- Should the free tier be per-install, per-account, or removed in favor of BYOK-first onboarding?
- What is the first paid-worthy promise: planning harness, compile pipeline, drafting companion, or continuity critique?

## North Star

The north star is a writing environment that remembers the book better than a generic chatbot can, but still leaves authorship with the writer. Storyline should become the place where the plan, draft, critique, research, visual identity, and final compile all stay connected.
