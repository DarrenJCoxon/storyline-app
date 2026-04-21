# Distribution — Phase 1: paid DMG via VSCodium fork

_Last updated: 2026-04-21_
_Status: direction of travel. Not a build spec. Activated when [Phase 0](distribution-phase-0.md) beta feedback settles._

## Context & goal

Phase 1 is the paid v1 product. Target: writers who want a finished writing app, not a developer tool to configure. Price anchor: **£79 one-time purchase**. Zero-terminal experience: the user downloads a file, double-clicks, and the full Novel Writer environment opens — manuscript, planning harness, AI integration, three-pane layout — with no Node, no VS Code install, no extension marketplace, no `.vsix` files, no command line.

The headline decision for Phase 1 is architectural: **ship a fork of [VSCodium](https://vscodium.com/)** (the MIT-licensed open-source build of VS Code), pre-bundled with the Novel Writer extension, skill, default layout, and first-run configuration. Microsoft's own VS Code licence forbids redistribution; VSCodium exists specifically to be forked and rebundled. Cursor, Windsurf, and several other commercial editors take this same path.

## The strategic bet: hide, don't repaint

The single most important Phase 1 decision — made deliberately, recorded here so it doesn't drift — is that our differentiation comes from **aggressive UI removal, not cosmetic repainting**.

VS Code has an enormous surface area designed for developers: debug panels, source control, extensions marketplace, settings JSON, integrated terminal, problems tab, task runner, 500+ command palette entries, activity bar icons for every language server. A novelist touches perhaps 5% of this. Every remaining pixel is a tell that they're using "a developer tool cosplaying as a writing app" — which is exactly what undermines the £79 price point.

Cursor's perceived-bespoke feeling doesn't come from repainted window chrome. It comes from what they've quietly *removed* (and renamed) in their rebrand. We can go further than Cursor because our audience needs drastically less than theirs does.

The bet: **a calm three-pane manuscript editor with zero developer cruft feels like a premium product, even if the chrome underneath is visibly VS Code-ish.** Repainting title bars and shipping custom icon sets doesn't move the perceived-premium needle nearly as much as removing buttons does. Phase 1 invests in removal.

## The product shape

**Download flow.** Writer buys on a simple storefront → receives a link to `novel-writer-macos-1.0.0.dmg` → double-clicks → drags Novel Writer.app into Applications → opens it → a Welcome screen appears offering "Start a new novel" or "Open existing novel". No further setup.

**What's in the app**: VSCodium binary, pre-installed Novel Writer extension, pre-installed `/novel` skill, pre-configured default layout (three-pane, tinted manuscript surface, typewriter scroll available), sample starter novel on first run.

**What the writer sees**: An app called Novel Writer, with its own icon in the Dock and the macOS menu bar. The top-level menu reads "File > New Novel / Open Novel / New Chapter…" — not "File > New Text File". The left column is called "Manuscript", not "Explorer". The middle pane is the editor they already know from Phase 0. The right pane hosts supporting docs or the AI chat.

## What gets hidden in v1

These disappear entirely from the default UI (writers who enable them via a hidden "Developer Mode" setting can bring them back, but that's advanced-tier):

- Debug panel and all debug controls
- Source control panel (git UI)
- Extensions marketplace and "Install extension" flows
- Integrated terminal (disabled by default; available via a hidden preference)
- Welcome tab (replaced with our own)
- Problems, Output, Tasks panels
- Dev-focused command palette entries (filtered via `when` clauses and removed registrations)
- Most activity bar icons (source control, debug, extensions, run-and-debug)
- Settings JSON editor (replaced with a simplified preferences pane)

## What gets kept but renamed

- Explorer → **Manuscript**
- File > New Text File → **File > New Chapter**
- File > New Untitled Text File → removed
- File > Save Workspace As → removed
- Edit menu: kept but trimmed (no "Toggle Word Wrap" — always on; no "Change All Occurrences" — rename is rare in prose)
- Preferences → simplified pane with four controls: **Theme** (Light / Dark / Sepia), **Font**, **Target word count**, **Claude API key**

## What gets lightly rebranded

Chrome-level only, not pixel-level:

- App name: **Novel Writer**
- App icon: bespoke Novel Writer icon (commissioned artwork)
- Window title
- macOS menu bar name
- First-run Welcome screen (custom content, VSCodium-compatible styling)
- Splash/loading screen
- About dialog (credits VSCodium upstream per MIT licence requirement)

What we *don't* do in v1 (deferred to Phase 2):
- Custom title bar rendering
- Custom font stack or typography system
- Custom colour palette beyond what the Novel Writer extension already provides
- Marketing-grade onboarding animation

## Claude integration — open decision

One architectural question to answer when Phase 1 work starts, not now:

**Option A: Bundle as prerequisite.** The Novel Writer app detects whether Claude Code is installed on the user's machine. If not, the first-run flow guides them through installing it (linking to Anthropic's installer, returning to Novel Writer when done). Novel Writer itself never sees the API; all AI interaction flows through Claude Code as today.
- Pro: Separation of concerns. We don't handle billing, rate limits, or Anthropic API support for our users.
- Con: Extra install step breaks the "one file, double-click, done" promise.

**Option B: Embed via Anthropic API.** Build the planning chat UI directly into Novel Writer. Use the user's own Anthropic API key (entered once in Preferences). The `/novel` harness runs in-process against the API.
- Pro: Zero external dependencies. True one-download experience.
- Con: We own the billing/support surface. Users without an Anthropic account need one. We handle API errors, rate limits, model changes.

Decision deferred. Likely choice based on current thinking: **Option B**, because the zero-external-dependencies UX is what justifies £79. But this is a Phase 1 kickoff decision, not today's.

## Signing and distribution costs

These are real cash costs to plan for before Phase 1 starts, not surprises:

- **Apple Developer ID**: ~£79/year (required for macOS code signing + notarisation, without which users hit "unidentified developer" on download)
- **Windows code-signing certificate**: £200–£400/year (EV cert cheaper long-term than standard, faster SmartScreen trust)
- **Notarisation infrastructure**: free once Apple Dev ID in place, but requires a CI workflow to automate
- **Distribution hosting**: incidental; DMG is ~200MB, so S3 or Cloudflare R2 at pennies per tester

Total recurring: ~£300–500/year. Budget for that before committing to a ship date.

## Platforms for v1

**macOS only** for v1. Justification: most serious writers on the target audience list (UK/US indie novelists, 30–60 age range) are Mac users, and shipping one platform well beats shipping two platforms half-baked. Windows lands as v1.1 once macOS distribution is proven.

Linux deferred indefinitely — not our audience.

## Rough scope

Once Phase 0 beta feedback has settled (call it late-2026 if Phase 0 launches Q2 2026), Phase 1 build work is roughly:

- **Week 1**: VSCodium fork setup, reproducible build pipeline, pre-bundle extension + skill + templates
- **Week 2**: UI stripping — disable the panels/commands/views listed above, test extensively for regressions
- **Week 3**: Renaming + first-run flow + Welcome screen + simplified Preferences pane
- **Week 4**: Code signing, notarisation, DMG packaging, first distributable build, internal testing

3–4 weeks of focused work. Most of the risk is in the signing/notarisation plumbing and in catching UI-stripping regressions that break the writing flow.

## Phase 2 hook

Deeper rebranding — bespoke icon set throughout the UI, custom welcome animation, marketing-grade visual identity, possibly a custom font for the brand — is deferred to Phase 2. Trigger: the product has proven out commercially (say, 100+ sales) and the ROI on visual polish becomes defensible. Until then, stripping wins over painting.
