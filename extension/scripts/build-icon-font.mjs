// Generate a tiny icon font containing the Storyline brand glyph so the
// status bar can render it via $(storyline) — VS Code only allows codicon
// references in StatusBarItem.text, so a custom icon must come from a font.
//
// Pipeline: storyline-black.png → imagetracerjs → SVG → svgtofont → woff/ttf.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ImageTracer = require('imagetracerjs')
const svgtofont = (await import('svgtofont')).default
const { PNG } = require('pngjs')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC_PNG = path.join(ROOT, 'media', 'storyline-black.png')
const STAGE_DIR = path.join(ROOT, '.icon-font-build')
const SVG_DIR = path.join(STAGE_DIR, 'svg')
const OUT_DIR = path.join(ROOT, 'media', 'icon-font')

fs.mkdirSync(SVG_DIR, { recursive: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const pngBuffer = fs.readFileSync(SRC_PNG)
const png = PNG.sync.read(pngBuffer)
const imageData = {
  width: png.width,
  height: png.height,
  data: png.data,
}

const svgString = ImageTracer.imagedataToSVG(imageData, {
  ltres: 1,
  qtres: 1,
  pathomit: 8,
  numberofcolors: 2,
  colorquantcycles: 3,
  blurradius: 0,
})

fs.writeFileSync(path.join(SVG_DIR, 'storyline.svg'), svgString)
console.log('[icon-font] traced PNG → SVG (', svgString.length, 'bytes )')

await svgtofont({
  src: SVG_DIR,
  dist: OUT_DIR,
  fontName: 'storyline-icons',
  css: false,
  startUnicode: 0xea01,
  emptyDist: true,
  generateInfoData: true,
  svgicons2svgfont: { fontHeight: 1000, normalize: true },
  website: null,
  outSVGReact: false,
  outSVGReactNative: false,
  outSVGPath: false,
})

console.log('[icon-font] generated font at', OUT_DIR)
const info = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'info.json'), 'utf8'))
console.log('[icon-font] glyph map:', JSON.stringify(info, null, 2))
