import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import { SlashMenu } from './SlashMenu.js'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import { ResizableImage } from './extensions/ResizableImage.js'
import { ImageEditModal } from './ImageEditModal.js'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { Markdown } from 'tiptap-markdown'
import { SceneBreak } from './extensions/SceneBreak.js'
import { Footnote } from './extensions/Footnote.js'
import { vscode } from './vscode.js'
import { debounce } from './debounce.js'
import { Image as ImageIcon, AlignVerticalJustifyCenter, Type } from 'lucide-react'

type SaveStatus = 'saved' | 'pending' | 'saving' | 'failed'
type Font = 'serif' | 'sans'
type ProjectMode = 'fiction' | 'nonfiction'

type MarkdownStorage = { getMarkdown: () => string }
function getMarkdown(editor: { storage: { markdown?: MarkdownStorage } } | null | undefined): string {
  return editor?.storage.markdown?.getMarkdown() ?? ''
}

function appendFootnoteDefinitions(markdown: string, nodes: Array<{ id: number; body: string }>): string {
  if (!nodes.length) return markdown
  const defs = nodes.map(n => `[^${n.id}]: ${n.body}`).join('\n')
  return markdown.trimEnd() + '\n\n' + defs + '\n'
}

function readTypewriterPref(): boolean {
  try {
    const s = vscode.getState() as { typewriter?: boolean } | undefined
    return s?.typewriter !== false
  } catch { return true }
}
function writeTypewriterPref(enabled: boolean): void {
  try {
    const s = (vscode.getState() as Record<string, unknown>) ?? {}
    vscode.setState({ ...s, typewriter: enabled })
  } catch { /* ignore */ }
}

