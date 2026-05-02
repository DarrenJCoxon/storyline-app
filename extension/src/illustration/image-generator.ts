import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import type { LicenceManager } from '../auth/licence.js'
import { reportError } from '../ai/error-reporter.js'

export interface GenerateImageOptions {
  prompt: string
  /** Target on-disk dimensions. Image is generated at the model's portrait
   *  resolution (1024×1536 for 2:3 covers) then upscaled with sharp. */
  width?: number
  height?: number
  /** Aspect ratio sent to the backend (e.g. "2:3"). */
  aspectRatio?: string
  /** Generation size sent to the model (e.g. "1024x1536"). */
  generationSize?: string
  /** Quality tier — drives model spend. Costs below are for the 1024×1536
   *  / 1536×1024 aspect ratios we actually generate at (NOT square). A
   *  full book-cover generation fires TWO calls (front + back), so a
   *  complete "high" cover charges 200 credits in total.
   *   low    ≈ $0.016 /   8 credits   character refs, ornaments, mood
   *   medium ≈ $0.063 /  32 credits   chapter headers, maps, illustrations
   *   high   ≈ $0.25  / 100 credits   single cover face (front or back) */
  quality?: 'low' | 'medium' | 'high'
  /** Single ref (legacy — used by back-cover-from-front continuity). */
  referenceImagePath?: string
  /** Multi-image references — character / style / scene anchors used to
   *  keep an illustrated book visually consistent. Routed through
   *  /v1/images/edits with input_fidelity=high. */
  referenceImagePaths?: Array<{ path: string; label?: 'character' | 'style' | 'scene' }>
  inputFidelity?: 'high' | 'low'
  outputPath: string
  projectDir: string
  backendUrl: string
  licenceManager: LicenceManager
}

export interface GeneratedImage {
  absolutePath: string
  dataUrl: string
}

// 6×9 inches at 300 DPI — KDP print standard. Final on-disk dimensions.
// We ask the model for its native 2:3 size (1024×1536) so it composes
// for that aspect natively — asking for non-native dims like 1800×2700
// makes the model render at native size internally then crop to fit,
// which chops the edges of the artwork. Sharp upscales the native output
// to print resolution; aspects match (2:3) so no further crop happens.
export const COVER_W = 1800
export const COVER_H = 2700
export const COVER_GEN_W = 1024
export const COVER_GEN_H = 1536
export const COVER_ASPECT_RATIO = '2:3'

// Per-quality credit cost — MUST match backend/src/illustrate.ts
// CREDITS_BY_QUALITY exactly. Sized for ~80% margin against Pack A post-
// Stripe revenue. Covers fire two /illustrate calls (front + back), so a
// complete cover bills 200 credits at high quality.
export const CREDITS_LOW    = 8
export const CREDITS_MEDIUM = 32
export const CREDITS_HIGH   = 100
/** @deprecated use CREDITS_HIGH directly when referring to cover cost. */
export const IMAGE_CREDIT_COST = CREDITS_HIGH

