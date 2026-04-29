import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: () => ReturnType
      toggleCallout: () => ReturnType
      unsetCallout: () => ReturnType
    }
  }
}

/**
 * Block-level callout — sibling to blockquote. Used for asides, tips, notes,
 * historical context boxes, etc. Renders as `<aside class="callout">` so theme
 * CSS can style it (pale blue on iPad, pale grey on Kindle/print). Round-trips
 * through markdown as a raw HTML block, picked back up by markdown-it
 * (`html: true`) and TipTap's HTML parser on reload.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      { tag: 'aside.callout' },
      { tag: 'div.callout' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'callout' }), 0]
  },

  addCommands() {
    return {
      setCallout:
        () =>
        ({ commands }) => commands.wrapIn(this.name),
      toggleCallout:
        () =>
        ({ commands }) => commands.toggleWrap(this.name),
      unsetCallout:
        () =>
        ({ commands }) => commands.lift(this.name),
    }
  },

  addStorage() {
    type SerializeState = {
      write(s: string): void
      renderContent(node: unknown): void
      closeBlock(node: unknown): void
    }
    return {
      markdown: {
        serialize(state: SerializeState, node: unknown) {
          state.write('<aside class="callout">\n\n')
          state.renderContent(node)
          state.write('</aside>')
          state.closeBlock(node)
        },
        parse: {
          // markdown-it's `html: true` (already enabled in Editor.tsx) parses
          // <aside> tags. tiptap-markdown forwards them to the HTML parser,
          // which our parseHTML above matches on `aside.callout`.
        },
      },
    }
  },
})

export default Callout
