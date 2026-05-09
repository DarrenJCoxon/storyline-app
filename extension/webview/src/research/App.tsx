import React, { useEffect, useState, useCallback, useRef } from 'react'
import './styles.css'

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }
const vscode = acquireVsCodeApi()

interface ResearchNote {
  relPath: string
  category: string
  title: string
  bodyPreview: string
}

type ResearchCategories = Record<string, ResearchNote[]>
type ChapterScoped = Record<string, string[]>  // chapterRelPath → note relPaths

function humanize(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function countChapterAttachments(relPath: string, chapterScoped: ChapterScoped): number {
  return Object.values(chapterScoped).filter(notes => notes.includes(relPath)).length
}

function NoteRow({
  note,
  pinned,
  chapterAttachments,
  onOpen,
  onContextMenu,
  onTogglePin,
}: {
  note: ResearchNote
  pinned: boolean
  chapterAttachments: number
  onOpen: (relPath: string) => void
  onContextMenu: (e: React.MouseEvent, relPath: string) => void
  onTogglePin: (relPath: string, pinned: boolean) => void
}) {
  return (
    <div
      className={`note-row${pinned ? ' note-row--pinned' : ''}`}
      onContextMenu={e => onContextMenu(e, note.relPath)}
      title={note.title}
    >
      <input
        type="checkbox"
        className="pin-checkbox"
        checked={pinned}
        title={pinned ? 'Unpin from chat context' : 'Pin to chat context'}
        onChange={e => { e.stopPropagation(); onTogglePin(note.relPath, e.target.checked) }}
        onClick={e => e.stopPropagation()}
      />
      <div
        className="note-body"
        onClick={() => onOpen(note.relPath)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(note.relPath) } }}
        tabIndex={0}
        role="button"
        aria-label={note.title}
      >
        <span className="note-title">{note.title}</span>
        {note.bodyPreview && <span className="note-preview">{note.bodyPreview}</span>}
      </div>
      {chapterAttachments > 0 && (
        <span className="chapter-attach-badge" title={`Attached to ${chapterAttachments} chapter${chapterAttachments !== 1 ? 's' : ''}`}>
          {chapterAttachments}
        </span>
      )}
    </div>
  )
}

function CategorySection({
  category,
  notes,
  pinnedSet,
  chapterScoped,
  onOpen,
  onContextMenu,
  onTogglePin,
}: {
  category: string
  notes: ResearchNote[]
  pinnedSet: Set<string>
  chapterScoped: ChapterScoped
  onOpen: (relPath: string) => void
  onContextMenu: (e: React.MouseEvent, relPath: string) => void
  onTogglePin: (relPath: string, pinned: boolean) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="category-section">
      <button className="category-header" onClick={() => setExpanded(e => !e)}>
        <span className="category-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="category-name">{humanize(category)}</span>
        <span className="category-count">{notes.length}</span>
      </button>
      {expanded && (
        <div className="category-notes">
          {notes.map(note => (
            <NoteRow
              key={note.relPath}
              note={note}
              pinned={pinnedSet.has(note.relPath)}
              chapterAttachments={countChapterAttachments(note.relPath, chapterScoped)}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ContextMenu({
  x, y, relPath, onAttach, onDelete, onClose,
}: {
  x: number; y: number; relPath: string
  onAttach: (r: string) => void
  onDelete: (r: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [onClose])

  return (
    <div className="ctx-menu" style={{ top: y, left: x }}>
      <button className="ctx-item" onClick={() => { onAttach(relPath); onClose() }}>Attach to chapter…</button>
      <button className="ctx-item ctx-item--danger" onClick={() => { onDelete(relPath); onClose() }}>Delete</button>
    </div>
  )
}

export function App() {
  const [categories, setCategories] = useState<ResearchCategories>({})
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set())
  const [chapterScoped, setChapterScoped] = useState<ChapterScoped>({})
  const [query, setQuery] = useState('')
  const [ctx, setCtx] = useState<{ x: number; y: number; relPath: string } | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as { type: string } & Record<string, unknown>
      if (msg.type === 'notes') {
        setCategories(msg.categories as ResearchCategories)
        setPinnedSet(new Set(msg.pinned as string[]))
        setChapterScoped((msg.chapterScoped as ChapterScoped) ?? {})
      } else if (msg.type === 'pins') {
        setPinnedSet(new Set(msg.pinned as string[]))
        setChapterScoped((msg.chapterScoped as ChapterScoped) ?? {})
      }
    }
    window.addEventListener('message', handler)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', handler)
  }, [])

  const handleSearch = useCallback((value: string) => {
    setQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      vscode.postMessage({ type: 'search', query: value })
    }, 200)
  }, [])

  const openNote = useCallback((relPath: string) => {
    vscode.postMessage({ type: 'openNote', relPath })
  }, [])

  const newNote = useCallback(() => {
    vscode.postMessage({ type: 'newNote' })
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, relPath: string) => {
    e.preventDefault()
    setCtx({ x: e.clientX, y: e.clientY, relPath })
  }, [])

  const handleTogglePin = useCallback((relPath: string, pinned: boolean) => {
    vscode.postMessage({ type: 'togglePin', relPath, pinned })
  }, [])

  const categoryKeys = Object.keys(categories).sort()
  const isEmpty = categoryKeys.length === 0
  const pinnedCount = pinnedSet.size

  return (
    <div className="research-root">
      <div className="research-header">
        <div className="search-row">
          <input
            className="search-input"
            type="text"
            placeholder="Search notes…"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            spellCheck={false}
          />
          <button className="add-btn" onClick={newNote} title="New research note">+</button>
        </div>
      </div>

      <div className="research-list">
        {isEmpty && !query ? (
          <div className="empty-state">
            <p className="empty-state__heading">No research yet</p>
            <p>Tap + to capture your first note — character sketches, worldbuilding rules, anything the story needs you to remember.</p>
            <p className="empty-state__tip">Tick a note to pin it to the AI's context so it knows what you know.</p>
          </div>
        ) : isEmpty && query ? (
          <div className="empty-state">
            <p className="empty-state__heading">No match</p>
            <p>Nothing matches "{query}". Try a shorter term, or + to add a note on this topic.</p>
          </div>
        ) : (
          categoryKeys.map(cat => (
            <CategorySection
              key={cat}
              category={cat}
              notes={categories[cat]}
              pinnedSet={pinnedSet}
              chapterScoped={chapterScoped}
              onOpen={openNote}
              onContextMenu={handleContextMenu}
              onTogglePin={handleTogglePin}
            />
          ))
        )}
      </div>

      <div className="research-footer">
        {pinnedCount > 0 ? (
          <span className="pin-count">
            <span className="pin-icon">📎</span>
            {pinnedCount} note{pinnedCount !== 1 ? 's' : ''} pinned to chat
          </span>
        ) : (
          <span className="pin-hint">Tick a note to pin it to the AI's context</span>
        )}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y} relPath={ctx.relPath}
          onAttach={r => vscode.postMessage({ type: 'attachToChapter', noteRelPath: r })}
          onDelete={r => vscode.postMessage({ type: 'deleteNote', relPath: r })}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  )
}
