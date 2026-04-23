// `storyline reseed <stageId>` — recovery aid for projects where the
// /storyline skill wrote a long-form doc into docs/ but never persisted
// the structured slice into state.json. Prints a precise recovery
// instruction for one stage: the required fields, the source doc to
// extract from, and the exact `save` command to run once the writer has
// assembled the JSON.
//
// This command is deliberately NOT a markdown-to-JSON parser. Parsing
// arbitrary writer-conversation markdown into the state schema is too
// brittle to be trustworthy — it would silently produce wrong state.
// Instead, reseed provides structured prompts so the writer (or the
// writer's AI in a separate chat) can assemble the JSON correctly.
//
// Paired with `storyline doctor --recover`, which enumerates all stages
// that need reseeding and points at the right `reseed` command for each.

import chalk from 'chalk';
import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { loadState } from '../../lib/state/store.js';
import { STAGE_ORDER } from '../../lib/state/project-state.js';
import { getMissingRequirements } from '../../lib/state/transitions.js';
import { getStageGuide } from '../../lib/ai/stage-guides.js';

// Mirrors lib/doctor.js DOC_PATTERNS — kept in sync deliberately. Maps
// stage IDs to the filename substrings writers (and the /storyline skill)
// typically use when they land long-form planning prose into docs/.
const STAGE_DOC_PATTERNS = {
  genre:         [/genre/i, /foundation/i],
  premise:       [/premise/i, /seed/i, /hook/i],
  protagonist:   [/protagonist/i],
  characters:    [/supporting[-_]cast/i, /characters/i],
  relationships: [/relationship/i],
  logline:       [/logline/i],
  beatSheet:     [/beat[-_]sheet/i],
  bStory:        [/b[-_]story/i],
  subplots:      [/subplot/i],
  sceneOutline:  [/scene[-_]outline/i],
  plotThreads:   [/plot[-_]thread/i],
  chapterOutline:[/chapter[-_]flesh[-_]out/i, /chapter[-_]outline/i],
  critique:      [/consistency[-_]critique/i, /^critique/i],
  masterDoc:     [/master[-_]doc/i, /master[-_]document/i],
};

function findOrphanDocs(projectPath, stageId) {
  const patterns = STAGE_DOC_PATTERNS[stageId];
  if (!patterns) return [];
  const docsDir = resolve(projectPath, 'docs');
  if (!existsSync(docsDir)) return [];
  let entries;
  try {
    entries = readdirSync(docsDir);
  } catch {
    return [];
  }
  return entries
    .filter(n => /\.md$/i.test(n))
    .filter(n => patterns.some(rx => rx.test(n)))
    .map(n => `docs/${n}`);
}

