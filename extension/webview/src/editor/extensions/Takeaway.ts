import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    takeaway: {
      setTakeaway: () => ReturnType
      toggleTakeaway: () => ReturnType
      unsetTakeaway: () => ReturnType
    }
  }
}

export const Takeaway = Node.create({
  name: 'takeaway',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      { tag: 'aside.takeaway' },
      { tag: 'div.takeaway' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'takeaway' }), 0]
  },

  addCommands() {
    return {
      setTakeaway:    () => ({ commands }) => commands.wrapIn(this.name),
      toggleTakeaway: () => ({ commands }) => commands.toggleWrap(this.name),
      unsetTakeaway:  () => ({ commands }) => commands.lift(this.name),
    }
  },

  addStorage() {
    type S = { write(s: string): void; renderContent(n: unknown): void; closeBlock(n: unknown): void }
    return {
      markdown: {
        serialize(state: S, node: unknown) {
          state.write('<aside class="takeaway">\n\n')
          state.renderContent(node)
          state.write('</aside>')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

export default Takeaway
