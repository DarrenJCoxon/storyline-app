# Research Workflow

The research subsystem connects your source material to your planning stages and compile outputs. Items you capture during planning become the endnotes, bibliography, and fact-check report in the compiled book — without any extra work at compile time.

## The four operations

```
Capture → Link → Verify → Compile
```

### 1. Capture

Add a research item when you find a source you'll use:

```bash
# Quote or statistic from a book
storyline research add \
  --type quote \
  --title "On identity-based habits" \
  --author "Clear, James" \
  --source "Atomic Habits" \
  --year "2018" \
  --notes "The most reliable way to change behaviour is to change your identity first"

# Sourced claim (Pipeline B — requires citation)
storyline research add \
  --type sourced-claim \
  --title "Henrietta Lacks cells still divide in labs today" \
  --author "Skloot, Rebecca" \
  --source "The Immortal Life of Henrietta Lacks" \
  --year "2010" \
  --reliability peer-reviewed

# Case study
storyline research add \
  --type case-study \
  --title "Alcoa safety transformation under O'Neill" \
  --notes "CEO focused entirely on worker safety; profitability followed. Used in Chapter 3."
```

**Item types:** `note`, `quote`, `statistic`, `case-study`, `interview`, `sourced-claim`, `worldbuilding`

**Reliability tiers:** `primary`, `peer-reviewed`, `secondary`, `anecdotal`

**Verification states:** `verified`, `pending` (default), `disputed`, `needs-follow-up`

### 2. Link

Link items to the part of the book they support. Links are bidirectional — you can find what supports a chapter, or which chapters an item supports.

```bash
# Link to a chapter
storyline research link <item-id> chapter:3

# Link to a scene (Pipeline B)
storyline research link <item-id> scene:ch2-s1

# Link to a planning stage
storyline research link <item-id> stage:pa-evidence

# Link to a sourced claim (Pipeline B)
storyline research link <item-id> claim:<claim-id>
```

### 3. Verify

Mark items as you confirm them. The fact-check report at compile time uses verification state.

```bash
# Mark an item verified
storyline research verify <item-id>

# Mark as disputed (conflicts with another source)
storyline research dispute <item-id>

# Mark as needs follow-up
storyline research flag <item-id>
```

### 4. Compile

At compile time, the research subsystem produces three artifacts automatically:

```bash
storyline nf compile
# → output/bibliography.md     (all citable items, Chicago format by default)
# → output/endnotes.md         (per-chapter notes for linked items)
# → output/fact-check-report.md (verification status summary)
```

To use APA or MLA instead of Chicago:
```bash
storyline nf compile --citation-style apa
storyline nf compile --citation-style mla
```

## Pipeline-specific workflows

### Pipeline B — Sourcing register

Pipeline B books rely on sourced claims. A sourced claim is a factual assertion that requires a citation. As you work through the pipeline, capture these with `--type sourced-claim`.

Build the sourcing register at any time:
```bash
storyline nf sourcing-register
# Writes .storyline/sourcing/register.json and register.md
# Groups claims by link target (chapter/scene/stage)
```

The sourcing register is a filtered view over your research items — no separate data entry. Any item with `subtype: sourced-claim` appears in it.

### Pipeline C — Lesson-linked research

If your how-to book cites studies (common in skill books on learning, health, or cognition), link research items to the lesson stage they inform rather than chapters (chapters don't exist yet at planning time):

```bash
storyline research link <item-id> stage:pc-drills
```

At compile time, items are re-associated with chapters via the lesson plan mapping.

## Finding items

```bash
# List all items
storyline research list

# Search by keyword
storyline research search "deliberate practice"

# List items linked to a chapter
storyline research list --chapter 3

# Show a single item with full detail
storyline research show <item-id>
```

## Tips

- **Capture early, verify late.** Don't stop your research flow to verify each item. Mark everything as `pending` and verify in a batch once a stage is complete.
- **Over-capture and prune.** It's easier to delete unused items than to remember where you read something two weeks ago.
- **Link before you need to.** Linking items as you capture them (not at compile time) keeps the research register fresh and gives the AI critique access to your sourcing coverage.
- **Use notes for paraphrase.** The `notes` field is for your paraphrase or interpretation — what you'll actually write in the book, as opposed to the source's exact words. This prevents accidental plagiarism.
