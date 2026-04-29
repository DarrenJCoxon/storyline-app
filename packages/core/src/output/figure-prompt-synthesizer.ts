// NF-13.4a — Image-2 prompt synthesizer.
//
// Converts freeform figure intent + chapter/book context into a structured
// ImagePrompt optimised for image-2's text-rendering capability.
//
// Rules (from spec):
// - Always populate textElements[] when the figure has labels/steps/callouts.
// - Default to flat/vector/infographic style for diagrams.
// - Always include negativeConstraints[].
// - Pull colourPalette from book DNA when available.
//
// This is a deterministic rule-based function — no LLM call.
// Runs once at chapter-plan save; the writer can tune the output in the registry.

import type { ImagePrompt } from '../state/writing-plan.js'

export interface FigureContext {
  chapterTitle?: string | null
  chapterMission?: string | null
}

export interface BookContext {
  title?: string | null
  audience?: string | null
  palette?: string | null
  frameworkName?: string | null
}

const DEFAULT_NEGATIVE: string[] = [
  'no photorealistic textures',
  'no 3D depth effects',
  'no garbled or illegible text',
  'no decorative flourishes that obscure content',
]

export function synthesizeImagePrompt(
  purpose: string,
  type: string,
  figure: FigureContext,
  book: BookContext,
): ImagePrompt {
  const purposeLower = (purpose + ' ' + type).toLowerCase()

  const isFlowDiagram  = /flow|diagram|framework|ladder|process|step|pipeline|cycle/i.test(purposeLower)
  const isChart        = /chart|graph|data|comparison|bar|pie|scatter|axis/i.test(purposeLower)
  const isTimeline     = /timeline|chronolog|history|sequence|over time/i.test(purposeLower)
  const isTable        = /table|matrix|grid|comparison/i.test(purposeLower)
  const isMatrixType   = /matrix|grid/i.test(purposeLower)
  const isCastSheet    = /cast|character|portrait|person|face/i.test(purposeLower)
  const isMap          = /\bmap\b|geographic|location|region/i.test(purposeLower)
  const isIllustration = type === 'illustration' || /illustration|scene|setting/i.test(purposeLower)

  let composition = 'Centered layout, generous margins, clear visual hierarchy'
  let style = 'Clean infographic, flat colours, sans-serif typography, white background'
  let aspectRatio: ImagePrompt['aspectRatio'] = 'landscape'

  if (isFlowDiagram) {
    composition = 'Horizontal flow diagram, left-to-right reading direction, boxes connected by arrows, equal spacing'
    style = 'Clean vector-style diagram, flat muted colours, sans-serif labels, white background, no shadows'
    aspectRatio = 'landscape'
  } else if (isChart) {
    composition = 'Standard chart with clearly labelled axes, data labels on bars/points, and a compact legend'
    style = 'Data visualisation style, minimal chrome, clear typography, white background'
    aspectRatio = 'landscape'
  } else if (isTimeline) {
    composition = 'Horizontal timeline, left-to-right, milestone markers with dates and labels above/below the line'
    style = 'Clean timeline infographic, flat colours, sans-serif typography, white background'
    aspectRatio = 'landscape'
  } else if (isTable || isMatrixType) {
    composition = 'Table layout with header row, alternating row shading, content cells'
    style = 'Clean data table, minimal borders, sans-serif typography, white background'
    aspectRatio = 'landscape'
  } else if (isCastSheet) {
    composition = 'Portrait orientation, subject centred, name and key details below'
    style = 'Character illustration, clean line work, consistent with the book\'s visual style'
    aspectRatio = 'portrait'
  } else if (isMap) {
    composition = 'Geographic map with clear region labels, north arrow, and scale indicator'
    style = 'Flat illustrated map style, muted colours, clean cartographic labelling'
    aspectRatio = 'square'
  } else if (isIllustration) {
    composition = 'Scene composition with clear subject, balanced framing, minimal background clutter'
    style = 'Clean illustration, flat colours, no text overlays unless specified'
    aspectRatio = 'landscape'
  }

  // Extract step/label counts from purpose text and build textElements
  const textElements: Array<{ text: string; position: string }> = []

  // Named steps / rungs
  const stepCountMatch = purpose.match(/(\d+)[-\s]*(?:step|rung|stage|phase|principle|part|level|pillar)/i)
  if (stepCountMatch) {
    const n = Math.min(parseInt(stepCountMatch[1]), 8)
    for (let i = 1; i <= n; i++) {
      textElements.push({ text: `Step ${i}`, position: `box ${i}` })
    }
  }

  // Extract quoted labels or capitalised terms that look like diagram labels
  const quotedLabels = [...purpose.matchAll(/"([^"]{2,40})"/g)].map(m => m[1])
  for (let i = 0; i < Math.min(quotedLabels.length, 5); i++) {
    textElements.push({ text: quotedLabels[i], position: `label ${i + 1}` })
  }

  // Chart axes
  if (isChart) {
    textElements.push(
      { text: 'X axis label', position: 'bottom centre' },
      { text: 'Y axis label', position: 'left side, rotated' },
    )
  }

  // Framework name if present
  if (book.frameworkName && isFlowDiagram) {
    textElements.unshift({ text: book.frameworkName, position: 'title, top centre' })
  }

  const palette = book.palette
    ?? 'navy blue #1a2b4a and gold accent #c9a84c, white background #ffffff'

  const negativeConstraints = [
    ...DEFAULT_NEGATIVE,
    ...(isCastSheet ? [] : ['no human figures unless specified']),
    ...(isIllustration ? [] : ['no photorealistic rendering']),
  ]

  return {
    subject: purpose,
    composition,
    style,
    textElements,
    colourPalette: palette,
    negativeConstraints,
    aspectRatio,
  }
}

