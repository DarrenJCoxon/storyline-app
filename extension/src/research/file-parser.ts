// CB-20 — Multi-format research file parser.
//
// Writers drop reference material into research/ — interview transcripts,
// historical sources, sample chapters from comp titles, scientific papers,
// brand guidelines, government data. Until now Storyline only recognised
// .md/.markdown — PDFs, DOCX exports, and EPUBs were silently invisible
// to the planning AI even when they were sitting right there in the
// research folder.
//
// This module turns any of these into plain text the AI can read:
//   - .md / .markdown / .txt → readFileSync, no parsing
//   - .pdf                   → pdf-parse (PDF.js wrapper)
//   - .docx                  → mammoth (Microsoft format → text)
//   - .epub                  → ZIP + XHTML scrape (no extra dep)
//
// Heavy parsers are dynamic-imported on demand so a research folder
// without PDFs doesn't pay the load cost.
//
// Cache: parsed content is written next to the source file as
// `<base>.<ext>.txt` inside .storyline/research-cache/ so repeat reads
// don't re-parse the same PDF. Cache is invalidated on source mtime
// change.

import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as path from 'path'
import * as zlib from 'zlib'
import { logInfo, logWarn } from '../diagnostic-log.js'

/** What we extract for each supported format. */
export interface ParsedResearch {
  /** Plain text content the AI consumes. */
  text: string
  /** Source format, for the sidebar label. */
  format: 'md' | 'txt' | 'pdf' | 'docx' | 'epub' | 'unknown'
  /** Anything the parser surfaced that's worth keeping (page count, etc). */
  meta?: Record<string, unknown>
}

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.pdf', '.docx', '.epub'])

export function isSupportedResearchFile(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filename).toLowerCase())
}

export function detectFormat(filename: string): ParsedResearch['format'] {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.md' || ext === '.markdown') return 'md'
  if (ext === '.txt') return 'txt'
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  if (ext === '.epub') return 'epub'
  return 'unknown'
}

function cachePath(projectDir: string, sourcePath: string): string {
  // Mirror the source's relative location inside .storyline/research-cache/
  // so two PDFs with the same basename in different subfolders don't
  // collide.
  const rel = path.relative(projectDir, sourcePath).replace(/[\\/]/g, '_')
  return path.join(projectDir, '.storyline', 'research-cache', `${rel}.txt`)
}

async function readCacheIfFresh(sourcePath: string, cacheFile: string): Promise<string | null> {
  try {
    const [src, cache] = await Promise.all([
      fsPromises.stat(sourcePath),
      fsPromises.stat(cacheFile),
    ])
    if (cache.mtimeMs >= src.mtimeMs) {
      return await fsPromises.readFile(cacheFile, 'utf-8')
    }
  } catch { /* cache miss or stat error — fall through to re-parse */ }
  return null
}

async function writeCache(cacheFile: string, text: string): Promise<void> {
  try {
    await fsPromises.mkdir(path.dirname(cacheFile), { recursive: true })
    await fsPromises.writeFile(cacheFile, text, 'utf-8')
  } catch (err) {
    logWarn('[Storyline] research file-parser: cache write failed', err)
  }
}

/**
 * Parse a research file into plain text. `projectDir` is the workspace
 * root — used only for the cache directory. If you don't want caching
 * (e.g. one-shot CLI use), pass null.
 */
export async function parseResearchFile(
  absolutePath: string,
  projectDir: string | null,
): Promise<ParsedResearch> {
  const format = detectFormat(absolutePath)

  // MD / TXT: trivial, no caching needed (already plain text).
  if (format === 'md' || format === 'txt') {
    const text = await fsPromises.readFile(absolutePath, 'utf-8')
    return { text, format }
  }

  if (format === 'unknown') {
    return { text: '', format: 'unknown' }
  }

  // Heavy formats: check cache first.
  if (projectDir) {
    const cf = cachePath(projectDir, absolutePath)
    const cached = await readCacheIfFresh(absolutePath, cf)
    if (cached !== null) {
      return { text: cached, format }
    }
  }

  let parsed: ParsedResearch
  try {
    if (format === 'pdf') {
      parsed = await parsePdf(absolutePath)
    } else if (format === 'docx') {
      parsed = await parseDocx(absolutePath)
    } else if (format === 'epub') {
      parsed = await parseEpub(absolutePath)
    } else {
      parsed = { text: '', format }
    }
  } catch (err) {
    logWarn(`[Storyline] research file-parser: ${format} parse failed for ${path.basename(absolutePath)}:`, err)
    return { text: '', format }
  }

  if (projectDir && parsed.text) {
    await writeCache(cachePath(projectDir, absolutePath), parsed.text)
  }
  logInfo(`[Storyline] research file-parser: parsed ${format} ${path.basename(absolutePath)} → ${parsed.text.length} chars`)
  return parsed
}

