# Milestone NF-01 — Research subsystem (retrofit to novel harness)

*Status: **DONE** — research subsystem built and tested; novel harness retrofitted; VS Code panel added. 35 tests pass, all 402 suite tests pass. Prove-it gate pending NF-1.10 dogfood.*
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

A cross-cutting research subsystem ships inside Storyline. It stores, tags, links, verifies, and semantically retrieves research items. It is integrated into the existing novel harness so novelists can attach research to scenes and retrieve it during drafting. It is the foundation every non-fiction pipeline will stand on.

## Why this milestone exists

Every subsequent non-fiction milestone depends on a research layer being in place. Building it first and retrofitting it to the novel harness validates the subsystem under real use — before any non-fiction pipeline relies on it — and delivers immediate value to existing fiction users (period research, profession research, worldbuilding notes).

Both harnesses need the same thing. Build it once.

## Prove-it gate

All three must be true:

1. **A novel user can complete a full research workflow.** Capture a research item, attach metadata, link it to a scene, retrieve it via semantic search from a drafting session, and see it surfaced automatically by the AI when drafting the linked chapter.
2. **The reliability audit works.** Running `storyline research gaps` on a real project produces an actionable list of thin-evidence areas and unverified claims — not noise.
3. **Memory integration is seamless.** Research items live in the same AgentDB namespace as existing memory records. Existing memory queries still work. No regressions.

## Stories

- **NF-1.1 — Directory & file schema.** Define `.storyline/research/items/`, `sources/`, `index.json`, `index.md`. Item frontmatter fields: `id`, `type: "research"`, `subtype`, `reliability`, `verification`, `tags`, `links`, `sources`. *(Half day)*
- **NF-1.2 — `lib/research/capture.js`.** Add/edit/delete research items with frontmatter. CLI: `storyline research add`, `edit`, `rm`. *(1 day)*
- **NF-1.3 — `lib/research/index.js`.** Index maintenance. Rebuild from items on demand. Embed items into AgentDB using the same namespace and HNSW configuration as novel memory. *(1–2 days)*
- **NF-1.4 — `lib/research/linker.js`.** Bidirectional links from research items to chapters, scenes, claims. Link integrity checks. CLI: `storyline research link <item> --to <target>`. *(1 day)*
- **NF-1.5 — `lib/research/retrieval.js`.** Semantic retrieval API. Accepts a context string (chapter summary, scene description, claim) and returns top-N relevant research items. *(1 day)*
- **NF-1.6 — `lib/research/critique.js`.** Gap analysis: chapters with thin evidence, claims without sources, items with low-reliability backing. Output format suitable for CLI and for inclusion in master document critique. *(1 day)*
- **NF-1.7 — Novel harness retrofit.** Add "attach research" affordance to novel planning stages where relevant (setting, profession, period). Expose retrieval during drafting. *(1 day)*
- **NF-1.8 — Drafting-time retrieval in the VS Code surface.** When the writer opens a chapter file, surface linked and semantically relevant research items in a side panel. *(1–2 days)*
- **NF-1.9 — CLI coverage.** `storyline research add | edit | rm | link | search | gaps | verify`. Help text for each. *(Half day)*
- **NF-1.10 — End-to-end test on an existing novel project.** Dogfood: capture 20+ real research items on a current novel, link them, retrieve during drafting, run the gap analysis. Log friction. *(1 day)*
- **NF-1.11 — Gate check.** Apply the three prove-it criteria. Fix blockers. Close milestone. *(Half day)*

## Risks

- **Memory namespace collision.** Embedding research items into the same AgentDB namespace as planning memory risks polluting retrieval for stage queries. Mitigation: type-filtered retrieval in both directions, tested in NF-1.10.
- **Schema churn.** Frontmatter fields will evolve as pipelines land. Mitigation: version the frontmatter schema in NF-1.1 and plan for migration in M2.

## Out of scope for this milestone

- Sourcing Register (Pipeline B view over this subsystem) — lands in NF-06.
- Bibliography / endnote compile outputs — land in NF-09.
- Non-fiction command surface — lands in NF-02.
