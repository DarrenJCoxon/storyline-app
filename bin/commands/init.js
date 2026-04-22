// storyline init — scaffolds a novel project and installs the Storyline
// planning harness into whichever AI coding agent(s) the writer uses.
//
// Orchestration only. Each concrete install step lives in scripts/:
//   - detect-agent.js
//   - install-claude-skills.js
//   - install-opencode-commands.js
//   - install-codex-plugin.js
//   - setup-mcp.js
//   - install-vscode-extension.js
//
// The same scaffolding (state.json, manuscript/, output/, compile.config.json,
// .env) is produced regardless of harness. Only the agent-facing skill
// packaging and MCP config format differ per harness.

import chalk from 'chalk';
import {
  existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync,
} from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureCompileConfig } from '../../lib/config/compile-config.js';
import detectAgent, { expandAgent, agentLabel } from '../../scripts/detect-agent.js';
import installClaudeSkills from '../../scripts/install-claude-skills.js';
import installOpenCodeCommands from '../../scripts/install-opencode-commands.js';
import installCodexPlugin from '../../scripts/install-codex-plugin.js';
import setupMcp from '../../scripts/setup-mcp.js';
import installVSCodeExtension, {
  requestEditorReload, tryOpenFolder,
} from '../../scripts/install-vscode-extension.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '../..');

export function registerInit(program) {
  program
    .command('init [project-name]')
    .description('Scaffold a novel project and install Storyline into your AI coding agent')
    .option('--agent <type>', 'Target agent: claude-code, opencode, codex, both, all, or auto', 'auto')
    .option('--yes', 'Accept all defaults without prompting')
    .action(async (projectName, options) => {
      const targetDir = projectName ? resolve(process.cwd(), projectName) : process.cwd();
      const resolvedName = resolveProjectName(projectName, targetDir);
      const agent = detectAgent(options.agent);
      const flags = expandAgent(agent);

      console.log(chalk.bold(`\n✏️  Storyline — Initializing\n`));
      console.log(chalk.dim(`  Project: ${chalk.cyan(resolvedName)}`));
      console.log(chalk.dim(`  Agent:   ${agentLabel(agent)}\n`));

      // ── Phase 1: project scaffolding (harness-agnostic) ───────
      createStorylineDir(targetDir);
      createInitialState(targetDir, resolvedName);
      setupEnvFile(targetDir);
      createOutputDir(targetDir);
      createManuscriptDir(targetDir);
      createDocsDir(targetDir);
      await createCompileConfig(targetDir);
      copyAgentMdFiles(targetDir, flags);

      // ── Phase 2: install skills/commands per harness ──────────
      if (flags.isClaude) {
        installClaudeSkills(PACKAGE_ROOT, targetDir, {
          log: msg => console.log(chalk.dim(`  ✓ ${msg}`)),
        });
      }
      if (flags.isOpenCode) {
        installOpenCodeCommands(PACKAGE_ROOT, targetDir, {
          log: msg => console.log(chalk.dim(`  ✓ ${msg}`)),
        });
      }
      if (flags.isCodex) {
        const pkgVersion = readOwnPackageVersion();
        installCodexPlugin(PACKAGE_ROOT, targetDir, {
          log: msg => console.log(chalk.dim(`  ✓ ${msg}`)),
          version: pkgVersion,
        });
      }

      // ── Phase 3: odd-flow MCP config for each harness ─────────
      setupMcp(flags, targetDir, {
        log: msg => console.log(chalk.dim(`  ✓ ${msg}`)),
      });

      // ── Phase 4: VS Code extension install (harness-agnostic) ─
      // Writers on any harness get the TipTap editor + compile
      // commands + live preview by installing the .vsix into
      // whichever VS Code-family editor they're using.
      const vscodeResult = installVSCodeExtension(PACKAGE_ROOT);
      reportVSCodeOutcome(vscodeResult);

      // ── Phase 5: success banner + next steps ──────────────────
      console.log(chalk.bold(`\n✅ Initialized: ${chalk.cyan(resolvedName)}\n`));

      if (vscodeResult.willReload) {
        printReloadingNextSteps(vscodeResult.editor, flags);
        // Reload kills the terminal — fire last.
        requestEditorReload(vscodeResult.editor);
      } else {
        printManualNextSteps(vscodeResult, flags);
      }
    });
}

// ── scaffolding helpers ───────────────────────────────────────────

function resolveProjectName(projectName, targetDir) {
  if (projectName) return projectName;
  try {
    const pkgPath = resolve(targetDir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return pkg.name || 'novel';
    }
  } catch { /* fall through */ }
  return 'novel';
}