// Schema spec per stage — what structured JSON does `save <stageId>` expect?
// Source: hand-transcribed from lib/state/project-state.js DEFAULT_STATE and
// skill/SKILL.md "Saving Data" section. Represents the minimal-viable shape
// the writer must assemble.
const STAGE_SCHEMAS = {
  genre: {
    shape: 'object',
    fields: ['primaryGenre (string)', 'subGenre (string, optional)', 'tone (string)', 'audience (string)', 'targetWordCount (integer)', 'genreVariant (string, default "standard")'],
    example: `'{"primaryGenre":"Thriller","tone":"dark","audience":"Adult","targetWordCount":85000,"genreVariant":"standard"}'`,
  },
  premise: {
    shape: 'object',
    fields: ['rawLogline (string)', 'conceptHook (string)', 'seriesPotential (object, auto-detected)'],
    example: `'{"rawLogline":"A detective hunts a serial killer in Edwardian London","conceptHook":"The killer is the detective\\'s wife"}'`,
  },
  protagonist: {
    shape: 'object',
    fields: ['name', 'age (integer, optional)', 'occupation (string, optional)', 'want (external goal)', 'need (internal truth)', 'ghost (past wound)', 'flaw (self-deception)', 'coreLie (false belief)', 'arcDirection (e.g. "broken → whole")', 'voice (optional)'],
    example: `'{"name":"Jane","want":"Make partner","need":"Accept I am enough","ghost":"Father never approved","flaw":"Must control everything","coreLie":"Worth = achievement","arcDirection":"controlling → surrendering"}'`,
  },
  characters: {
    shape: 'array',
    fields: ['Array of character objects: { name, role (protagonist/antagonist/mentor/etc), wantInStory, arc }'],
    example: `'[{"name":"Alex","role":"mentor","wantInStory":"Redeem past failure","arc":"jaded → hopeful"}]'`,
  },
  relationships: {
    shape: 'array',
    fields: ['Array of relationship pairs: { a, b, connection, conflict, sharedNeed }'],
    example: `'[{"a":"Jane","b":"Alex","connection":"mentor","conflict":"Alex withholds truth","sharedNeed":"Redemption"}]'`,
  },
  logline: {
    shape: 'object',
    fields: ['sentence (final composed logline)', 'setup', 'incitingIncident', 'stakes', 'resolutionHint'],
    example: `'{"sentence":"When a detective discovers her husband is the killer...","setup":"...","incitingIncident":"...","stakes":"...","resolutionHint":"..."}'`,
  },
  beatSheet: {
    shape: 'object',
    fields: ['genreVariant (string)', 'beats (object keyed by beatId: beat01OpeningImage ... beat15EndCredits; each beat has beat-specific fields — see skill/SKILL.md)'],
    example: `echo '{"genreVariant":"standard","beats":{"beat08Midpoint":{"midpointType":"false-victory","flipOrReveal":"...","scene":"..."}}}' | npx storyline-cli save beatSheet`,
  },
  bStory: {
    shape: 'object',
    fields: ['character', 'premise', 'beats (optional)', 'resolution', 'themeConnection'],
    example: `'{"character":"Alex","premise":"Mentor and protégée","themeConnection":"Control → trust"}'`,
  },
  subplots: {
    shape: 'array',
    fields: ['Array of subplot objects: { name, arc: { setup, complication, resolution }, purpose, connection }'],
    example: `'[{"name":"Office politics","arc":{"setup":"...","complication":"...","resolution":"..."},"purpose":"raises stakes","connection":"complicates A story"}]'`,
  },
  sceneOutline: {
    shape: 'object',
    fields: ['highLevel (array of scene sequences tagged to beats)', 'approved (boolean, must be true)', 'fleshedChapters (optional)'],
    example: `'{"highLevel":[{"beatId":"beat01OpeningImage","sequence":"...","change":"..."}],"approved":true}'`,
  },
  plotThreads: {
    shape: 'array',
    fields: ['Array of plot-thread objects: { name, introduced (beat or scene), resolved (beat or scene), purpose }'],
    example: `'[{"name":"The missing letter","introduced":"beat03Catalyst","resolved":"beat13Finale","purpose":"reveals motive"}]'`,
  },
  chapterOutline: {
    shape: 'array',
    fields: ['Array of chapter objects: { chapterNumber, chapterTitle, estimatedWords, beat (beatId), scenes: [{ sceneNumber, location, timeOfDay, pov, purpose, conflict, whatChanges, beats, notes }] }'],
    example: `echo '[{"chapterNumber":1,"chapterTitle":"Opening","beat":"beat01OpeningImage","estimatedWords":3000,"scenes":[{"sceneNumber":1,"pov":"Jane","purpose":"...","conflict":"...","whatChanges":"..."}]}]' | npx storyline-cli save chapterOutline`,
  },
  critique: {
    shape: 'object',
    fields: ['flaggedIssues (array of { check, message, severity, resolution })', 'resolvedIssues (array)', 'pacingAnalysis (string)', 'characterConsistency (string)', 'beatSheetValidation (string)'],
    example: `'{"flaggedIssues":[],"pacingAnalysis":"Acts proportioned correctly","characterConsistency":"...","beatSheetValidation":"..."}'`,
  },
  masterDoc: {
    shape: 'generated',
    fields: ['NOT HAND-SAVED — run `npx storyline-cli generate` instead.'],
    example: `npx storyline-cli generate`,
  },
};

