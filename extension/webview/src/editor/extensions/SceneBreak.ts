import HorizontalRule from '@tiptap/extension-horizontal-rule'

export const SceneBreak = HorizontalRule.extend({
  renderHTML() {
    return ['hr', { class: 'scene-break' }]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (n: unknown) => void }, node: unknown) {
          state.write('* * *')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})
