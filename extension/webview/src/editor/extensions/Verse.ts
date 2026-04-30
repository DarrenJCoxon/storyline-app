import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    verse: {
      setVerse: () => ReturnType
      toggleVerse: () => ReturnType
      unsetVerse: () => ReturnType
    }
  }
}

// Verse / Poetry node — preserves line structure, no justification, no
// drop cap. Each paragraph inside is a line or stanza. An empty paragraph
// acts as a stanza break (CSS gives it a small gap height).
//
// Markdown round-trip: raw HTML <div class="verse">…</div>. The compile
// pipeline treats it like any other block — markdown-it passes raw HTML
// through and the _base.css rules style it correctly for every Book Style.
export const Verse = Node.create({
  name: 'verse',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      { tag: 'div.verse' },
      { tag: 'pre.verse' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'verse' }), 0]
  },

  addCommands() {
    return {
      setVerse:    () => ({ commands }) => commands.wrapIn(this.name),
      toggleVerse: () => ({ commands }) => commands.toggleWrap(this.name),
      unsetVerse:  () => ({ commands }) => commands.lift(this.name),
    }
  },

  addStorage() {
    type S = { write(s: string): void; renderContent(n: unknown): void; closeBlock(n: unknown): void }
    return {
      markdown: {
        serialize(state: S, node: unknown) {
          state.write('<div class="verse">\n\n')
          state.renderContent(node)
          state.write('</div>')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

export default Verse