export function registerReseed(program) {
  program
    .command('reseed')
    .description('Print a precise recovery brief for a stage whose doc was written but state was never saved. Guidance-only; does not write state itself.')
    .argument('<stage>', 'Stage ID (e.g. chapterOutline, protagonist, beatSheet)')
    .action(async (stageId) => {
      const stage = STAGE_ORDER.find(s => s.id === stageId);
      if (!stage) {
        console.error(chalk.red(`Unknown stage: ${stageId}`));
        console.error(chalk.dim(`Valid stages: ${STAGE_ORDER.map(s => s.id).join(', ')}`));
        process.exit(1);
      }

      const projectPath = process.cwd();
      const stateFile = resolve(projectPath, '.storyline', 'state.json');
      if (!existsSync(stateFile)) {
        console.error(chalk.red('No project found. Run `storyline init` first.'));
        process.exit(1);
      }

      const state = loadState(projectPath);
      const orphanDocs = findOrphanDocs(projectPath, stageId);
      const schema = STAGE_SCHEMAS[stageId];
      const guide = getStageGuide(stageId);
      const missing = getMissingRequirements(stageId, state);

      const bar = '━'.repeat(60);
      console.error('');
      console.error(chalk.cyan(bar));
      console.error(chalk.cyan(`  Reseed brief — ${stage.name} (${stageId})`));
      console.error(chalk.cyan(bar));
      console.error('');

      if (orphanDocs.length > 0) {
        console.error(chalk.yellow('  Source doc(s) to extract data from:'));
        orphanDocs.forEach(p => console.error(chalk.yellow(`    • ${p}`)));
        console.error('');
      } else {
        console.error(chalk.dim('  No orphan doc found under docs/ for this stage.'));
        console.error(chalk.dim('  If you planned this stage in a different file, point yourself at it manually.'));
        console.error('');
      }

      if (missing.length > 0) {
        console.error(chalk.yellow(`  Required fields still missing from state:`));
        missing.forEach(m => console.error(chalk.yellow(`    • ${m}`)));
        console.error('');
      } else {
        console.error(chalk.green('  State already has all required fields for this stage.'));
        console.error(chalk.green('  Run `npx storyline-cli doctor` to check for other drift.'));
        console.error('');
      }

      if (schema) {
        console.error(chalk.bold(`  Expected JSON shape (${schema.shape}):`));
        schema.fields.forEach(f => console.error(`    • ${f}`));
        console.error('');
        console.error(chalk.bold('  Example invocation:'));
        console.error(`    ${schema.example}`);
        console.error('');
      }

      if (guide?.keyPoints?.length) {
        console.error(chalk.dim('  Key points for this stage:'));
        guide.keyPoints.slice(0, 5).forEach(kp => console.error(chalk.dim(`    • ${kp}`)));
        console.error('');
      }

      console.error(chalk.cyan('  Recovery workflow:'));
      console.error('    1. Open the source doc(s) above.');
      console.error('    2. Extract the structured fields by hand (or ask an AI in a separate');
      console.error('       chat to read the doc and output JSON matching the schema above).');
      console.error('    3. Run the save command with that JSON (see example above).');
      console.error(`    4. Run \`npx storyline-cli verify-stage ${stageId}\` to confirm state is consistent.`);
      console.error('');
      console.error(chalk.cyan(bar));
      console.error('');

      // Machine-readable JSON on stdout for any tooling that wants to
      // consume this programmatically (e.g. the /storyline skill could
      // automate the extract step by parsing this).
      console.log(JSON.stringify({
        stageId,
        stageName: stage.name,
        orphanDocs,
        missingFields: missing,
        schema: schema || null,
        saveCommand: schema?.example || null,
        verifyCommand: `npx storyline-cli verify-stage ${stageId}`,
      }, null, 2));
    });
}
