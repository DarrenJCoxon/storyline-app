import React, { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

export interface SlashCommand {
  id: string
  label: string
  hint: string
  keywords: string[]
  category?: string
  run: (editor: Editor) => void
}

function buildCommands(projectMode: 'fiction' | 'nonfiction'): SlashCommand[] {
  const cmds: SlashCommand[] = [
    {
      id: 'h1',
      label: 'Chapter title',
      hint: 'Large heading (H1)',
      keywords: ['h1', 'heading', 'chapter', 'title'],
      run: e => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      id: 'h2',
      label: 'Scene heading',
      hint: 'Medium heading (H2)',
      keywords: ['h2', 'heading', 'scene'],
      run: e => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    ...(projectMode === 'nonfiction'
      ? [{
          id: 'h3',
          label: 'Sub-heading',
          hint: 'Small heading (H3)',
          keywords: ['h3', 'heading', 'sub'],
          run: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run(),
        }]
      : []),
    {
      id: 'scene',
      label: 'Scene break',
      hint: 'Centred * * *',
      keywords: ['scene', 'break', 'hr', 'divider', '***'],
      run: e => e.chain().focus().setHorizontalRule().run(),
    },
    {
      id: 'quote',
      label: 'Blockquote',
      hint: 'Indented quote / epigraph',
      keywords: ['quote', 'blockquote', 'epigraph'],
      run: e => e.chain().focus().toggleBlockquote().run(),
    },
    {
      id: 'callout',
      label: 'Callout',
      hint: 'Aside / tip / note box',
      keywords: ['callout', 'aside', 'tip', 'note', 'box', 'sidebar', 'info'],
      run: e => e.chain().focus().toggleCallout().run(),
    },
    {
      id: 'bullet',
      label: 'Bullet list',
      hint: '• • •',
      keywords: ['bullet', 'list', 'unordered'],
      run: e => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: 'numbered',
      label: 'Numbered list',
      hint: '1. 2. 3.',
      keywords: ['numbered', 'ordered', 'list', '1.'],
      run: e => e.chain().focus().toggleOrderedList().run(),
    },
    ...(projectMode === 'nonfiction'
      ? [{
          id: 'fn',
          label: 'Footnote',
          hint: 'Insert a footnote',
          keywords: ['footnote', 'fn', 'note'],
          run: (e: Editor) => {
            type FnEditor = Editor & { commands: Editor['commands'] & { insertFootnote: () => boolean } }
            ;(e as FnEditor).commands.insertFootnote()
          },
        }]
      : []),
    {
      id: 'epigraph',
      label: 'Epigraph',
      hint: 'Italic quote block',
      keywords: ['epigraph', 'quote', 'italic', 'block'],
      category: 'Block elements',
      run: (e: Editor) => { type Ext = Editor & { commands: Editor['commands'] & { toggleEpigraph: () => boolean } }; (e as Ext).commands.toggleEpigraph() },
    },
    {
      id: 'verse',
      label: 'Verse / Poetry',
      hint: 'Preserve line breaks, no indent',
      keywords: ['verse', 'poem', 'poetry', 'lines', 'stanza'],
      category: 'Block elements',
      run: (e: Editor) => { type Ext = Editor & { commands: Editor['commands'] & { toggleVerse: () => boolean } }; (e as Ext).commands.toggleVerse() },
    },
    {
      id: 'letter',
      label: 'Letter / Journal',
      hint: 'Italic indented block',
      keywords: ['letter', 'journal', 'diary', 'italic', 'indent'],
      category: 'Block elements',
      run: (e: Editor) => { type Ext = Editor & { commands: Editor['commands'] & { toggleLetter: () => boolean } }; (e as Ext).commands.toggleLetter() },
    },
    {
      id: 'pull-quote',
      label: 'Pull Quote',
      hint: 'Highlight a key passage',
      keywords: ['pull', 'quote', 'pullquote', 'highlight', 'large'],
      category: 'Block elements',
      run: (e: Editor) => { type Ext = Editor & { commands: Editor['commands'] & { togglePullQuote: () => boolean } }; (e as Ext).commands.togglePullQuote() },
    },
    {
      id: 'sidebar',
      label: 'Sidebar',
      hint: 'Related info in a shaded box',
      keywords: ['sidebar', 'box', 'info', 'aside', 'related'],
      category: 'Block elements',
      run: (e: Editor) => { type Ext = Editor & { commands: Editor['commands'] & { toggleSidebar: () => boolean } }; (e as Ext).commands.toggleSidebar() },
    },
    {
      id: 'takeaway',
      label: 'Takeaway',
      hint: 'Key point with check mark',
      keywords: ['takeaway', 'key', 'point', 'check', 'tip'],
      category: 'Block elements',
      run: (e: Editor) => { type Ext = Editor & { commands: Editor['commands'] & { toggleTakeaway: () => boolean } }; (e as Ext).commands.toggleTakeaway() },
    },
  ]
  return cmds
}

interface MenuState {
  open: boolean
  query: string
  top: number
  left: number
  // Document position immediately AFTER the slash character we want to remove on commit.
  slashFrom: number
}

export function SlashMenu({
  editor,
  projectMode,
}: { editor: Editor; projectMode: 'fiction' | 'nonfiction' }): JSX.Element | null {
  const [state, setState] = useState<MenuState>({ open: false, query: '', top: 0, left: 0, slashFrom: 0 })
  const [activeIdx, setActiveIdx] = useState(0)
  const popRef = useRef<HTMLDivElement | null>(null)

  const commands = buildCommands(projectMode)
  const filtered = state.query
    ? commands.filter(c => {
        const q = state.query.toLowerCase()
        return c.label.toLowerCase().includes(q) || c.keywords.some(k => k.includes(q))
      })
    : commands

  useEffect(() => { setActiveIdx(0) }, [state.query, state.open])

  // Watch the editor for `/` typed at the start of an empty block.
  useEffect(() => {
    if (!editor) return

    const onUpdate = () => {
      const { state: estate } = editor
      const { selection } = estate
      const { $from } = selection

      // Look at the text in the current paragraph up to the cursor.
      const blockStart = $from.start($from.depth)
      const before = estate.doc.textBetween(blockStart, $from.pos, '\n', '\n')

      // Open trigger: a `/` at the start of the block, possibly followed by query text.
      const match = /^\/([\w-]*)$/.exec(before)
      if (match) {
        const slashFrom = blockStart // position of the '/' character itself
        const coords = editor.view.coordsAtPos($from.pos)
        // Position popover under the cursor, but anchored to the editor surface.
        // coordsAtPos is window-relative; convert to page-relative for fixed positioning.
        setState({
          open: true,
          query: match[1],
          top: coords.bottom + 6,
          left: coords.left,
          slashFrom,
        })
      } else if (state.open) {
        setState(s => ({ ...s, open: false }))
      }
    }

    editor.on('selectionUpdate', onUpdate)
    editor.on('update', onUpdate)
    return () => {
      editor.off('selectionUpdate', onUpdate)
      editor.off('update', onUpdate)
    }
  }, [editor, state.open])

  // Keyboard navigation when menu is open.
  useEffect(() => {
    if (!state.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(filtered.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        if (filtered.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        commit(filtered[activeIdx])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setState(s => ({ ...s, open: false }))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const commit = (cmd: SlashCommand): void => {
    // Remove the typed `/query` text from the document, then run the command.
    const from = state.slashFrom
    const to = editor.state.selection.$from.pos
    editor.chain().focus().deleteRange({ from, to }).run()
    cmd.run(editor)
    setState(s => ({ ...s, open: false }))
  }

  if (!state.open || filtered.length === 0) return null

  const renderItem = (cmd: SlashCommand, i: number) => (
    <button
      key={cmd.id}
      className={`slash-item${i === activeIdx ? ' active' : ''}`}
      onMouseDown={ev => { ev.preventDefault(); commit(cmd) }}
      onMouseEnter={() => setActiveIdx(i)}
      role="option"
      aria-selected={i === activeIdx}
    >
      <span className="slash-label">{cmd.label}</span>
      <span className="slash-hint">{cmd.hint}</span>
    </button>
  )

  // When searching, show flat results. When browsing, group by category.
  let content: React.ReactNode
  if (state.query) {
    content = filtered.map((cmd, i) => renderItem(cmd, i))
  } else {
    const groups: Array<{ cat: string; items: Array<{ cmd: SlashCommand; idx: number }> }> = []
    let idx = 0
    for (const cmd of filtered) {
      const cat = cmd.category ?? ''
      const last = groups[groups.length - 1]
      if (!last || last.cat !== cat) groups.push({ cat, items: [] })
      groups[groups.length - 1].items.push({ cmd, idx: idx++ })
    }
    content = groups.map(g => (
      <React.Fragment key={g.cat || '__default'}>
        {g.cat && <div className="slash-category">{g.cat}</div>}
        {g.items.map(({ cmd, idx: i }) => renderItem(cmd, i))}
      </React.Fragment>
    ))
  }

  return (
    <div
      ref={popRef}
      className="slash-menu"
      style={{ position: 'fixed', top: state.top, left: state.left, zIndex: 100 }}
      role="listbox"
    >
      {content}
    </div>
  )
}
