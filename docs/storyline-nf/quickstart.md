# Storyline NF — Quickstart

Storyline NF is the non-fiction planning harness built into Storyline. It covers three book types, all sharing a 12-stage Book DNA phase before branching into a pipeline-specific planning track.

## Prerequisites

- Storyline installed and a project initialised (`storyline init`)
- Claude Code running in your project directory

## The three pipelines

| Pipeline | Book type | Examples |
|----------|-----------|---------|
| **A — Prescriptive** | Self-help, business, health, money, relationships | *Atomic Habits*, *The 4-Hour Body*, *The Lean Startup* |
| **B — Narrative NF** | Popular science, history, investigative, true crime | *Sapiens*, *The Immortal Life*, *Educated* |
| **C — How-To / Skill** | Practical skills: cooking, coding, craft, language | *The Joy of Cooking*, *The Elements of Style*, *Learn Python* |

## Five minutes to your first planning session

```bash
# 1. Initialise NF mode and pick a pipeline
storyline nf init --pipeline A

# 2. Check what stage you're on
storyline nf status

# 3. Open Claude Code and activate the harness
/storyline-nf

# 4. Work through stages — the harness guides you
# When a stage is complete, the harness saves it automatically.

# 5. Generate your master document
storyline nf generate
```

## Stage flow at a glance

```
Phase 0 — Book DNA (12 stages, all pipelines)
  ↓  dna-category → dna-reader → dna-transform → dna-idea
  ↓  dna-author → dna-promise → dna-comps → dna-voice
  ↓  dna-evidence → dna-commercial → dna-title → dna-consolidate

Pipeline A (11 stages)          Pipeline B (10 stages)          Pipeline C (11 stages)
  pa-thesis                       pb-thesis                       pc-skill
  pa-objections                   pb-cast                         pc-start-level
  pa-framework ─→ sub-mode fork   pb-timeline                     pc-end-state
  pa-principles                   pb-fork ─→ idea-led|event-led   pc-decompose
  pa-evidence                     pb-scenes                       pc-prereqs
  pa-application                  pb-sourcing                     pc-lessons
  pa-braid (braid mode only)      pb-theme                        pc-drills
  pa-chapters                     pb-chapters                     pc-milestones
  pa-opener                       pb-critique                     pc-examples
  pa-critique                     pb-master                       pc-critique
  pa-master                                                       pc-master
```

## Key commands

| Command | What it does |
|---------|-------------|
| `storyline nf init --pipeline A\|B\|C` | Set project to NF mode and choose pipeline |
| `storyline nf status` | Show stage completion progress |
| `storyline nf stages` | List all stages for the active pipeline |
| `storyline nf generate` | Generate master document + auto-run critique |
| `storyline nf critique` | On-demand full-book audit |
| `storyline nf compile` | Compile to EPUB/PDF with bibliography, endnotes, and visuals |
| `storyline nf consolidate` | Write `.storyline/book-dna.md` from completed Book DNA stages |
| `storyline nf help [stageId]` | Show harness overview or stage-specific guidance |

## Research

Capture sources and claims as you plan — they feed the bibliography and endnotes at compile time.

```bash
# Capture a research item
storyline research add --type sourced-claim --title "Deliberate practice study" --author "Ericsson, K.A."

# Link it to a chapter
storyline research link <item-id> chapter:3
```

See [research-workflow.md](research-workflow.md) for the full workflow.

## Per-pipeline guides

- [Pipeline A — Prescriptive](pipeline-a.md)
- [Pipeline B — Narrative NF](pipeline-b.md)
- [Pipeline C — How-To / Skill](pipeline-c.md)

## Book DNA deep-dive

See [book-dna-guide.md](book-dna-guide.md) for why each of the 12 shared stages matters and what good answers look like.