function countWordsLocal(markdown: string): number {
  if (!markdown) return 0
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[*_~#>|[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return 0
  return stripped.split(' ').filter(tok => /[\p{L}\p{N}]/u.test(tok)).length
}

const FONT_VARS: Record<Font, string> = {
  serif: '"Lora", Georgia, serif',
  sans:  '"Inter", system-ui, sans-serif',
}

export function Editor(): JSX.Element | null {
  const [fileLoaded, setFileLoaded]     = useState(false)
  const [status, setStatus]             = useState<SaveStatus>('saved')
  const [saveError, setSaveError]       = useState<string | null>(null)
  const [fileName, setFileName]         = useState('No file open')
  const [typewriter, setTypewriter]     = useState<boolean>(() => readTypewriterPref())
  const [composeMode, setComposeMode]   = useState(false)
  const [wordCount, setWordCount]       = useState(0)
  const [role, setRole]                 = useState<'manuscript' | 'supporting' | null>(null)
  const [font, setFont]                 = useState<Font>('serif')
  const [projectMode, setProjectMode]   = useState<ProjectMode>('fiction')
  const [imageEdit, setImageEdit]       = useState<{ src: string; pos: number; width: number | null; height: number | null } | null>(null)

  const fileLoadedRef   = useRef(false)
  const typewriterRef   = useRef(typewriter)
  const lastSavedMdRef  = useRef('')
  const suppressScrollRef = useRef(0)
  const toggleComposeRef = useRef<((next?: boolean) => void) | null>(null)

  useEffect(() => { typewriterRef.current = typewriter }, [typewriter])

  // Apply font CSS variable to editor wrapper
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font', FONT_VARS[font])
  }, [font])

  // Send every keystroke immediately so the extension's document copy stays in sync.
  // Debouncing here let pushContent fire with stale text and wipe the user's typing.
  // The autosave debounce (1500ms) is on the extension side — disk writes don't increase.
  const lastSentMdRef = useRef('')
  const sendContentChange = useMemo(
    () => (markdown: string) => {
      if (markdown === lastSentMdRef.current) return
      lastSentMdRef.current = markdown
      vscode.postMessage({ type: 'content-changed', markdown })
    },
    [],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ horizontalRule: false }),
      SceneBreak,
      Footnote,
      ResizableImage.configure({ inline: false, HTMLAttributes: { class: 'editor-img' } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ html: true, tightLists: true, linkify: true, breaks: false, transformPastedText: true }),
    ],
    editorProps: {
      handleDoubleClickOn: (_view, pos, node) => {
        if (node.type?.name !== 'image') return false
        const attrs = node.attrs as { src?: string; width?: number | null; height?: number | null }
        if (!attrs.src) return false
        setImageEdit({
          src: attrs.src,
          pos,
          width: attrs.width ?? null,
          height: attrs.height ?? null,
        })
        return true
      },
    },
    content: '',
    onUpdate: ({ editor }) => {
      if (!fileLoadedRef.current) return
      const md = getMarkdown(editor)
      setWordCount(countWordsLocal(md))
      if (md === lastSavedMdRef.current) return
      setStatus('pending')
      setSaveError(null)
      sendContentChange(md)
    },
    onSelectionUpdate: ({ editor }) => {
      if (!typewriterRef.current) return
      const sel = editor.state.selection
      if (!sel.empty) return
      const { from } = sel
      requestAnimationFrame(() => {
        try {
          const coords = editor.view.coordsAtPos(from)
          const target = window.innerHeight * 0.45
          const delta = coords.top - target
          if (Math.abs(delta) < 48) return
          window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior })
        } catch { /* transient */ }
      })
    },
  })

  const saveNow = useMemo(() => () => {
    if (!editor) return
    const md = getMarkdown(editor)
    // Append footnote definitions before saving
    const footnotes: Array<{ id: number; body: string }> = []
    editor.state.doc.descendants(n => {
      if (n.type.name === 'footnote') footnotes.push({ id: n.attrs.id as number, body: n.attrs.body as string })
    })
    const finalMd = appendFootnoteDefinitions(md, footnotes)
    vscode.postMessage({ type: 'save', markdown: finalMd })
  }, [editor])

  const toggleCompose = useMemo(() => (next?: boolean) => {
    setComposeMode(prev => {
      const value = typeof next === 'boolean' ? next : !prev
      vscode.postMessage({ type: 'compose-mode', enabled: value })
      return value
    })
  }, [])
  useEffect(() => { toggleComposeRef.current = toggleCompose }, [toggleCompose])

  // Apply compose-mode class
  useEffect(() => {
    document.documentElement.classList.toggle('compose-mode', composeMode)
    document.body.classList.toggle('compose-mode', composeMode)
  }, [composeMode])

  // Message listener
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>

      if (msg.type === 'load-content' && editor && typeof msg.markdown === 'string') {
        const currentMd = getMarkdown(editor)
        // Guard: if the editor has unflushed local edits, never let an incoming
        // push overwrite them. This protects against format-on-save reflows
        // racing the autosave round-trip.
        const hasUnflushedEdits =
          fileLoadedRef.current &&
          currentMd !== msg.markdown &&
          currentMd !== lastSavedMdRef.current
        if (typeof msg.fileName === 'string') setFileName(msg.fileName)
        if (msg.font === 'serif' || msg.font === 'sans') setFont(msg.font)
        if (msg.projectMode === 'nonfiction') setProjectMode('nonfiction')
        if (!hasUnflushedEdits) {
          if (currentMd !== msg.markdown) {
            editor.commands.setContent(msg.markdown)
          }
          setFileLoaded(true)
          fileLoadedRef.current = true
          lastSavedMdRef.current = msg.markdown
          setWordCount(countWordsLocal(msg.markdown))
          setStatus('saved')
          setSaveError(null)
        }
        if (typeof msg.restoreScrollY === 'number' && msg.restoreScrollY > 0) {
          const target = msg.restoreScrollY
          suppressScrollRef.current = Date.now() + 600
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
              window.scrollTo({ top: Math.min(target, maxY), behavior: 'instant' as ScrollBehavior })
            })
          })
        }
      }
      if (msg.type === 'editor-role' && typeof msg.role === 'string') {
        document.documentElement.classList.remove('nw-manuscript', 'nw-supporting')
        document.body.classList.remove('nw-manuscript', 'nw-supporting')
        const cls = msg.role === 'manuscript' ? 'nw-manuscript' : 'nw-supporting'
        document.documentElement.classList.add(cls)
        document.body.classList.add(cls)
        setRole(msg.role === 'manuscript' ? 'manuscript' : 'supporting')
      }
      if (msg.type === 'font-toggle') {
        const f = msg.font === 'sans' ? 'sans' : 'serif'
        setFont(f)
        vscode.postMessage({ type: 'font-changed', font: f })
      }
      if (msg.type === 'saving') setStatus('saving')
      if (msg.type === 'saved' && editor) { lastSavedMdRef.current = getMarkdown(editor); setStatus('saved'); setSaveError(null) }
      if (msg.type === 'save-failed') { setStatus('failed'); setSaveError(typeof msg.error === 'string' ? msg.error : 'save failed') }
      if (msg.type === 'request-compose-toggle') toggleComposeRef.current?.()
      if (msg.type === 'request-flush' && editor) {
        vscode.postMessage({ type: 'content-changed', markdown: getMarkdown(editor) })
      }
    }
    window.addEventListener('message', listener)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', listener)
  }, [editor])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); return }
      if (e.key === 'Escape' && composeMode) { e.preventDefault(); toggleCompose(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow, toggleCompose, composeMode])

  // Scroll persistence
  useEffect(() => {
    const postScroll = debounce(() => {
      if (Date.now() < suppressScrollRef.current) return
      if (!fileLoadedRef.current) return
      vscode.postMessage({ type: 'scroll-changed', scrollY: window.scrollY })
    }, 400)
    window.addEventListener('scroll', postScroll, { passive: true })
    return () => window.removeEventListener('scroll', postScroll)
  }, [])

  // Flush-on-close safety net
  useEffect(() => {
    const flush = () => {
      if (!editor || !fileLoadedRef.current) return
      const md = getMarkdown(editor)
      if (md === lastSavedMdRef.current) return
      vscode.postMessage({ type: 'flush-save', markdown: md })
    }
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [editor])

  if (!editor) return null

  const btn = (active: boolean) => `toolbar-btn${active ? ' active' : ''}`

  const statusLabel = (() => {
    if (!fileLoaded) return ''
    if (status === 'saving') return 'Saving…'
    if (status === 'failed') return 'Save failed'
    return 'Saved'
  })()

  const insertSmartQuote = () => {
    editor.chain().focus().insertContent('""').run()
    // Move cursor left one character to position inside quotes
    editor.commands.setTextSelection(editor.state.selection.from - 1)
  }

  return (
    <div className="novel-editor">
      <div className="topbar">
        <div className="topbar-meta">
          <span className="topbar-filename" title={fileName}>{(fileName.split('/').pop() ?? fileName).replace(/\.[^.]+$/, '')}</span>
          <span className={`topbar-status-dot topbar-status-dot--${status}`} aria-hidden="true" />
          <span className={`topbar-status topbar-status--${status}`} title={saveError ?? 'Autosaves 1.5s after you stop typing. ⌘S to save now.'}>{statusLabel}</span>
        </div>

        <div className="topbar-actions">
          <button
            className={`topbar-icon-btn font-toggle${font === 'sans' ? ' is-sans' : ''}`}
            onClick={() => {
              const next = font === 'serif' ? 'sans' : 'serif'
              setFont(next)
              vscode.postMessage({ type: 'font-changed', font: next })
            }}
            title={font === 'serif' ? 'Serif (click to switch to sans)' : 'Sans (click to switch to serif)'}
            aria-label="Toggle font"
          >
            <Type size={14} strokeWidth={1.8} />
            <span className="font-toggle-label">{font === 'serif' ? 'Aa' : 'Aa'}</span>
          </button>

          <button
            className={`topbar-icon-btn${typewriter ? ' active' : ''}`}
            onClick={() => { const v = !typewriter; setTypewriter(v); writeTypewriterPref(v) }}
            title="Typewriter mode — centre the active line"
            aria-label="Toggle typewriter mode"
            aria-pressed={typewriter}
          >
            <AlignVerticalJustifyCenter size={14} strokeWidth={1.8} />
          </button>

          <button
            className="topbar-icon-btn"
            onClick={() => vscode.postMessage({ type: 'openIllustrations' })}
            title="Illustrations"
            aria-label="Illustrations"
          >
            <ImageIcon size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100, placement: 'top' }}
        className="bubble-menu"
        shouldShow={({ editor: ed, from, to }) => from !== to && ed.isEditable}
      >
        <button
          className={`bubble-btn${editor.isActive('bold') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (⌘B)"
        ><strong>B</strong></button>
        <button
          className={`bubble-btn${editor.isActive('italic') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (⌘I)"
        ><em>I</em></button>
        <button
          className={`bubble-btn${editor.isActive('strike') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        ><s>S</s></button>
        <span className="bubble-divider" />
        <button
          className={`bubble-btn${editor.isActive('blockquote') ? ' active' : ''}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >❝</button>
        <button
          className="bubble-btn"
          onClick={insertSmartQuote}
          title="Smart quotes"
        >“ ”</button>
      </BubbleMenu>

      <SlashMenu editor={editor} projectMode={projectMode} />

      {imageEdit && (
        <ImageEditModal
          src={imageEdit.src}
          initialWidth={imageEdit.width}
          initialHeight={imageEdit.height}
          onCancel={() => setImageEdit(null)}
          onCommit={({ width, height }) => {
            // Find the image node by src — the original pos may have shifted
            // since the modal opened. setNodeMarkup needs the current pos.
            let imagePos: number | null = null
            editor.state.doc.descendants((node, pos) => {
              if (imagePos !== null) return false
              if (node.type.name === 'image' && node.attrs.src === imageEdit.src) {
                imagePos = pos
                return false
              }
              return true
            })
            if (imagePos !== null) {
              const node = editor.state.doc.nodeAt(imagePos)
              if (node) {
                const tr = editor.state.tr.setNodeMarkup(imagePos, undefined, {
                  ...node.attrs,
                  width,
                  height,
                })
                editor.view.dispatch(tr)
              }
            }
            setImageEdit(null)
          }}
        />
      )}

      <EditorContent editor={editor} />

      {composeMode && (
        <div className="compose-bar" role="toolbar" aria-label="Compose mode">
          <button className="compose-bar-btn" onClick={() => toggleCompose(false)} title="Exit compose mode (Esc)">◀ Exit</button>
          <span className="compose-bar-divider" />
          <label className="compose-bar-checkbox">
            <input type="checkbox" checked={typewriter} onChange={e => { const v = e.target.checked; setTypewriter(v); writeTypewriterPref(v) }} />
            <span>Typewriter</span>
          </label>
          <span className="compose-bar-divider" />
          <span className="compose-bar-filename" title={fileName}>{fileName}</span>
          <div className="compose-bar-spacer" />
          <span className="compose-bar-words">{wordCount.toLocaleString()} words</span>
          <span className="compose-bar-divider" />
          <span className={`compose-bar-status compose-bar-status--${status}`}>{statusLabel}</span>
        </div>
      )}
    </div>
  )
}
