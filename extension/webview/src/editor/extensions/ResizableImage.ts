import Image from '@tiptap/extension-image'

/**
 * Image node extended with width/height attrs that round-trip through
 * markdown. When either dimension is set, the markdown serializer emits
 * an HTML `<img>` tag (with width/height attributes); when neither is
 * set, it falls back to standard `![alt](src)` syntax. tiptap-markdown's
 * markdown-it parser is configured with `html: true` so the HTML tags
 * are read back into Image nodes with their attrs intact.
 */
// Picture-book classes the editor recognises and round-trips. Anything
// else is dropped on parse so a stray `class="malicious"` from pasted
// HTML can't leak into the manuscript.
const ALLOWED_IMG_CLASSES = new Set(['bleed', 'full-bleed', 'recto', 'verso'])

function filterImgClasses(raw: string | null): string {
  if (!raw) return ''
  return raw.split(/\s+/).filter(c => ALLOWED_IMG_CLASSES.has(c)).join(' ')
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => {
          const w = (el as HTMLElement).getAttribute('width')
          return w ? parseInt(w, 10) : null
        },
        renderHTML: () => ({}), // handled in renderHTML override below
      },
      height: {
        default: null,
        parseHTML: el => {
          const h = (el as HTMLElement).getAttribute('height')
          return h ? parseInt(h, 10) : null
        },
        renderHTML: () => ({}),
      },
      // `imgClass` is the picture-book layout class (bleed / recto /
      // verso). Stored as its own attr — separate from the wrapper
      // class on `editor-img` — so the markdown serializer can emit
      // `{.bleed .recto}` without leaking the editor's styling class.
      imgClass: {
        default: '',
        parseHTML: el => filterImgClasses((el as HTMLElement).getAttribute('class')),
        renderHTML: () => ({}),
      },
    }
  },

  renderHTML({ HTMLAttributes, node }) {
    // Combine width/height into both HTML attributes AND an inline style
    // so they can't be overridden by sheet rules like `height: auto`.
    const attrs = (node as { attrs: { width?: number | null; height?: number | null; imgClass?: string } }).attrs
    const w = attrs.width
    const h = attrs.height
    const styleParts: string[] = []
    if (w) styleParts.push(`width: ${w}px`)
    if (h) styleParts.push(`height: ${h}px`)
    const merged: Record<string, string> = { ...(HTMLAttributes as Record<string, string>) }
    if (w) merged.width = String(w)
    if (h) merged.height = String(h)
    if (styleParts.length) {
      merged.style = `${styleParts.join('; ')}${merged.style ? '; ' + merged.style : ''}`
    }
    // Append picture-book classes onto the editor-img wrapper class so
    // the editor preview can style bleed images differently.
    const layoutClasses = attrs.imgClass ?? ''
    if (layoutClasses) {
      merged.class = merged.class ? `${merged.class} ${layoutClasses}` : layoutClasses
    }
    return ['img', merged]
  },

  addStorage() {
    const parentStorage = (this as unknown as { parent?: () => Record<string, unknown> }).parent?.() ?? {}
    type SerializeState = { write(s: string): void; closeBlock?: (n: unknown) => void }
    type Node = { attrs: { src?: string; alt?: string; title?: string; width?: number | null; height?: number | null; imgClass?: string } }

    return {
      ...parentStorage,
      markdown: {
        serialize(state: SerializeState, node: Node) {
          const { src = '', alt = '', title = '', width, height, imgClass = '' } = node.attrs
          const safe = (s: string) => String(s).replace(/"/g, '&quot;')
          // Layout classes (bleed / recto / verso) emit a markdown-it-attrs
          // suffix that the compile renderer reads. Filtered on parse so
          // unknown classes can't ride along.
          const cleanClasses = imgClass.split(/\s+/).filter(c => ALLOWED_IMG_CLASSES.has(c))
          const attrSuffix = cleanClasses.length
            ? `{${cleanClasses.map(c => `.${c}`).join(' ')}}`
            : ''
          // Use HTML form when ANY of {width, height, layout class} is set.
          // tiptap-markdown's parser doesn't run markdown-it-attrs, so the
          // `{.bleed}` suffix wouldn't round-trip on reload. The HTML
          // <img class="…"> form goes through markdown-it's html:true and
          // is read back by our parseHTML, preserving everything.
          if (width || height || cleanClasses.length) {
            const wAttr = width ? ` width="${width}"` : ''
            const hAttr = height ? ` height="${height}"` : ''
            const altAttr = alt ? ` alt="${safe(alt)}"` : ''
            const titleAttr = title ? ` title="${safe(title)}"` : ''
            const classAttr = cleanClasses.length ? ` class="${cleanClasses.join(' ')}"` : ''
            state.write(`<img src="${safe(src)}"${altAttr}${wAttr}${hAttr}${classAttr}${titleAttr} />`)
          } else {
            const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
            state.write(`![${alt}](${src}${titlePart})${attrSuffix}`)
          }
        },
        parse: {
          // handled by markdown-it (html: true picks up <img> tags)
        },
      },
    }
  },
})

export default ResizableImage
