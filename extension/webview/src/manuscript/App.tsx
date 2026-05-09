import React, { useEffect, useState, useCallback, useRef } from 'react'
import './styles.css'

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void
}
const vscode = acquireVsCodeApi()

interface ChapterItem {
  filename: string
  relPath: string
  title: string
  wordCount: number
  isActive: boolean
  sortOrder: number
  researchCount: number
}

function formatWords(n: number): string {
  if (n >= 100000) return `${Math.round(n / 1000)}k`
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function ChapterRow({
  chapter,
  index,
  isDragOver,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  chapter: ChapterItem
  index: number
  isDragOver: boolean
  onOpen: (relPath: string) => void
  onContextMenu: (e: React.MouseEvent, relPath: string) => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (index: number) => void
  onDragEnd: () => void
}) {
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false
  }

  const handleClick = (e: React.MouseEvent) => {
    if (didDrag.current) { e.preventDefault(); return }
    onOpen(chapter.relPath)
  }

  return (
    <div
      className={[
        'chapter-row',
        chapter.isActive ? 'chapter-row--active' : '',
        isDragOver ? 'chapter-row--drop-target' : '',
      ].filter(Boolean).join(' ')}
      draggable
      tabIndex={0}
      role="button"
      aria-label={chapter.title}
      aria-pressed={chapter.isActive}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(chapter.relPath) } }}
      onContextMenu={e => onContextMenu(e, chapter.relPath)}
      onDragStart={e => {
        didDrag.current = true
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(index)
      }}
      onDragOver={e => { e.preventDefault(); onDragOver(e, index) }}
      onDrop={e => { e.preventDefault(); onDrop(index) }}
      onDragEnd={onDragEnd}
      title={chapter.title}
    >
      {isDragOver && <div className="chapter-drop-line" />}
      {chapter.isActive && <div className="chapter-active-bar" />}
      <span className="chapter-drag-handle" aria-hidden>⠿</span>
      <span className="chapter-num">{String(index + 1).padStart(2, ' ')}</span>
      <span className="chapter-title">{chapter.title}</span>
      {chapter.researchCount > 0 && (
        <span className="chapter-research-badge" title={`${chapter.researchCount} research note${chapter.researchCount !== 1 ? 's' : ''} attached`}>
          {chapter.researchCount}
        </span>
      )}
      <span className="chapter-wc">{chapter.wordCount > 0 ? formatWords(chapter.wordCount) : ''}</span>
    </div>
  )
}

function ContextMenu({
  x, y, relPath,
  onRename, onDelete, onClose,
}: {
  x: number; y: number; relPath: string
  onRename: (r: string) => void
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
      <button className="ctx-item" onClick={() => { onRename(relPath); onClose() }}>Rename</button>
      <button className="ctx-item ctx-item--danger" onClick={() => { onDelete(relPath); onClose() }}>Delete</button>
    </div>
  )
}

export function App() {
  const [chapters, setChapters] = useState<ChapterItem[]>([])
  const [totalWords, setTotalWords] = useState(0)
  const [projectName, setProjectName] = useState('Manuscript')
  const [ctx, setCtx] = useState<{ x: number; y: number; relPath: string } | null>(null)
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as { type: string } & Record<string, unknown>
      if (msg.type === 'chapters') {
        setChapters(msg.chapters as ChapterItem[])
        setTotalWords(msg.totalWords as number)
        setProjectName(msg.projectName as string)
      } else if (msg.type === 'activeChapter') {
        const relPath = msg.relPath as string | null
        setChapters(prev => prev.map(c => ({ ...c, isActive: c.relPath === relPath })))
      }
    }
    window.addEventListener('message', handler)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', handler)
  }, [])

  const openChapter = useCallback((relPath: string) => {
    vscode.postMessage({ type: 'openChapter', relPath })
  }, [])

  const newChapter = useCallback(() => {
    vscode.postMessage({ type: 'newChapter' })
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, relPath: string) => {
    e.preventDefault()
    setCtx({ x: e.clientX, y: e.clientY, relPath })
  }, [])

  const handleDragStart = useCallback((index: number) => {
    setDragFromIndex(index)
  }, [])

  const handleDragOver = useCallback((_e: React.DragEvent, index: number) => {
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((toIndex: number) => {
    setDragFromIndex(null)
    setDragOverIndex(null)
    if (dragFromIndex === null || dragFromIndex === toIndex) return

    const reordered = [...chapters]
    const [moved] = reordered.splice(dragFromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    // Optimistic update so the UI snaps instantly
    setChapters(reordered)

    vscode.postMessage({
      type: 'reorderChapters',
      orderedRelPaths: reordered.map(c => c.relPath),
    })
  }, [dragFromIndex, chapters])

  const handleDragEnd = useCallback(() => {
    setDragFromIndex(null)
    setDragOverIndex(null)
  }, [])

  return (
    <div className="manuscript-root">
      <div className="manuscript-header">
        <span className="manuscript-project">{projectName}</span>
        <span className="manuscript-total">{totalWords > 0 ? formatWords(totalWords) : ''}</span>
      </div>

      <div className="chapter-list">
        {chapters.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__heading">Nothing drafted yet</p>
            <p>When you're ready to write, your chapters appear here with live word counts. Start with chapter 1 below, or finish planning first.</p>
          </div>
        ) : (
          chapters.map((ch, i) => (
            <ChapterRow
              key={ch.relPath}
              chapter={ch}
              index={i}
              isDragOver={dragOverIndex === i && dragFromIndex !== i}
              onOpen={openChapter}
              onContextMenu={handleContextMenu}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </div>

      <div className="manuscript-footer">
        <button className="new-chapter-btn" onClick={newChapter}>+ New chapter</button>
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y} relPath={ctx.relPath}
          onRename={r => vscode.postMessage({ type: 'renameChapter', relPath: r })}
          onDelete={r => vscode.postMessage({ type: 'deleteChapter', relPath: r })}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  )
}