function createStorylineDir(targetDir) {
  const dir = resolve(targetDir, '.storyline');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(chalk.dim(`  ✓ Created .storyline/`));
  } else {
    console.log(chalk.dim(`  ✓ .storyline/ already exists`));
  }
}

function createInitialState(targetDir, resolvedName) {
  const stateFile = resolve(targetDir, '.storyline', 'state.json');
  if (existsSync(stateFile)) {
    console.log(chalk.dim(`  ✓ State file already exists`));
    return;
  }
  const initialState = {
    _meta: {
      projectTitle: resolvedName,
      projectPath: targetDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    stages: {},
    genre: {
      primaryGenre: null, subGenre: null, targetWordCount: 80000,
      tone: null, audience: null, genreVariant: 'standard',
    },
    premise: {
      rawLogline: null, conceptHook: null,
      seriesPotential: null, seriesContext: { isSeries: false },
    },
    protagonist: {},
    characters: [],
    relationships: [],
    logline: {},
    beatSheet: { genreVariant: 'standard', beats: {} },
    bStory: {},
    subplots: [],
    sceneOutline: { highLevel: [], approved: false, fleshedChapters: [] },
    plotThreads: [],
    chapterOutline: [],
    critique: { flaggedIssues: [], resolvedIssues: [] },
    masterDoc: {},
    writing: { manuscriptPath: 'manuscript' },
  };
  writeFileSync(stateFile, JSON.stringify(initialState, null, 2));
  console.log(chalk.dim(`  ✓ Created state file`));
}

function setupEnvFile(targetDir) {
  const envFile = resolve(targetDir, '.env');
  const envExample = resolve(targetDir, '.env.example');
  if (existsSync(envFile)) {
    console.log(chalk.dim(`  ✓ .env already exists`));
  } else if (existsSync(envExample)) {
    console.log(chalk.dim(`  ✓ .env.example found (copy to .env and add OpenRouter key for AI critique)`));
  } else {
    copyFileSync(resolve(PACKAGE_ROOT, '.env.example'), envFile);
    console.log(chalk.dim(`  ✓ Created .env from .env.example`));
  }
}

function createOutputDir(targetDir) {
  const dir = resolve(targetDir, 'output');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(chalk.dim(`  ✓ Created output/ (for harness-generated planning docs)`));
  }
}

function createManuscriptDir(targetDir) {
  const manuscriptDir = resolve(targetDir, 'manuscript');
  if (existsSync(manuscriptDir)) {
    // Directory already there — don't overwrite, but ensure the seed
    // chapter exists for writers following the README's first-five-minutes
    // flow. If they already have their own chapter-01.md we leave it alone.
    const chapter = resolve(manuscriptDir, 'chapter-01.md');
    if (!existsSync(chapter)) {
      writeFileSync(chapter, SEED_CHAPTER);
      console.log(chalk.dim(`  ✓ Added chapter-01.md to existing manuscript/`));
    } else {
      console.log(chalk.dim(`  ✓ manuscript/ already exists`));
    }
    return;
  }
  mkdirSync(manuscriptDir, { recursive: true });
  writeFileSync(resolve(manuscriptDir, 'README.md'), MANUSCRIPT_README);
  writeFileSync(resolve(manuscriptDir, 'chapter-01.md'), SEED_CHAPTER);
  console.log(chalk.dim(`  ✓ Created manuscript/ with chapter-01.md`));
}

function createDocsDir(targetDir) {
  const docsDir = resolve(targetDir, 'docs');
  const welcomePath = resolve(docsDir, 'welcome.md');
  if (existsSync(welcomePath)) {
    console.log(chalk.dim(`  ✓ docs/welcome.md already exists`));
    return;
  }
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(welcomePath, WELCOME_DOC);
  console.log(chalk.dim(`  ✓ Created docs/welcome.md`));
}

async function createCompileConfig(targetDir) {
  const result = await ensureCompileConfig(targetDir);
  if (result.created) {
    const author = result.config?.metadata?.author || '(not set)';
    console.log(chalk.dim(`  ✓ Created compile.config.json (author: ${author})`));
  } else {
    console.log(chalk.dim(`  ✓ compile.config.json already exists`));
  }
}

