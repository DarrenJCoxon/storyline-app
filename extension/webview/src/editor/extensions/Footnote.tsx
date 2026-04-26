import React, { useEffect, useRef, useState } from 'react'
import { Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

function FootnoteView({ node, updateAttributes, editor }: NodeViewProps) {
  const [open, setOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  return (
    <NodeViewWrapper as="span" className="fn-wrapper" contentEditable={false}>
      <sup
        className="fn-marker"
        onClick={() => setOpen(v => !v)}
        title="Click to edit footnote"
      >
        {node.attrs.id}
      </sup>
      {open && (
        <span className="fn-popover">
          <textarea
            ref={textareaRef}
            value={node.attrs.body ?? ''}
            onChange={e => updateAttributes({ body: e.target.value })}
            placeholder="Footnote text…"
            rows={3}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); setOpen(false); editor.commands.focus() }
            }}
          />
          <button className="fn-popover-close" onClick={() => { setOpen(false); editor.commands.focus() }}>
            Done
          </button>
        </span>
      )}
    </NodeViewWrapper>
  )
}

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id:   { default: 1 },
      body: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'sup.fn-marker' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', { ...HTMLAttributes, class: 'fn-marker' }, String(HTMLAttributes.id ?? 1)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView)
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { id: number } }) {
          state.write(`[^${node.attrs.id}]`)
        },
        parse: {},
      },
    }
  },

  addCommands() {
    return {
      insertFootnote: () => ({ state, dispatch }) => {
        // Find max footnote ID in current doc
        let maxId = 0
        state.doc.descendants(n => {
          if (n.type.name === 'footnote') maxId = Math.max(maxId, n.attrs.id as number)
        })
        const id = maxId + 1
        const node = state.schema.nodes['footnote'].create({ id, body: '' })
        if (dispatch) dispatch(state.tr.replaceSelectionWith(node))
        return true
      },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: () => ReturnType
    }
  }
}
