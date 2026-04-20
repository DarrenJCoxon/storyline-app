// Scene break — the first novel-specific TipTap extension.
//
// Renders as a centred '⁂' ornament between paragraphs. On disk it's
// serialised as `* * *` (the traditional novel-manuscript convention).
// Markdown parsing inherits from HorizontalRule, so `* * *`, `***`, and
// `---` all round-trip through this node.
//
// Input rule: typing '***' on a new line and pressing Enter auto-inserts
// a scene break. Also available via the toolbar button and the
// setHorizontalRule() command (which we keep as the command name for
// muscle-memory compatibility with StarterKit).

import HorizontalRule from '@tiptap/extension-horizontal-rule';

export const SceneBreak = HorizontalRule.extend({
  // Keep the node name as 'horizontalRule' so markdown-it's thematic_break
  // token maps to us automatically via tiptap-markdown's built-in mapping.
  // We only change rendering + serialisation.

  renderHTML() {
    return ['hr', { class: 'scene-break' }];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (n: unknown) => void }, node: unknown) {
          state.write('* * *');
          state.closeBlock(node);
        },
        parse: {
          // Default parse (markdown-it's thematic_break) is fine.
        },
      },
    };
  },
});