// Copy per-harness primer files. Every project gets CLAUDE.md (legacy
// convention, harmless for other harnesses). Projects with Codex or
// OpenCode in the agent set also get AGENTS.md — the vendor-neutral
// equivalent that Codex auto-reads and that primes natural-language
// activation phrases like "use storyline".
function copyAgentMdFiles(targetDir, flags) {
  const claudeMd = resolve(targetDir, 'CLAUDE.md');
  const projectClaudeMd = resolve(PACKAGE_ROOT, 'CLAUDE.md');
  if (!existsSync(claudeMd) && existsSync(projectClaudeMd)) {
    copyFileSync(projectClaudeMd, claudeMd);
    console.log(chalk.dim(`  ✓ Created CLAUDE.md`));
  } else if (existsSync(claudeMd)) {
    console.log(chalk.dim(`  ✓ CLAUDE.md already exists`));
  }

  // AGENTS.md — required for Codex, helpful for any agent that reads it.
  // Install whenever OpenCode or Codex are in the agent set.
  if (flags.isOpenCode || flags.isCodex) {
    const agentsMd = resolve(targetDir, 'AGENTS.md');
    const templateAgentsMd = resolve(PACKAGE_ROOT, 'templates', 'AGENTS.md');
    if (!existsSync(agentsMd) && existsSync(templateAgentsMd)) {
      copyFileSync(templateAgentsMd, agentsMd);
      console.log(chalk.dim(`  ✓ Created AGENTS.md`));
    } else if (existsSync(agentsMd)) {
      console.log(chalk.dim(`  ✓ AGENTS.md already exists`));
    }
  }
}

function readOwnPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf-8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

// ── VS Code extension outcome reporting ───────────────────────────

function reportVSCodeOutcome(result) {
  const { outcome, editor, vsixPath, legacyRemoved } = result;
  if (outcome === 'ok') {
    console.log(chalk.dim(`  ✓ Installed and verified Storyline extension into ${editor.name}`));
    if (legacyRemoved && legacyRemoved.length) {
      for (const id of legacyRemoved) {
        console.log(chalk.dim(`  ✓ Removed legacy extension ${id}`));
      }
    }
    return;
  }
  if (outcome === 'no-vsix') {
    console.log(chalk.yellow(`  ⚠ No bundled .vsix found — VS Code extension install skipped`));
    return;
  }
  if (outcome === 'not-registered') {
    console.log(chalk.yellow(`  ⚠ Extension install exited cleanly but ${editor.name} doesn't list it.`));
    console.log(chalk.dim(`    Install manually — Cmd/Ctrl+Shift+P → "Extensions: Install from VSIX..."`));
    console.log(chalk.bold(`    ${vsixPath}`));
    tryOpenFolder(dirname(vsixPath));
    return;
  }
  if (outcome === 'no-cli') {
    console.log(chalk.yellow(`  ⚠ Couldn't find the ${editor.name} command-line binary.`));
    console.log(chalk.dim(`    To install the extension manually:`));
    console.log(chalk.dim(`      1. Focus ${editor.name}`));
    console.log(chalk.dim(`      2. Cmd/Ctrl+Shift+P → "Extensions: Install from VSIX..."`));
    console.log(chalk.dim(`      3. Choose this file:`));
    console.log(chalk.bold(`         ${vsixPath}`));
    tryOpenFolder(dirname(vsixPath));
    return;
  }
  // 'error' or anything else
  console.log(chalk.yellow(`  ⚠ Extension install command failed. Install manually:`));
  console.log(chalk.bold(`    ${vsixPath}`));
  tryOpenFolder(dirname(vsixPath));
}

// ── next-steps output ─────────────────────────────────────────────

function invocationForHarness(flags) {
  // Returns an array of "in X, type Y" lines covering every installed harness.
  const lines = [];
  if (flags.isClaude) lines.push(`In Claude Code: type ${chalk.white('/storyline')}`);
  if (flags.isOpenCode) lines.push(`In OpenCode: type ${chalk.white('/storyline')}`);
  if (flags.isCodex) lines.push(`In Codex: type ${chalk.white('$storyline')} or say ${chalk.white('"use storyline"')}`);
  return lines;
}

function printReloadingNextSteps(editor, flags) {
  console.log(chalk.dim(`  Reloading ${editor.name} window to activate the Storyline extension…\n`));
  console.log(chalk.dim(`  When your AI harness prompts to approve the`));
  console.log(chalk.dim(`  ${chalk.white('odd-flow')} MCP server, approve it — Storyline needs`));
  console.log(chalk.dim(`  it for durable memory across sessions.\n`));
  for (const line of invocationForHarness(flags)) {
    console.log(chalk.dim(`    ${line}`));
  }
  console.log();
}

