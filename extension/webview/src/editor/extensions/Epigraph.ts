import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    epigraph: {
      setEpigraph: () => ReturnType
      toggleEpigraph: () => ReturnType
      unsetEpigraph: () => ReturnType
    }
  }
}

export const Epigraph = Node.create({
  name: 'epigraph',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      { tag: 'aside.epigraph' },
      { tag: 'div.epigraph' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'epigraph' }), 0]
  },

  addCommands() {
    return {
      setEpigraph:    () => ({ commands }) => commands.wrapIn(this.name),
      toggleEpigraph: () => ({ commands }) => commands.toggleWrap(this.name),
      unsetEpigraph:  () => ({ commands }) => commands.lift(this.name),
    }
  },

  addStorage() {
    type S = { write(s: string): void; renderContent(n: unknown): void; closeBlock(n: unknown): void }
    return {
      markdown: {
        serialize(state: S, node: unknown) {
          state.write('<aside class="epigraph">\n\n')
          state.renderContent(node)
          state.write('</aside>')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

export default Epigraph
