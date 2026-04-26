import Image from '@tiptap/extension-image'

/**
 * Image node extended with width/height attrs that round-trip through
 * markdown. When either dimension is set, the markdown serializer emits
 * an HTML `<img>` tag (with width/height attributes); when neither is
 * set, it falls back to standard `![alt](src)` syntax. tiptap-markdown's
 * markdown-it parser is configured with `html: true` so the HTML tags
 * are read back into Image nodes with their attrs intact.
 */
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
    }
  },

  renderHTML({ HTMLAttributes, node }) {
    // Combine width/height into both HTML attributes AND an inline style
    // so they can't be overridden by sheet rules like `height: auto`.
    const attrs = (node as { attrs: { width?: number | null; height?: number | null } }).attrs
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
    return ['img', merged]
  },

  addStorage() {
    const parentStorage = (this as unknown as { parent?: () => Record<string, unknown> }).parent?.() ?? {}
    type SerializeState = { write(s: string): void; closeBlock?: (n: unknown) => void }
    type Node = { attrs: { src?: string; alt?: string; title?: string; width?: number | null; height?: number | null } }

    return {
      ...parentStorage,
      markdown: {
        serialize(state: SerializeState, node: Node) {
          const { src = '', alt = '', title = '', width, height } = node.attrs
          const safe = (s: string) => String(s).replace(/"/g, '&quot;')
          if (width || height) {
            const wAttr = width ? ` width="${width}"` : ''
            const hAttr = height ? ` height="${height}"` : ''
            const altAttr = alt ? ` alt="${safe(alt)}"` : ''
            const titleAttr = title ? ` title="${safe(title)}"` : ''
            state.write(`<img src="${safe(src)}"${altAttr}${wAttr}${hAttr}${titleAttr} />`)
          } else {
            const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
            state.write(`![${alt}](${src}${titlePart})`)
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