function printManualNextSteps(vscodeResult, flags) {
  const { outcome, editor } = vscodeResult;
  console.log(chalk.dim(`  Next steps:`));
  let stepNum = 1;
  if (outcome !== 'ok' && outcome !== 'not-registered') {
    console.log(chalk.dim(`    ${stepNum++}. Install the Storyline VS Code extension using the instructions above.`));
  }
  console.log(chalk.dim(`    ${stepNum++}. Reload the ${editor.name} window (Cmd/Ctrl+Shift+P → "Reload Window")`));
  console.log(chalk.dim(`       to activate the Storyline extension.`));
  console.log(chalk.dim(`    ${stepNum++}. When your AI harness prompts to approve the ${chalk.white('odd-flow')} MCP server, approve it`));
  console.log(chalk.dim(`       (Storyline uses it for durable memory across sessions).`));
  const invocations = invocationForHarness(flags);
  if (invocations.length === 1) {
    console.log(chalk.dim(`    ${stepNum++}. ${invocations[0]} to start planning.`));
  } else {
    console.log(chalk.dim(`    ${stepNum++}. Start planning:`));
    for (const line of invocations) {
      console.log(chalk.dim(`         ${line}`));
    }
  }
  console.log();
}

// ── seeded content templates ──────────────────────────────────────

const MANUSCRIPT_README = `# Manuscript

Your novel's prose lives here. One \`.md\` file per chapter is the usual pattern:

\`\`\`
manuscript/
├── chapter-01.md
├── chapter-02.md
├── chapter-03.md
└── ...
\`\`\`

Word counts shown in the Storyline VS Code extension's status bar scan
only this folder — so planning docs in \`output/\` and notes elsewhere don't
inflate the total.

If you prefer a different layout (e.g. \`chapters/\` or \`drafts/\`), edit
\`.storyline/state.json\` and change \`writing.manuscriptPath\` to the
folder you want scanned.

Delete this README once you're comfortable with the layout.
`;

const SEED_CHAPTER = `# Chapter One

Welcome to Storyline. This is a seeded chapter file to get you started — replace this text with your own prose when you're ready.

A few things that will help as you write:

- **Your prose goes here.** Delete everything in this file and start typing. Every 1.5 seconds after you stop typing, Storyline auto-saves your work.
- **One \`.md\` file per chapter** is the usual pattern. Add \`chapter-02.md\`, \`chapter-03.md\`, and so on as you go. The status bar at the bottom of VS Code shows your total word count across the whole manuscript.
- **Leave research questions inline** in double curly braces as you draft. For example: {{check the opening times of the British Museum}}. Keep writing — don't break flow to look things up. When you're ready, type \`/follow-up\` (Claude Code / OpenCode) or \`$follow-up\` (Codex) and your AI harness will find every \`{{…}}\`, research it, and propose replacements for your approval.
- **Scene breaks** render as a centred line when you type \`* * *\` on its own line between paragraphs.
- **Compile when ready.** Press \`Cmd+Shift+P\` / \`Ctrl+Shift+P\`, type "Storyline: Compile to EPUB" or "Storyline: Compile to Print PDF", and the finished file lands in \`output/\`.

Ready when you are. Delete this placeholder and write your opening.
`;

const WELCOME_DOC = `# Welcome to Storyline

This file is a scratchpad — notes, character sheets, research, reminders to yourself — anything that isn't prose. Your novel's chapters live in \`manuscript/\`; everything supporting the novel can live here in \`docs/\`.

## The three-column layout

Storyline expects you to work in three columns:

- **Left:** the file tree (your project).
- **Middle:** this document, or whatever supporting material you're consulting right now.
- **Right:** the chapter you're writing.

To open a file in the right-hand column, right-click it in the file tree and choose **"Storyline: Open to the Side"**, or select the file in the tree and press \`Cmd+Enter\` (Mac) or \`Ctrl+Enter\` (Windows).

## Starting a planning session

Your AI coding agent (Claude Code, OpenCode, or Codex) drives the planning conversation. Open the agent and:

- **Claude Code / OpenCode:** type \`/storyline\`.
- **Codex:** type \`$storyline\` or say "use storyline".

The first time you do this, approve the \`odd-flow\` MCP server when prompted — Storyline uses it for durable memory across sessions.

The agent will walk you through 14 planning stages, starting with genre and working through to a full beat sheet and chapter outline. At any point you can switch back here and write prose in \`manuscript/chapter-01.md\`.

## What to delete, what to keep

- Delete the content of this file when you're ready — it's just an onboarding note.
- Keep \`.storyline/\` untouched (that's your planning state).
- Keep \`output/\` alone unless you want to clear old compiled EPUBs/PDFs.
- The \`manuscript/README.md\` can be deleted once you're comfortable with the folder's convention.

Happy writing.
`;

