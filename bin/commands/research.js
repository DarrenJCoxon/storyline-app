import chalk from 'chalk';
import { resolve } from 'path';
import { addItem, getItem, editItem, removeItem, listItems } from '../../lib/research/capture.js';
import { rebuildIndex, syncResearchToMemory } from '../../lib/research/index.js';
import { addLink, buildLinkSummary } from '../../lib/research/linker.js';
import { buildRetrievalPayload, searchItems } from '../../lib/research/retrieval.js';
import { analyzeGaps, formatGapsReport } from '../../lib/research/critique.js';
import { ITEM_SUBTYPES, RELIABILITY_TIERS, VERIFICATION_STATES } from '../../lib/research/schema.js';

export function registerResearch(program) {
  const research = program
    .command('research')
    .description('Research capture and retrieval (used by /storyline and /storyline-nf)');

  // ── add ──────────────────────────────────────────────────────────────
  research
    .command('add')
    .description('Add a research item')
    .requiredOption('--title <title>', 'Item title')
    .option('--content <content>', 'Item content (longer text — use stdin for multiline)', '')
    .option('--subtype <subtype>', `Item subtype (${ITEM_SUBTYPES.join(', ')})`, 'note')
    .option('--reliability <tier>', `Reliability tier (${RELIABILITY_TIERS.join(', ')})`, 'secondary')
    .option('--verification <state>', `Verification state (${VERIFICATION_STATES.join(', ')})`, 'pending')
    .option('--tags <tags>', 'Comma-separated tags', '')
    .option('--sources <sources>', 'Comma-separated sources/citations', '')
    .option('--link <target>', 'Link to a target immediately (e.g. chapter:5)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const projectDir = resolve(process.cwd());
      try {
        const tags = opts.tags ? opts.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
        const sources = opts.sources ? opts.sources.split(',').map(s => s.trim()).filter(Boolean) : [];
        const links = opts.link ? [opts.link] : [];

        const item = await addItem(projectDir, {
          title: opts.title,
          content: opts.content,
          subtype: opts.subtype,
          reliability: opts.reliability,
          verification: opts.verification,
          tags,
          sources,
          links,
        });

        if (opts.json) {
          console.log(JSON.stringify(item, null, 2));
        } else {
          console.log(chalk.green(`Added: ${item.title}`));
          console.log(chalk.dim(`  ID: ${item.id}`));
          if (tags.length) console.log(chalk.dim(`  Tags: ${tags.join(', ')}`));
          if (links.length) console.log(chalk.dim(`  Linked: ${links.join(', ')}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ── edit ─────────────────────────────────────────────────────────────
  research
    .command('edit')
    .description('Edit a research item')
    .argument('<id>', 'Research item ID (res-...)')
    .option('--title <title>', 'New title')
    .option('--content <content>', 'New content')
    .option('--subtype <subtype>', 'New subtype')
    .option('--reliability <tier>', 'New reliability tier')
    .option('--verification <state>', 'New verification state')
    .option('--tags <tags>', 'Replace tags (comma-separated)')
    .option('--sources <sources>', 'Replace sources (comma-separated)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (id, opts) => {
      const projectDir = resolve(process.cwd());
      try {
        const updates = {};
        if (opts.title) updates.title = opts.title;
        if (opts.content !== undefined) updates.content = opts.content;
        if (opts.subtype) updates.subtype = opts.subtype;
        if (opts.reliability) updates.reliability = opts.reliability;
        if (opts.verification) updates.verification = opts.verification;
        if (opts.tags) updates.tags = opts.tags.split(',').map(s => s.trim()).filter(Boolean);
        if (opts.sources) updates.sources = opts.sources.split(',').map(s => s.trim()).filter(Boolean);

        const item = await editItem(projectDir, id, updates);

        if (opts.json) {
          console.log(JSON.stringify(item, null, 2));
        } else {
          console.log(chalk.green(`Updated: ${item.title}`));
          console.log(chalk.dim(`  ID: ${item.id}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ── rm ───────────────────────────────────────────────────────────────
  research
    .command('rm')
    .description('Remove a research item')
    .argument('<id>', 'Research item ID (res-...)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (id, opts) => {
      const projectDir = resolve(process.cwd());
      try {
        const removed = await removeItem(projectDir, id);
        if (opts.json) {
          console.log(JSON.stringify({ removed, id }, null, 2));
        } else if (removed) {
          console.log(chalk.green(`Removed: ${id}`));
        } else {
          console.log(chalk.yellow(`Not found: ${id}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ── link ─────────────────────────────────────────────────────────────
  research
    .command('link')
    .description('Link a research item to a chapter, scene, or stage')
    .argument('<id>', 'Research item ID')
    .requiredOption('--to <target>', 'Link target (e.g. chapter:5, scene:ch5-s2, stage:beatSheet)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (id, opts) => {
      const projectDir = resolve(process.cwd());
      try {
        const item = await addLink(projectDir, id, opts.to);
        if (opts.json) {
          console.log(JSON.stringify({ linked: true, id, target: opts.to, links: item.links }, null, 2));
        } else {
          console.log(chalk.green(`Linked ${item.title} → ${opts.to}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ── search ────────────────────────────────────────────────────────────
  research
    .command('search')
    .description('Search research items by title, content, or tags')
    .argument('<query>', 'Search query')
    .option('--chapter <n>', 'Filter to items linked to chapter number', parseInt)
    .option('--subtype <subtype>', 'Filter by subtype')
    .option('--verification <state>', 'Filter by verification state')
    .option('--json', 'Output machine-readable JSON')
    .action(async (query, opts) => {
      const projectDir = resolve(process.cwd());
      try {
        let items;
        if (opts.chapter) {
          const payload = await buildRetrievalPayload(projectDir, { chapterNumber: opts.chapter, query });
          items = payload.items;
        } else {
          items = await searchItems(projectDir, query);
        }

        if (opts.subtype) items = items.filter(i => i.subtype === opts.subtype);
        if (opts.verification) items = items.filter(i => i.verification === opts.verification);

        if (opts.json) {
          console.log(JSON.stringify({ query, count: items.length, items }, null, 2));
          return;
        }

        if (!items.length) {
          console.log(chalk.dim(`No results for "${query}"`));
          return;
        }

        console.log(chalk.bold(`\n${items.length} result(s) for "${query}":\n`));
        for (const item of items) {
          console.log(chalk.cyan(`[${item.id}]`) + ` ${item.title}`);
          console.log(chalk.dim(`  ${item.subtype} | ${item.reliability} | ${item.verification}`));
          if ((item.tags || []).length) console.log(chalk.dim(`  tags: ${item.tags.join(', ')}`));
          if ((item.links || []).length) console.log(chalk.dim(`  links: ${item.links.join(', ')}`));
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ── gaps ─────────────────────────────────────────────────────────────
  research
    .command('gaps')
    .description('Analyse research coverage gaps — thin chapters, unsourced items, disputed claims')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const projectDir = resolve(process.cwd());
      try {
        const { loadState } = await import('../../lib/state/store.js');
        const state = loadState();
        const findings = await analyzeGaps(projectDir, state);

        if (opts.json) {
          console.log(JSON.stringify(findings, null, 2));
          return;
        }

        console.log('\n' + formatGapsReport(findings) + '\n');
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ── verify ────────────────────────────────────────────────────────────
  research
    .command('verify')
    .description('Update the verification state of a research item')
    .argument('<id>', 'Research item ID')
    .argument('<state>', `New state (${VERIFICATION_STATES.join(', ')})`)
    .option('--json', 'Output machine-readable JSON')
    .action(async (id, state, opts) => {
      if (!VERIFICATION_STATES.includes(state)) {
        console.error(chalk.red(`Invalid verification state: ${state}. Use: ${VERIFICATION_STATES.join(', ')}`));
        process.exit(1);
      }
      const projectDir = resolve(process.cwd());
      try {
        const item = await editItem(projectDir, id, { verification: state });
        if (opts.json) {
          console.log(JSON.stringify({ id, verification: item.verification }, null, 2));
        } else {
          console.log(chalk.green(`${item.title} → ${item.verification}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ── rebuild ────────────────────────────────────────────────────────────
  research
    .command('rebuild')
    .description('Rebuild the research index from item files')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const projectDir = resolve(process.cwd());
      try {
        const index = await rebuildIndex(projectDir);
        if (opts.json) {
          console.log(JSON.stringify({ rebuilt: true, stats: index.stats }, null, 2));
        } else {
          console.log(chalk.green(`Index rebuilt — ${index.stats.total} item(s)`));
          console.log(chalk.dim(`  Verified: ${index.stats.byVerification.verified}`));
          console.log(chalk.dim(`  Pending: ${index.stats.byVerification.pending}`));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });

  // ── sync ─────────────────────────────────────────────────────────────
  // Sync research items to memory.jsonl so the skill can push to odd-flow MCP
  research
    .command('sync')
    .description('Build memory entries from all research items and append to memory.jsonl (skill then pushes to odd-flow MCP)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const projectDir = resolve(process.cwd());
      try {
        const { loadState } = await import('../../lib/state/store.js');
        const state = loadState();

        await rebuildIndex(projectDir);
        const { logPath, entriesWithIds } = await syncResearchToMemory(projectDir, state);

        if (opts.json) {
          console.log(JSON.stringify({
            synced: true,
            memoryEntries: entriesWithIds,
            memoryLogPath: logPath,
          }, null, 2));
        } else {
          console.log(chalk.green(`Synced ${entriesWithIds.length} memory entries`));
          console.log(chalk.dim(`  ↳ ${logPath}`));
          console.log(chalk.dim(`    Push via mcp__odd-flow__memory_store then storyline memory mark-synced <ids>`));
          console.log(JSON.stringify({
            synced: true,
            memoryEntries: entriesWithIds,
            memoryLogPath: logPath,
          }));
        }
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
