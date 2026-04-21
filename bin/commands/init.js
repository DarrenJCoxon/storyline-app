// storyline init command — installs /storyline skill into current directory
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, cpSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { ensureCompileConfig } from '../../lib/config/compile-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PACKAGE_ROOT = resolve(__dirname, '../..');

export function registerInit(program) {
  program
    .command('init [project-name]')
    .description('Install /storyline skill into current directory and configure for novel writing')
    .option('--yes', 'Accept all defaults without prompting')
    .action(async (projectName, options) => {
      const targetDir = projectName ? resolve(process.cwd(), projectName) : process.cwd();

      let resolvedName = projectName;
      if (!resolvedName) {
        try {
          const pkgPath = resolve(targetDir, 'package.json');
          if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            resolvedName = pkg.name || 'novel';
          } else {
            resolvedName = 'novel';
          }
        } catch {
          resolvedName = 'novel';
        }
      }

      console.log(chalk.bold(`\n✏️  Storyline — Initializing\n`));
      console.log(chalk.dim(`  Project: ${chalk.cyan(resolvedName)}\n`));

      // Step 1: Create .storyline directory
      const storylineDir = resolve(targetDir, '.storyline');
      const stateFile = resolve(storylineDir, 'state.json');

      if (!existsSync(storylineDir)) {
        mkdirSync(storylineDir, { recursive: true });
        console.log(chalk.dim(`  ✓ Created .storyline/`));
      } else {
        console.log(chalk.dim(`  ✓ .storyline/ already exists`));
      }

      // Step 2: Create initial state if it doesn't exist
      if (!existsSync(stateFile)) {
        const initialState = {
          _meta: {
            projectTitle: resolvedName,
            projectPath: targetDir,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          stages: {},
          genre: {
            primaryGenre: null,
            subGenre: null,
            targetWordCount: 80000,
            tone: null,
            audience: null,
            genreVariant: 'standard',
          },
          premise: {
            rawLogline: null,
            conceptHook: null,
            seriesPotential: null,
            seriesContext: { isSeries: false },
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
          writing: {
            manuscriptPath: 'manuscript',
          },
        };

        writeFileSync(stateFile, JSON.stringify(initialState, null, 2));
        console.log(chalk.dim(`  ✓ Created state file`));
      } else {
        console.log(chalk.dim(`  ✓ State file already exists`));
      }

      // Step 3: Create .env file from .env.example if .env doesn't exist
      const envFile = resolve(targetDir, '.env');
      const envExample = resolve(targetDir, '.env.example');
      if (!existsSync(envFile) && existsSync(envExample)) {
        console.log(chalk.dim(`  ✓ .env.example found (copy to .env and add OpenRouter key for AI critique)`));
      } else if (!existsSync(envFile) && !existsSync(envExample)) {
        copyFileSync(resolve(PACKAGE_ROOT, '.env.example'), envFile);
        console.log(chalk.dim(`  ✓ Created .env from .env.example`));
      } else if (existsSync(envFile)) {
        console.log(chalk.dim(`  ✓ .env already exists`));
      }

      // Step 4: Create output directory (harness-generated planning artefacts)
      const outputDir = resolve(targetDir, 'output');
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
        console.log(chalk.dim(`  ✓ Created output/ (for harness-generated planning docs)`));
      }

      // Step 4b: Create manuscript directory (writer's prose lives here)
      const manuscriptDir = resolve(targetDir, 'manuscript');
      const manuscriptReadme = resolve(manuscriptDir, 'README.md');
      if (!existsSync(manuscriptDir)) {
        mkdirSync(manuscriptDir, { recursive: true });
        const readmeContent = `# Manuscript

Your novel's prose lives here. One \`.md\` file per chapter is the usual pattern:

\`\`\`
manuscript/
├── ch01-opening.md
├── ch02-the-arrival.md
├── ch03-first-clue.md
└── ...
\`\`\`

Word counts shown in the Storyline VS Code extension's status bar scan
only this folder — so planning docs in \`output/\` and notes elsewhere don't
inflate the total.

If you prefer a different layout (e.g. \`chapters/\` or \`drafts/\`), edit
\`.storyline/state.json\` and change \`writing.manuscriptPath\` to the
folder you want scanned.

Delete this README once you've got your first chapter file in here.
`;
        writeFileSync(manuscriptReadme, readmeContent);
        console.log(chalk.dim(`  ✓ Created manuscript/ (writer's prose folder)`));
      } else {
        console.log(chalk.dim(`  ✓ manuscript/ already exists`));
      }

      // Step 4c: Create compile.config.json with git-derived defaults so
      // the writer never has to hand-craft JSON for a first compile.
      const compileConfigResult = await ensureCompileConfig(targetDir);
      if (compileConfigResult.created) {
        const author = compileConfigResult.config?.metadata?.author || '(not set)';
        console.log(chalk.dim(`  ✓ Created compile.config.json (author: ${author})`));
      } else {
        console.log(chalk.dim(`  ✓ compile.config.json already exists`));
      }

      // Step 5: Create CLAUDE.md if it doesn't exist
      const claudeMd = resolve(targetDir, 'CLAUDE.md');
      const projectClaueMd = resolve(PACKAGE_ROOT, 'CLAUDE.md');
      if (!existsSync(claudeMd)) {
        copyFileSync(projectClaueMd, claudeMd);
        console.log(chalk.dim(`  ✓ Created CLAUDE.md`));
      } else {
        console.log(chalk.dim(`  ✓ CLAUDE.md already exists`));
      }

      // Step 6: Copy the /storyline skill into .claude/skills/storyline/ so
      // Claude Code recognises the slash command inside this project. Scoped
      // per-project (not into ~/.claude) so each project pins its own skill
      // version and multi-project users don't get cross-contamination.
      const skillSrc = resolve(PACKAGE_ROOT, 'skill');
      const skillDst = resolve(targetDir, '.claude', 'skills', 'storyline');
      if (existsSync(skillSrc) && !existsSync(skillDst)) {
        mkdirSync(dirname(skillDst), { recursive: true });
        cpSync(skillSrc, skillDst, { recursive: true });
        console.log(chalk.dim(`  ✓ Installed /storyline skill into .claude/skills/storyline/`));
      } else if (existsSync(skillDst)) {
        console.log(chalk.dim(`  ✓ /storyline skill already present`));
      }

      // Step 7: Install the bundled VS Code extension (storyline-vscode-*.vsix)
      // via the `code` CLI if available. Falls back to printing instructions.
      // The extension activates on workspaces containing .storyline/state.json,
      // which we just created — so the writer gets the rich editor, compile
      // commands, and preview the moment they open this folder in VS Code.
      const vsixPath = findBundledVsix(PACKAGE_ROOT);
      if (vsixPath) {
        const installed = tryInstallVsix(vsixPath);
        if (installed === 'ok') {
          console.log(chalk.dim(`  ✓ Installed Storyline VS Code extension`));
        } else if (installed === 'no-code-cli') {
          console.log(chalk.yellow(`  ⚠ VS Code 'code' CLI not found on PATH.`));
          console.log(chalk.dim(`    To install the extension manually:`));
          console.log(chalk.dim(`      1. Open VS Code`));
          console.log(chalk.dim(`      2. Cmd/Ctrl+Shift+P → "Extensions: Install from VSIX..."`));
          console.log(chalk.dim(`      3. Choose: ${vsixPath}`));
        } else {
          console.log(chalk.yellow(`  ⚠ Extension install failed — install manually from: ${vsixPath}`));
        }
      } else {
        console.log(chalk.yellow(`  ⚠ No bundled .vsix found — extension install skipped`));
      }

      console.log(chalk.bold(`\n✅ Initialized: ${chalk.cyan(resolvedName)}\n`));
      console.log(chalk.dim(`  Next steps:`));
      console.log(chalk.dim(`    cd ${projectName || '.'}`));
      console.log(chalk.dim(`    code .                 ${chalk.dim('# open the project in VS Code')}`));
      console.log(chalk.dim(`    Then type ${chalk.white('/storyline')} in Claude Code to start planning.\n`));
    });
}

// ── helpers ──────────────────────────────────────────────────────

function findBundledVsix(packageRoot) {
  const vsixDir = resolve(packageRoot, 'vscode-extension');
  if (!existsSync(vsixDir)) return null;
  const files = readdirSync(vsixDir).filter(f => f.startsWith('storyline-vscode-') && f.endsWith('.vsix'));
  if (files.length === 0) return null;
  // Prefer the highest-versioned vsix if multiple exist.
  files.sort().reverse();
  return resolve(vsixDir, files[0]);
}

function tryInstallVsix(vsixPath) {
  // Probe for the `code` CLI. spawnSync returns status !== null only when the
  // binary was reachable (even if it then errored). ENOENT means the command
  // isn't on PATH at all — that's our fallback signal.
  const probe = spawnSync('code', ['--version'], { stdio: 'ignore' });
  if (probe.error && probe.error.code === 'ENOENT') return 'no-code-cli';
  if (probe.status !== 0) return 'error';

  const install = spawnSync('code', ['--install-extension', vsixPath, '--force'], {
    stdio: 'ignore',
  });
  return install.status === 0 ? 'ok' : 'error';
}