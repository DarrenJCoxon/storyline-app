export type PaperType = 'white' | 'cream'

export const COVER_PX = { w: 1824, h: 2784 } as const

export function pageCount(wordCount: number): number {
  return Math.ceil(wordCount / 275)
}

export function spineInches(wordCount: number, paperType: PaperType = 'white'): number {
  const pages = pageCount(wordCount)
  return pages * (paperType === 'cream' ? 0.002347 : 0.0025)
}

export function spinePx(wordCount: number, paperType: PaperType = 'white'): number {
  const inches = spineInches(wordCount, paperType)
  return Math.round(inches * 300 / 16) * 16
}

export function spineLabel(wordCount: number, paperType: PaperType = 'white'): string {
  const inches = spineInches(wordCount, paperType)
  const pages = pageCount(wordCount)
  return `Spine: ${inches.toFixed(2)}" (${pages} pages, ${paperType} paper)`
}