// ─── Format-specific parsers ─────────────────────────────────────────────────

async function parsePdf(absolutePath: string): Promise<ParsedResearch> {
  // pdf-parse exposes the text content + page count; no image/OCR
  // support, which is fine — we only care about prose. The shipped
  // type definitions don't quite match the actual default-export
  // shape, so we route through `unknown` to keep TS happy without
  // pulling in the @types package separately.
  const buffer = await fsPromises.readFile(absolutePath)
  const mod = await import('pdf-parse') as unknown as {
    default?: (b: Buffer) => Promise<{ text: string; numpages: number; info?: Record<string, unknown> }>
  }
  const pdfParse = mod.default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string; numpages: number; info?: Record<string, unknown> }>)
  const result = await pdfParse(buffer)
  return {
    text: result.text,
    format: 'pdf',
    meta: { pages: result.numpages, info: result.info },
  }
}

async function parseDocx(absolutePath: string): Promise<ParsedResearch> {
  // mammoth's extractRawText keeps the prose without converting styles
  // to HTML — we only want the words, not the formatting.
  const mammoth = (await import('mammoth')) as unknown as {
    extractRawText: (opts: { path: string }) => Promise<{ value: string; messages: unknown[] }>
  }
  const result = await mammoth.extractRawText({ path: absolutePath })
  return { text: result.value, format: 'docx' }
}

/**
 * Lightweight EPUB parser — no extra dependency. EPUB is a ZIP file
 * with XHTML content documents. We:
 *   1. Read the ZIP central directory.
 *   2. For every entry whose name ends in .xhtml/.html/.htm, inflate
 *      its DEFLATE-compressed body.
 *   3. Strip XML/HTML tags to leave plain text.
 *
 * Skips the OPF / NCX / metadata files. Doesn't try to honour the
 * spine order — we just concatenate XHTML text in alphabetical name
 * order. For research-ingestion purposes (the AI just needs the
 * content), order doesn't matter.
 */
async function parseEpub(absolutePath: string): Promise<ParsedResearch> {
  const buf = await fsPromises.readFile(absolutePath)
  const entries = readZipEntries(buf)
  const xhtmlEntries = entries
    .filter(e => /\.(xhtml|html|htm)$/i.test(e.filename))
    .sort((a, b) => a.filename.localeCompare(b.filename))

  const texts: string[] = []
  for (const e of xhtmlEntries) {
    const body = inflateZipEntry(buf, e)
    if (!body) continue
    texts.push(stripTags(body.toString('utf-8')))
  }
  return {
    text: texts.join('\n\n'),
    format: 'epub',
    meta: { documents: xhtmlEntries.length },
  }
}

// ─── Minimal ZIP reader (enough to walk an EPUB) ─────────────────────────────

interface ZipEntry {
  filename: string
  compressionMethod: number  // 0 = stored, 8 = DEFLATE
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

function readZipEntries(buf: Buffer): ZipEntry[] {
  // Find the End-of-Central-Directory record by scanning back from the
  // tail. The signature is 0x06054b50.
  const eocdSig = 0x06054b50
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === eocdSig) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) return []

  const totalEntries = buf.readUInt16LE(eocdOffset + 10)
  const cdOffset = buf.readUInt32LE(eocdOffset + 16)

  const entries: ZipEntry[] = []
  let offset = cdOffset
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break
    const compressionMethod = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const uncompressedSize = buf.readUInt32LE(offset + 24)
    const filenameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    const localHeaderOffset = buf.readUInt32LE(offset + 42)
    const filename = buf.slice(offset + 46, offset + 46 + filenameLen).toString('utf-8')
    entries.push({ filename, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset })
    offset += 46 + filenameLen + extraLen + commentLen
  }
  return entries
}

function inflateZipEntry(buf: Buffer, entry: ZipEntry): Buffer | null {
  const lfh = entry.localHeaderOffset
  if (buf.readUInt32LE(lfh) !== 0x04034b50) return null
  const filenameLen = buf.readUInt16LE(lfh + 26)
  const extraLen = buf.readUInt16LE(lfh + 28)
  const dataStart = lfh + 30 + filenameLen + extraLen
  const data = buf.slice(dataStart, dataStart + entry.compressedSize)
  if (entry.compressionMethod === 0) return data
  if (entry.compressionMethod === 8) {
    try {
      return zlib.inflateRawSync(data)
    } catch {
      return null
    }
  }
  return null
}

function stripTags(html: string): string {
  // Cheap-but-effective tag strip: drop everything inside <…>, decode
  // a few common entities, collapse whitespace. No DOM parser needed —
  // we don't care about structure, just the words.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}
