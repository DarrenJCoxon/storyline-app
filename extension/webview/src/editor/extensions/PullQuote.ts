import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pullQuote: {
      setPullQuote: () => ReturnType
      togglePullQuote: () => ReturnType
      unsetPullQuote: () => ReturnType
    }
  }
}

export const PullQuote = Node.create({
  name: 'pullQuote',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      { tag: 'aside.pull-quote' },
      { tag: 'div.pull-quote' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'pull-quote' }), 0]
  },

  addCommands() {
    return {
      setPullQuote:    () => ({ commands }) => commands.wrapIn(this.name),
      togglePullQuote: () => ({ commands }) => commands.toggleWrap(this.name),
      unsetPullQuote:  () => ({ commands }) => commands.lift(this.name),
    }
  },

  addStorage() {
    type S = { write(s: string): void; renderContent(n: unknown): void; closeBlock(n: unknown): void }
    return {
      markdown: {
        serialize(state: S, node: unknown) {
          state.write('<aside class="pull-quote">\n\n')
          state.renderContent(node)
          state.write('</aside>')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

export default PullQuote
