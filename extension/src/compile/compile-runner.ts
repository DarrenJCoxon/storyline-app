import * as path from 'path'

export type CompileFormat = 'epub' | 'print-pdf'

export interface CompileOptions {
  projectPath: string
  format: CompileFormat
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
  // Dynamic ESM import — lib/ is ESM, works from CJS extension host via import()
  const libBase = path.resolve(__dirname, '..', '..', '..', '..', 'lib', 'compile')

  const [
    { assemble },
    { runPreflight },
    { markdownToHtml },
    { applyTheme },
    { packageEpub },
    { packagePrintPdf },
  ] = await Promise.all([
    import(path.join(libBase, 'assembler.js')),
    import(path.join(libBase, 'preflight.js')),
    import(path.join(libBase, 'markdown-to-html.js')),
    import(path.join(libBase, 'theme.js')),
    import(path.join(libBase, 'epub.js')),
    import(path.join(libBase, 'print-pdf.js')),
  ]) as [
    { assemble: Phase },
    { runPreflight: Phase },
    { markdownToHtml: Phase },
    { applyTheme: Phase },
    { packageEpub: Phase },
    { packagePrintPdf: Phase },
  ]

  let ctx: Record<string, unknown> = {
    projectPath: opts.projectPath,
    format: opts.format,
  }

  opts.onProgress?.('Assembling chapters')
  ctx = await assemble(ctx)

  opts.onProgress?.('Running pre-flight check')
  ctx = await runPreflight(ctx)

  const preflight = ctx.preflight as { errors?: unknown[]; warnings?: unknown[] } | undefined
  if (preflight?.errors?.length) {
    throw new Error(`Pre-flight failed:\n${toMessages(preflight.errors).join('\n')}`)
  }

  opts.onProgress?.('Converting markdown to HTML')
  ctx = await markdownToHtml(ctx)

  opts.onProgress?.('Applying theme')
  ctx = await applyTheme(ctx)

  // Generate research artefacts (endnotes, bibliography, fact-check report)
  // before packaging so they ship inside the EPUB/PDF. No-ops if the project
  // has no research items.
  opts.onProgress?.('Generating research artefacts')
  await generateResearchArtefacts(opts.projectPath, ctx)

  opts.onProgress?.(opts.format === 'print-pdf' ? 'Rendering PDF (may take 30s)' : 'Packaging EPUB')
  ctx = await (opts.format === 'print-pdf' ? packagePrintPdf(ctx) : packageEpub(ctx))

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
