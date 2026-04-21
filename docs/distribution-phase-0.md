# Distribution — Phase 0: free beta via `npx storyline-cli init`

_Last updated: 2026-04-21_

## Context & goal

Phase 0 is the free, technical-user beta. Audience: writers who already use VS Code and have Node installed — or are willing to follow two written steps. The goal is to get the current product (harness + VS Code extension + Claude Code skill) into the hands of real beta testers with the lowest-possible setup friction that doesn't require us to build a bespoke installer.

"Done" means: a tester can go from `npx storyline-cli init my-novel` to a running three-pane novel-writing environment inside VS Code — manuscript open, skill loaded, extension active, sample beat sheet visible — in under 90 seconds, without any further manual steps.

No rebranding. No signed installers. No VSCodium fork. Those belong to [Phase 1](distribution-phase-1.md).

## The writer's journey

1. Writer visits the landing page, reads two lines of setup ("needs VS Code + Node 20+").
2. Runs in their terminal:
   ```
   npx storyline-cli init my-novel
   cd my-novel
   code .
   ```
3. VS Code opens. The Storyline extension activates (triggered by `.storyline/state.json`). The three-pane layout is pre-set: Explorer on the left, the sample opening chapter in the middle editor, a supporting doc (`docs/welcome.md`) opened to the side via the new `openToSide` command.
4. Writer types `/storyline` in Claude Code — the skill is already present in `.claude/skills/storyline/`, so the harness responds immediately with the Save the Cat onboarding flow.
5. Writer starts planning, or opens the sample chapter and starts writing.

If the writer doesn't have the `code` CLI on PATH, step 2 substitutes: they open VS Code manually and use File > Open Folder. The `init` command prints this fallback if it can't find `code`.

## What `npx storyline-cli init <name>` creates

New subcommand on the existing `bin/storyline.js`. It scaffolds a project directory with:

```
my-novel/
├── .storyline/
│   └── state.json                 # Seed state — empty beat sheet, no genre chosen
├── .claude/
│   └── skills/
│       └── novel/                 # Full skill copy from skill/*
│           ├── SKILL.md
│           └── docs/...
├── .vscode/
│   ├── extensions.json            # Recommends darrenjcoxon.storyline-vscode
│   └── settings.json              # files.autoSave=off (we do our own), editor.wordWrap=on
├── CLAUDE.md                      # Project-scoped Claude instructions (the /storyline command)
├── manuscript/
│   └── chapter-01.md              # Placeholder so the editor has something to open
├── docs/
│   └── welcome.md                 # Opened "to the side" on first launch — explains the UI
├── output/                        # Compile outputs will land here
└── package.json                   # Optional — gives writers a way to update the harness itself
```

The scaffold is built from a `templates/` directory shipped inside the npm package (new — doesn't exist yet). Keep the templates as literal files rather than string-concatenated in JS so they're easy to read and modify.

## Extension install

The `.vsix` is bundled inside the npm package at `vscode-extension/storyline-vscode-0.20.0.vsix` (already built). After scaffolding, `init`:

1. Runs `code --install-extension <absolute path to bundled .vsix>` in a subprocess.
2. On success: prints "Extension installed — run `code .` in this folder to open Storyline."
3. On failure (no `code` CLI on PATH): prints the fallback instruction:
   > The VS Code CLI isn't on your PATH. Open VS Code, then:
   > - Run "Extensions: Install from VSIX..." from the Command Palette
   > - Choose: `<absolute path>/storyline-vscode-0.20.0.vsix`

Detection: try `which code` / `where.exe code`. Don't shell out to `code` without first confirming it exists — a failing subprocess is confusing.

## Claude Code skill install

The skill is copied into the scaffolded project's `.claude/skills/storyline/` on init, not into the user's home. Scoped-per-project means:

- Beta testers can run multiple novel projects without cross-contamination.
- If the skill changes between releases, each new project gets the current version.
- No permissions weirdness writing to `~/.claude/` on behalf of the user.

Source: the `skill/` directory at the root of the npm package. Destination: `my-novel/.claude/skills/storyline/`. Straight recursive copy.

## Zip fallback for non-Node users

For testers who don't have Node installed (or don't want to install it), ship a zip at each release:

```
storyline-starter-v1.0.0.zip
├── my-novel/                      # Exact contents of what `npx init` would produce
├── storyline-vscode-0.20.0.vsix
└── README.txt                     # 5-line install guide
```

The README.txt:
```
1. Unzip this file anywhere.
2. Open VS Code.
3. Extensions panel → "..." menu → "Install from VSIX..." → select the .vsix file.
4. File → Open Folder → select the "my-novel" folder.
5. Start writing. Claude Code users: /storyline in chat to begin planning.
```

The zip is built as part of the release pipeline — a single `scripts/build-starter-zip.mjs` that runs after `npm run package` inside the extension and packages both artefacts.

## npm publish mechanics

Changes needed to the root `package.json`:

```jsonc
{
  "name": "storyline-cli",
  "version": "1.0.0",             // Bump from current
  "bin": {
    "storyline": "./bin/storyline.js"
  },
  "files": [                       // Whitelist — replaces .npmignore guessing
    "bin/",
    "lib/",
    "skill/",
    "templates/",                  // New directory for scaffold assets
    "vscode-extension/storyline-vscode-*.vsix"  // Bundled extension
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/DarrenJCoxon/storyline"
  },
  "homepage": "https://github.com/DarrenJCoxon/storyline#readme",
  "keywords": ["novel", "writing", "save-the-cat", "claude", "vscode"],
  "license": "MIT",
  "engines": { "node": ">=20" }
}
```

A `prepublishOnly` script should run `npm test` and verify the bundled `.vsix` exists, so no publish ships a broken bundle.

## Prerelease sanity check

Before the first publish:

```bash
npm test                                            # 255/255 passing already
cd vscode-extension && npm run package && cd ..     # Rebuild the .vsix
npm pack                                            # Produces storyline-cli-1.0.0.tgz
npx ./storyline-cli-1.0.0.tgz init /tmp/test-novel  # Install from the tarball
cd /tmp/test-novel && code .                        # Should open with extension active
```

If the whole flow works end-to-end from a clean tarball, publish.

## Prove-it gate

Following the [roadmap](roadmap.md) convention of outcome-led milestones: Phase 0 is not "done" when the code works. It's done when:

- 3 external beta testers have run `npx storyline-cli init`
- All 3 have opened the project in VS Code, written at least one chapter, and compiled to EPUB
- Feedback has been collected on the install flow specifically (where did it break, where was the friction)

Anything below that bar means the install story isn't ready for wider distribution.

## Out of scope for Phase 0

- Rebranding or white-labelling of VS Code
- Signed DMG / exe installers
- Windows-specific install polish beyond "works"
- Auto-update mechanism for the extension or CLI
- Bundling Claude Code itself (prerequisite, not included)
- App-store distribution
- Telemetry or crash reporting
- Paid tier / license keys

All of those are [Phase 1](distribution-phase-1.md) territory.