export async function generateImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
  const licenceKey = await opts.licenceManager.getLicenceKey()
  if (!licenceKey) throw new Error('No licence key — sign in first.')

  let referenceImageBase64: string | undefined
  if (opts.referenceImagePath && fs.existsSync(opts.referenceImagePath)) {
    referenceImageBase64 = fs.readFileSync(opts.referenceImagePath).toString('base64')
  }

  const referenceImages: Array<{ base64: string; label?: string }> = []
  for (const ref of opts.referenceImagePaths ?? []) {
    if (fs.existsSync(ref.path)) {
      referenceImages.push({ base64: fs.readFileSync(ref.path).toString('base64'), label: ref.label })
    }
  }

  console.log('[Storyline] generateImage →', opts.backendUrl, '/illustrate', {
    promptLen: opts.prompt?.length ?? 0,
    width: opts.width ?? COVER_W,
    height: opts.height ?? COVER_H,
    hasReference: !!referenceImageBase64,
    licenceKeyTail: licenceKey.slice(-4),
  })

  let res: Response
  try {
    res = await fetch(`${opts.backendUrl}/illustrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenceKey,
        prompt: opts.prompt,
        width: opts.width ?? COVER_W,
        height: opts.height ?? COVER_H,
        size: opts.generationSize,
        aspectRatio: opts.aspectRatio,
        quality: opts.quality,
        referenceImageBase64,
        referenceImages: referenceImages.length ? referenceImages : undefined,
        inputFidelity: opts.inputFidelity,
      }),
    })
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr)
    console.error('[Storyline] /illustrate network error:', netErr)
    reportError({ endpoint: 'illustrate', statusCode: 0, message: `network: ${msg}`, licenceKey })
    throw new Error(`Cannot reach backend at ${opts.backendUrl}. Is wrangler dev running?`)
  }

  console.log('[Storyline] /illustrate response:', res.status, res.statusText)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let err: { error?: string }
    try { err = JSON.parse(text) } catch { err = { error: text || `HTTP ${res.status}` } }
    console.error('[Storyline] /illustrate failed:', res.status, err)
    reportError({ endpoint: 'illustrate', statusCode: res.status, message: err.error || text || `HTTP ${res.status}`, licenceKey })

    // Free-tier-no-images is a known 402 path — show a Top Up Credits action
    // button so the user lands in the buy-credits screen with one click.
    // Detected by message content (the Worker returns the canonical phrase).
    const isFreeTierBlock = res.status === 402 && /free book plan|free plan/i.test(err.error ?? '')
    if (isFreeTierBlock) {
      void vscode.window.showWarningMessage(
        'Image generation needs paid credits — the free plan covers chat-based planning only.',
        'Top Up Credits',
      ).then(choice => {
        if (choice === 'Top Up Credits') {
          void vscode.commands.executeCommand('storyline.topUpCredits')
        }
      })
    }
    throw new Error(err.error ?? `Image generation failed (${res.status})`)
  }

  const { imageDataUrl } = await res.json() as { imageDataUrl: string }
  if (!imageDataUrl) throw new Error('No image data in response.')

  const absPath = path.join(opts.projectDir, opts.outputPath)
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
  const rawBuffer = Buffer.from(base64, 'base64')

  // Upscale to the requested target dimensions (e.g. 1800×2700 for KDP 6×9
  // at 300 DPI). Lanczos resample preserves detail; cover (no crop) keeps
  // the model's full image and pads to ratio if needed.
  const targetW = opts.width ?? COVER_W
  const targetH = opts.height ?? COVER_H
  const targetRatio = targetW / targetH
  let finalBuffer: Buffer
  let aspectWarning: string | null = null
  try {
    const { default: sharp } = await import('sharp') as { default: typeof import('sharp') }
    const meta = await sharp(rawBuffer).metadata()
    const srcW = meta.width ?? 0
    const srcH = meta.height ?? 0
    const srcRatio = srcW && srcH ? srcW / srcH : 0
    // Aspect-ratio tolerance: 5% — allows for minor model output drift
    // (e.g. 1024×1023) but catches a square (1024×1024) when we asked
    // for 2:3 (≈ 0.667).
    const ratioMatches = srcRatio > 0 && Math.abs(srcRatio - targetRatio) / targetRatio < 0.05

    if (ratioMatches) {
      // Aspect ratio is correct — just upscale to target dimensions
      // without cropping. fit: 'fill' resizes without cropping when the
      // input ratio already matches.
      const resized = await sharp(rawBuffer)
        .resize({
          width: targetW,
          height: targetH,
          fit: 'fill',
          kernel: 'lanczos3',
        })
        .jpeg({ quality: 95 })
        .toBuffer()
      finalBuffer = Buffer.from(resized)
      console.log(`[Storyline] sharp resized ${srcW}×${srcH} → ${targetW}×${targetH} (aspect match)`)
    } else {
      // Aspect mismatch: do NOT crop (would chop the cover content off).
      // Save the raw model output as-is so the user can see it, plus
      // surface a warning so they know to regenerate.
      finalBuffer = rawBuffer
      aspectWarning = `Model returned ${srcW}×${srcH} (${srcRatio.toFixed(2)} ratio) but you requested ${targetW}×${targetH} (${targetRatio.toFixed(2)} ratio). Saved as-is — regenerate to try again.`
      console.warn(`[Storyline] aspect mismatch: ${aspectWarning}`)
    }
  } catch (sharpErr) {
    const msg = sharpErr instanceof Error ? sharpErr.message : String(sharpErr)
    throw new Error(`Image post-process failed (sharp): ${msg}. Reinstall the extension to refresh native bindings.`)
  }

  fs.writeFileSync(absPath, finalBuffer)
  if (aspectWarning) {
    console.warn('[Storyline] saved with aspect warning:', absPath)
  }

  return { absolutePath: absPath, dataUrl: imageDataUrl }
}

// KDP print bleed at 300 DPI: 0.125" on outer + top + bottom edges. The
// inner (binding) edges of the front and back panels don't bleed —
// they meet the spine. Total wraparound dimensions:
//   width  = bleed + 6" + spine + 6" + bleed
//   height = bleed + 9" + bleed
const KDP_BLEED_PX = 38   // 0.125" × 300 dpi (≈ 37.5 rounded up)

export async function compositeWraparound(
  projectDir: string,
  frontAbsPath: string,
  backAbsPath: string,
  spinePxWidth: number,
  title: string,
  author: string,
): Promise<string> {
  const { default: sharp } = await import('sharp') as { default: typeof import('sharp') }

  if (!fs.existsSync(frontAbsPath)) throw new Error('Front cover file missing — generate one first.')
  if (!fs.existsSync(backAbsPath)) throw new Error('Back cover file missing — wraparound needs both panels. Generate a back cover first.')

  // Force both panels to canonical 1800×2700 — the AI sometimes produces
  // images that are off by a few pixels, which would break the composite.
  // Re-encoding through sharp also normalises colour space / orientation.
  const frontPanel = await sharp(frontAbsPath)
    .resize({ width: COVER_W, height: COVER_H, fit: 'fill' })
    .jpeg({ quality: 95 })
    .toBuffer()
  const backPanel = await sharp(backAbsPath)
    .resize({ width: COVER_W, height: COVER_H, fit: 'fill' })
    .jpeg({ quality: 95 })
    .toBuffer()

  // Sample the front cover's dominant colour for the spine background +
  // bleed fill, so the wraparound reads as one continuous design.
  const { dominant } = await sharp(frontPanel).stats()
  const bg = dominant ?? { r: 30, g: 30, b: 30 }

  const spineSvg = buildSpineSvg(spinePxWidth, COVER_H, title, author, bg as { r: number; g: number; b: number })
  const spineBuffer = Buffer.from(spineSvg)

  // Final canvas with KDP bleed on outer edges + top + bottom.
  const totalW = KDP_BLEED_PX + COVER_W + spinePxWidth + COVER_W + KDP_BLEED_PX
  const totalH = KDP_BLEED_PX + COVER_H + KDP_BLEED_PX

  const wraparound = await sharp({
    create: { width: totalW, height: totalH, channels: 3, background: { r: bg.r, g: bg.g, b: bg.b } },
  })
    .composite([
      { input: backPanel,   left: KDP_BLEED_PX,                                       top: KDP_BLEED_PX },
      { input: spineBuffer, left: KDP_BLEED_PX + COVER_W,                             top: KDP_BLEED_PX },
      { input: frontPanel,  left: KDP_BLEED_PX + COVER_W + spinePxWidth,              top: KDP_BLEED_PX },
    ])
    .jpeg({ quality: 95 })
    .toBuffer()

  const wraparoundPath = path.join(projectDir, 'assets', 'cover-wraparound.jpg')
  fs.writeFileSync(wraparoundPath, wraparound)
  return wraparoundPath
}

function buildSpineSvg(
  w: number, h: number, title: string, author: string,
  bg: { r: number; g: number; b: number },
): string {
  const bgCss = `rgb(${bg.r},${bg.g},${bg.b})`
  const fg = bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114 > 128 ? '#000' : '#fff'
  // Spine type sized as a fraction of the spine width — reads cleanly on
  // print spines from ~0.2" thick (~60 px) to ~1.5" (~450 px). Caps so very
  // thick books don't end up with absurdly large titles.
  const titleFont   = Math.max(36, Math.min(Math.floor(w * 0.55), 84))
  const authorFont  = Math.max(22, Math.floor(titleFont * 0.55))
  const cx = w / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${bgCss}"/>
  <text transform="rotate(-90,${cx},${h * 0.40})" x="${cx}" y="${h * 0.40}"
    font-family="Georgia,serif" font-size="${titleFont}" font-weight="600" fill="${fg}"
    text-anchor="middle" letter-spacing="0.04em">${escXml(title)}</text>
  <text transform="rotate(-90,${cx},${h * 0.78})" x="${cx}" y="${h * 0.78}"
    font-family="Georgia,serif" font-size="${authorFont}" fill="${fg}" opacity="0.85"
    text-anchor="middle" letter-spacing="0.05em">${escXml(author)}</text>
</svg>`
}

function escXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
