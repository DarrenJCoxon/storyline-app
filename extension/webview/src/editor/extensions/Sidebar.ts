import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sidebar: {
      setSidebar: () => ReturnType
      toggleSidebar: () => ReturnType
      unsetSidebar: () => ReturnType
    }
  }
}

export const Sidebar = Node.create({
  name: 'sidebar',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      { tag: 'aside.sidebar' },
      { tag: 'div.sidebar' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'sidebar' }), 0]
  },

  addCommands() {
    return {
      setSidebar:    () => ({ commands }) => commands.wrapIn(this.name),
      toggleSidebar: () => ({ commands }) => commands.toggleWrap(this.name),
      unsetSidebar:  () => ({ commands }) => commands.lift(this.name),
    }
  },

  addStorage() {
    type S = { write(s: string): void; renderContent(n: unknown): void; closeBlock(n: unknown): void }
    return {
      markdown: {
        serialize(state: S, node: unknown) {
          state.write('<aside class="sidebar">\n\n')
          state.renderContent(node)
          state.write('</aside>')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

export default Sidebar
