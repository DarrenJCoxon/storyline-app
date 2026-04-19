// novel-writer init command — installs /novel skill into current directory
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PACKAGE_ROOT = resolve(__dirname, '../..');

export function registerInit(program) {
  program
    .command('init [project-name]')
    .description('Install /novel skill into current directory and configure for novel writing')
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

      console.log(chalk.bold(`\n✏️  Novel Writer — Initializing\n`));
      console.log(chalk.dim(`  Project: ${chalk.cyan(resolvedName)}\n`));

      // Step 1: Create .novel-writer directory
      const novelWriterDir = resolve(targetDir, '.novel-writer');
      const stateFile = resolve(novelWriterDir, 'state.json');

      if (!existsSync(novelWriterDir)) {
        mkdirSync(novelWriterDir, { recursive: true });
        console.log(chalk.dim(`  ✓ Created .novel-writer/`));
      } else {
        console.log(chalk.dim(`  ✓ .novel-writer/ already exists`));
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

      // Step 4: Create output directory
      const outputDir = resolve(targetDir, 'output');
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
        console.log(chalk.dim(`  ✓ Created output/`));
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

      console.log(chalk.bold(`\n✅ Initialized: ${chalk.cyan(resolvedName)}\n`));
      console.log(chalk.dim(`  Run ${chalk.white('nw start')} to begin planning\n`));
    });
}