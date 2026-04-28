# NF-12 — Claim / evidence ledger

*Status: **PROPOSED***
*Parent: [00-overview.md](00-overview.md)*
*Depends on: [NF-11](nf-11-planning-to-writing.md) (state contract + writing plan)*
*Created: 2026-04-28*

## Outcome

Every factual claim a non-fiction book makes has a tracked source, status, and verification state, surfaced in `output/claim-evidence-ledger.md` and visible at draft time as inline markers in manuscript files.

The writer can answer, at any point: which of my claims are supported, which are unsupported, which sources are weak, and which chapters carry the most factual risk.

## Why this milestone exists

Most non-fiction failures are factual, not structural. A claim made in chapter 3 with no source. A statistic inherited from a comp that was wrong in the original. A timeline contradicted three chapters later. The market has tools for outline structure and prose flow; very few have a first-class claim model that survives from plan into draft into compile.

The research subsystem already supports `claim:<id>` link targets in `research/schema.ts`. NF-12 makes that latent capability into a real ledger.

## Relationship to fiction's promise/payoff ledger

NF-12's claim/evidence ledger and fiction's [FIC-C promise/payoff ledger](../fiction-book-brain/fic-c-promises.md) are intentionally **distinct artefacts with a shared detection skeleton**:

- **Claim ledger** (NF-12): tracks *factual* claims with sources, verification, citation status. Answers "is this supported?"
- **Promise/payoff ledger** (FIC-C): tracks *narrative* setups and payoffs across the story. Answers "did this pay off?"

Different vocabularies, different files, different question. **Not merged.** A non-fiction project produces the claim ledger only; a fiction project produces the promise ledger only.

The shared infrastructure is the *detection skeleton* extracted in [FIC-C.3](../fiction-book-brain/fic-c-promises.md) from the existing `extension/lib/ai/critique-api.js:checkPromisePayoff`. NF-12.2's renderer should consume the generalised core function from `packages/core/src/critique/` rather than reimplementing claim-walking logic from scratch. If FIC-C lands first, NF-12 is downstream of it; if NF-12 lands first, the extracted detector is generic enough that FIC-C plugs in afterwards.

## Prove-it gate

Four criteria. All must be true.

1. **Ledger generates.** A Pipeline A or Pipeline B project with at least one populated evidence stage produces `output/claim-evidence-ledger.md` with rows for every planned claim, sourced or not.
2. **Status flows from plan to draft.** A `{{claim: <id>}}` marker in a manuscript file resolves to the same claim entry in the ledger. Marking the claim as cited in the research panel updates the ledger on next refresh.
3. **Risk surfaces.** The ledger flags chapters with the highest number of unsupported claims, distinguishing high-confidence claims with weak sources from low-confidence claims with strong sources.
4. **Tests pass.** NF-12.6 covers ledger generation, status transitions, marker resolution, and risk-summary integration with the master doc.

## Stories

Five stories.

- **NF-12.1 — `ClaimEvidenceItem` model.** Extend `WritingPlan` with `claims[]`. Each item: id, claim text, chapter, section, evidence type, source(s), confidence, risk, citation need, verification state. Pulled from chapter `keyResearch` + evidence-map / sourcing-register stages + existing research subsystem items linked to `claim:<id>`. *(2 days)*

- **NF-12.2 — Claim ledger renderer.** `packages/core/src/output/claim-evidence-ledger.ts`. Generates `output/claim-evidence-ledger.md` grouped by chapter, with status tags and a chapter risk summary at the top. Refreshed on evidence/sourcing stage saves and on research-item edits. *(2 days)*

- **NF-12.3 — Claim markers in manuscript scaffold.** Extend NF-11.6's seeding to emit `{{claim: <id>}}` markers in section bodies where the chapter plan declares a key claim. Inline-resolvable via the same research-panel affordance the existing `{{research: …}}` markers use. *(1–2 days)*

- **NF-12.4 — Verification lifecycle.** Each claim has states: planned, sourced, captured, verified, cited. Transitions are driven by research-panel actions, not state.json edits. Surfaced in the ledger and (later) in the writing cockpit. *(2 days)*

- **NF-12.5 — Risk summary in master doc.** NF-11.5's NF master doc gains a "claim risk overview" section: total claims, % verified, top 3 highest-risk chapters. Pure additive change. *(half day)*

- **NF-12.6 — Tests.** New `tests/claim-evidence-ledger.test.js` covering: (a) ledger generates from a Pipeline A fixture state with populated evidence stage; (b) ledger generates from a Pipeline B fixture with sourcing-register; (c) status transitions (planned → sourced → captured → verified → cited) update the ledger output; (d) `{{claim: <id>}}` markers in a sample manuscript file resolve back to the same claim entry; (e) verified-claim count surfaces correctly in NF-12.5's master-doc risk overview. Reuses fixtures from NF-11's test set. *(1 day)*

## Risks

- **Claim extraction quality.** The plan stages capture claims loosely — `keyResearch` is freeform text. Mitigation: parse-best-effort with explicit unparsed entries shown in the ledger; do not pretend to have structured claims when we don't.
- **Verification state drift.** Writers may mark claims verified outside Storyline. Mitigation: ledger has a "last refreshed" timestamp; verification is a hint, not a contract.
- **Ledger fatigue.** A 100-claim book produces a long ledger. Mitigation: chapter-level summary at the top; full table below.

## Out of scope

- Automatic source verification (web fetching, citation checking).
- Plagiarism detection.
- Legal/sensitivity review (separate, larger problem).
- Real-time research fetching.

## Closure

The book has a tracked factual backbone. The writer knows what is supported and what isn't, before they finish the draft, not during a panicked legal review afterwards. This is the strongest single moat in the NF Writing OS.
