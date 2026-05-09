import * as path from 'path'

export type CompileFormat = 'epub' | 'print-pdf' | 'bundle'
export type PrintTrim = '6x9' | '7x10' | '8x10' | '8.5x8.5'

export interface CompileOptions {
  projectPath: string
  format: CompileFormat
  trim?: PrintTrim
  onProgress?: (phase: string) => void
}

export interface CompileResult {
  outputPath: string
  bytes: number
  warnings: string[]
}

type Phase = (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>

function toMessages(items: unknown[]): string[] {
  return items.map(w => typeof w === 'string' ? w : (w as { message?: string }).message ?? String(w))
}

export async function runCompile(opts: CompileOptions): Promise<CompileResult> {
  // CB-01b: dynamic imports now go through @storyline/runtime — the
  // canonical home of the compile pipeline. The package's `./*.js`
  // export rule maps these subpaths straight to packages/runtime/src/
  // files. No more shadow-copy in extension/lib/ + no more sync script.
  // @storyline/runtime is plain JS with no per-module .d.ts; the cast at
  // the bottom of this Promise.all gives us the structural types we
  // actually use.
  /* eslint-disable @typescript-eslint/ban-ts-comment */
  const [
    { assemble },
    { generateFrontMatter },
    { runPreflight },
    { markdownToHtml },
    { applyBookStyle },
    { packageEpub },
    { packagePrintPdf },
    { distributeOutputs },
  ] = await Promise.all([
    // @ts-ignore — runtime modules ship without per-file declarations
    import('@storyline/runtime/compile/assembler.js'),
    // @ts-ignore
    import('@storyline/runtime/compile/front-matter-generator.js'),
    // @ts-ignore
    import('@storyline/runtime/compile/preflight.js'),
    // @ts-ignore
    import('@storyline/runtime/compile/markdown-to-html.js'),
    // @ts-ignore
    import('@storyline/runtime/compile/book-style.js'),
    // @ts-ignore
    import('@storyline/runtime/compile/epub.js'),
    // @ts-ignore
    import('@storyline/runtime/compile/print-pdf.js'),
    // @ts-ignore
    import('@storyline/runtime/compile/distribution.js'),
  ]) as [
    { assemble: Phase },
    { generateFrontMatter: Phase },
    { runPreflight: Phase },
    { markdownToHtml: Phase },
    { applyBookStyle: Phase },
    { packageEpub: Phase },
    { packagePrintPdf: Phase },
    { distributeOutputs: Phase },
  ]

  let ctx: Record<string, unknown> = {
    projectPath: opts.projectPath,
    format: opts.format,
    trim: opts.trim,
  }

  opts.onProgress?.('Assembling chapters')
  ctx = await assemble(ctx)

  opts.onProgress?.('Generating front matter')
  ctx = await generateFrontMatter(ctx)

  opts.onProgress?.('Running pre-flight check')
  ctx = await runPreflight(ctx)

  const preflight = ctx.preflight as { errors?: unknown[]; warnings?: unknown[] } | undefined
  if (preflight?.errors?.length) {
    throw new Error(`Pre-flight failed:\n${toMessages(preflight.errors).join('\n')}`)
  }

  opts.onProgress?.('Converting markdown to HTML')
  ctx = await markdownToHtml(ctx)

  opts.onProgress?.('Applying theme')
  ctx = await applyBookStyle(ctx)

  // Generate research artefacts (endnotes, bibliography, fact-check report)
  // before packaging so they ship inside the EPUB/PDF. No-ops if the project
  // has no research items.
  opts.onProgress?.('Generating research artefacts')
  await generateResearchArtefacts(opts.projectPath, ctx)

  if (opts.format === 'bundle') {
    opts.onProgress?.('Distributing all targets')
    ctx = await distributeOutputs(ctx)
  } else {
    opts.onProgress?.(opts.format === 'print-pdf' ? 'Rendering PDF (may take 30s)' : 'Packaging EPUB')
    ctx = await (opts.format === 'print-pdf' ? packagePrintPdf(ctx) : packageEpub(ctx))
  }

  const output = ctx.output as { path: string; bytes: number } | undefined
  if (!output?.path) throw new Error('Compile finished but no output file was written.')

  return {
    outputPath: output.path,
    bytes: output.bytes,
    warnings: toMessages(preflight?.warnings ?? []),
  }
}

async function generateResearchArtefacts(projectPath: string, ctx: Record<string, unknown>): Promise<void> {
  try {
    const core = await import('@storyline/core') as {
      generateBibliography?: (dir: string, opts?: Record<string, unknown>) => Promise<unknown>
      generateAllEndnotes?: (dir: string, chapters: number[], opts?: Record<string, unknown>) => Promise<unknown>
      generateFactCheckReport?: (dir: string) => Promise<unknown>
    }
    const chapters = (ctx.chapters as Array<{ chapterNumber?: number }> | undefined) ?? []
    const chapterNumbers = chapters
      .map(c => Number(c.chapterNumber))
      .filter(n => Number.isFinite(n) && n > 0)
    if (core.generateBibliography) await core.generateBibliography(projectPath, { citationStyle: 'chicago' })
    if (core.generateAllEndnotes && chapterNumbers.length) {
      await core.generateAllEndnotes(projectPath, chapterNumbers, { citationStyle: 'chicago' })
    }
    if (core.generateFactCheckReport) await core.generateFactCheckReport(projectPath)
  } catch {
    // Research artefacts are best-effort — don't block compile if the
    // research subsystem isn't initialised on this project.
  }
}
