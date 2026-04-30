// Distribution orchestrator — fan-out from a single themed context to
// every configured output target, then write a manifest.json.
//
// Targets are read from compile.config.json:
//   distribution.targets: ["apple", "kindle", "kobo", "kdp-paperback"]
//
// Default targets when not configured: ["apple", "kindle", "kdp-paperback"]
//
// EPUB targets run sequentially (shared epub library isn't threadsafe).
// Print targets can run in parallel since they use separate Puppeteer instances.

import { resolve } from 'path';
import { writeFile, ensureDir, pathExists, readFile } from 'fs-extra';
import { packageEpub } from './epub.js';
import { packagePrintPdf } from './print-pdf.js';
import { generateCoverPdf } from './cover-generator.js';
import {
  resolveTargets,
  isEpubTarget,
  isPrintTarget,
  getEpubProfile,
  getPrintBleed,
} from './profiles/index.js';
import { TRIMS, DEFAULT_TRIM } from './trims/index.js';
import { DEFAULT_PAPER_STOCK } from './spine-calculator.js';

export async function distributeOutputs(context) {
  const { projectPath, assembly, theme } = context;
  const metadata = assembly.metadata;

  const config    = await readCompileConfig(projectPath);
  const distCfg   = config?.distribution || {};
  const targets   = resolveTargets(config);

  const outputDir = resolve(projectPath, 'output', 'compiled');
  await ensureDir(outputDir);

  const outputs = [];

  // ── EPUB targets ──────────────────────────────────────────────

  for (const target of targets.filter(isEpubTarget)) {
    try {
      const result = await compileEpubTarget(context, target, distCfg, outputDir);
      outputs.push(result);
    } catch (err) {
      outputs.push({ target, format: 'epub', error: err.message });
    }
  }

  // ── Print targets ────────────────────────────────────────────

  const printTargets = targets.filter(isPrintTarget);
  await Promise.all(printTargets.map(async target => {
    try {
      const result = await compilePrintTarget(context, target, distCfg, outputDir, config);
      outputs.push(result);
    } catch (err) {
      outputs.push({ target, format: 'print-pdf', error: err.message });
    }
  }));

  // ── Manifest ─────────────────────────────────────────────────

  const manifest = buildManifest(metadata, context, outputs, config);
  await writeFile(resolve(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  context.outputs = outputs;
  context.manifest = manifest;
  // Populate context.output with first successful result for back-compat logging
  const first = outputs.find(o => !o.error);
  if (first) context.output = { path: first.file || first.files?.[0], bytes: first.size };

  return context;
}

// ── EPUB target ────────────────────────────────────────────────────

async function compileEpubTarget(baseCtx, target, distCfg, outputDir) {
  const profile   = getEpubProfile(target);
  const profileCss = profile.applyProfileCss();
  const metadata  = profile.applyProfileMetadata({ ...baseCtx.assembly.metadata });

  // Clone theme with profile CSS appended
  const theme = profileCss
    ? { ...baseCtx.theme, css: baseCtx.theme.css + '\n\n/* ' + profile.label + ' profile */\n' + profileCss }
    : baseCtx.theme;

  // Run epub packager with modified context copy
  const ctx = { ...baseCtx, theme, assembly: { ...baseCtx.assembly, metadata } };
  await packageEpub(ctx);

  // Rename to target-specific filename
  const { path: origPath, bytes } = ctx.output;
  const slug = origPath.split('/').pop().replace(/\.epub$/, '');
  const targetPath = resolve(outputDir, `${slug}-${profile.filenameSuffix}.epub`);
  if (origPath !== targetPath) {
    const { rename } = await import('fs/promises');
    await rename(origPath, targetPath).catch(() => {});
  }

  return {
    target,
    format: 'epub',
    file: targetPath,
    size: bytes,
    warnings: [],
  };
}

// ── Print target ───────────────────────────────────────────────────

async function compilePrintTarget(baseCtx, target, distCfg, outputDir, config) {
  const targetCfg  = distCfg[target] || {};
  const trimId     = targetCfg.trim || config?.pdf?.trim || DEFAULT_TRIM;
  const paperStock = targetCfg.paperStock || distCfg.paperStock || DEFAULT_PAPER_STOCK;
  const bleed      = getPrintBleed(target);

  // Run interior PDF (bleed CSS handled via trim layer; interior bleed = no extra pages)
  const ctx = { ...baseCtx, trim: trimId };
  await packagePrintPdf(ctx);

  const interiorPath = ctx.output.path;
  const interiorSize = ctx.output.bytes;
  const estimatedPages = baseCtx.preflight?.estimatedPages ?? null;

  // Run cover PDF (if cover image exists or we generate a placeholder)
  let coverResult = null;
  if (target !== 'digital-pdf') {
    try {
      coverResult = await generateCoverPdf({
        metadata:       baseCtx.assembly.metadata,
        projectPath:    baseCtx.projectPath,
        outputDir,
        trimId,
        bleedIn:        bleed.cover,
        paperStock,
        estimatedPages,
        filenameSuffix: `${target}-cover`,
        themeCss:       baseCtx.theme.css,
      });
    } catch (err) {
      coverResult = { error: err.message };
    }
  }

  const result = {
    target,
    format: 'print-pdf',
    files: [interiorPath],
    size: interiorSize,
    trim: trimId,
    warnings: [],
  };

  if (coverResult && !coverResult.error) {
    result.files.push(coverResult.path);
    result.spineWidth = coverResult.spineWidth;
    result.pageCount  = coverResult.pageCount;
    result.paperStock = coverResult.paperStock;
    result.coverSize  = coverResult.bytes;
  } else if (coverResult?.error) {
    result.warnings.push(`Cover PDF failed: ${coverResult.error}`);
  }

  return result;
}

// ── Manifest ───────────────────────────────────────────────────────

function buildManifest(metadata, context, outputs, config) {
  return {
    book: {
      title:    metadata.title,
      author:   metadata.author,
      isbn:     metadata.isbn || null,
    },
    compiledAt: new Date().toISOString(),
    bookStyle:  config?.bookStyle || config?.theme || 'classic-serif',
    outputs:    outputs.map(o => ({
      target:    o.target,
      format:    o.format,
      ...(o.file  ? { file: relative(context.projectPath, o.file) }   : {}),
      ...(o.files ? { files: o.files.map(f => relative(context.projectPath, f)) } : {}),
      ...(o.size  ? { size: o.size } : {}),
      ...(o.trim        ? { trim: o.trim }             : {}),
      ...(o.spineWidth  ? { spineWidth: o.spineWidth } : {}),
      ...(o.paperStock  ? { paperStock: o.paperStock } : {}),
      warnings: o.warnings || [],
      ...(o.error ? { error: o.error } : {}),
    })),
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function relative(base, abs) {
  return abs.startsWith(base) ? abs.slice(base.length).replace(/^\//, '') : abs;
}

async function readCompileConfig(projectPath) {
  const p = resolve(projectPath, 'compile.config.json');
  if (!(await pathExists(p))) return null;
  try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return null; }
}
