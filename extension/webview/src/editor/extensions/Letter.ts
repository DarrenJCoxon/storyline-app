import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    letter: {
      setLetter: () => ReturnType
      toggleLetter: () => ReturnType
      unsetLetter: () => ReturnType
    }
  }
}

// Letter / Journal entry node. Renders italic, indented left. Writers use
// it for letters, diary entries, or any change-of-voice block.
// Each Book Style can render it differently (italic serif in Atticus,
// lighter weight in Riverside, monospace in future Codex style).
export const Letter = Node.create({
  name: 'letter',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      { tag: 'aside.letter' },
      { tag: 'div.letter' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: 'letter' }), 0]
  },

  addCommands() {
    return {
      setLetter:    () => ({ commands }) => commands.wrapIn(this.name),
      toggleLetter: () => ({ commands }) => commands.toggleWrap(this.name),
      unsetLetter:  () => ({ commands }) => commands.lift(this.name),
    }
  },

  addStorage() {
    type S = { write(s: string): void; renderContent(n: unknown): void; closeBlock(n: unknown): void }
    return {
      markdown: {
        serialize(state: S, node: unknown) {
          state.write('<aside class="letter">\n\n')
          state.renderContent(node)
          state.write('</aside>')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

export default Letter
