import React, { useEffect, useReducer } from 'react'
import { Check, X, Image as ImageIcon } from 'lucide-react'

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(s: unknown): void
}
const vscode = acquireVsCodeApi()

// ── Types ────────────────────────────────────────────────────────────────────

interface CompileMetadata {
  title: string
  author: string | null
  language: string
  publisher?: string
  coverImage?: string | null
}

type PrintTrim = '6x9' | '7x10' | '8x10' | '8.5x8.5'

interface CompileConfig {
  metadata: CompileMetadata
  bookStyle?: string
  theme?: string   // legacy alias
  epub?: { theme?: string }
  pdf?: { pageSize?: 'A5' | 'US Letter'; trim?: PrintTrim }
  nonfiction?: { citationStyle?: 'chicago' | 'apa' | 'mla'; generateExtras?: boolean }
}

interface BookStyleInfo {
  id: string
  name: string
  genre: string
  description: string
  accent: string
}

type Format = 'epub' | 'print-pdf'
type Screen = 'form' | 'compiling' | 'done'

const BOOK_STYLES: BookStyleInfo[] = [
  {
    id: 'atticus',
    name: 'Atticus',
    genre: 'Literary fiction',
    description: 'Crimson Pro, four-line italic drop cap, ❦ fleuron, hairline chapter rule.',
    accent: '#5c6e4a',
  },
  {
    id: 'classic-serif',
    name: 'Classic Serif',
    genre: 'Traditional fiction',
    description: 'Crimson Pro, bold three-line drop cap, * * * scene break.',
    accent: '#7a6248',
  },
  {
    id: 'heritage',
    name: 'Heritage',
    genre: 'Historical / Regency',
    description: 'EB Garamond, true small caps, four-line drop cap, ❦ fleuron.',
    accent: '#7a3535',
  },
  {
    id: 'riverside',
    name: 'Riverside',
    genre: 'Contemporary literary',
    description: 'Source Serif 4, hairline chapter rules, small-caps opening, minimal scene break.',
    accent: '#3a6e7a',
  },
  {
    id: 'strand',
    name: 'Strand',
    genre: 'Thriller / Commercial',
    description: 'Source Serif 4 body, bold Jakarta Sans numerals, no drop cap. Tight and driven.',
    accent: '#1e1e1e',
  },
  {
    id: 'modern-sans',
    name: 'Modern Sans',
    genre: 'Contemporary / Non-fiction',
    description: 'Plus Jakarta Sans body, Inter display, small-caps opening, · · · scene break.',
    accent: '#3a5a7a',
  },
]

const TRIM_OPTIONS: Array<{ id: PrintTrim; label: string; sub: string }> = [
  { id: '6x9', label: 'Trade Paperback', sub: '6 × 9 in — novels (default)' },
  { id: '7x10', label: 'Academic / Textbook', sub: '7 × 10 in — non-fiction, scholarly' },
  { id: '8x10', label: 'Picture Book — Portrait', sub: '8 × 10 in — illustrated children’s' },
  { id: '8.5x8.5', label: 'Picture Book — Square', sub: '8.5 × 8.5 in — square picture book' },
]

interface State {
  screen: Screen
  config: CompileConfig
  format: Format
  trim: PrintTrim
  projectMode: 'fiction' | 'nonfiction'
  chapters: string[]
  // Webview-safe URI for the cover thumbnail (built host-side via
  // asWebviewUri). The actual cover path is in config.metadata.coverImage.
  coverThumbUri: string | null
  phase: string
  success: boolean
  outputPath: string | null
  bytes: number
  warnings: string[]
  error: string | null
}

type Action =
  | { type: 'init'; config: CompileConfig; projectMode: 'fiction' | 'nonfiction'; chapters: string[]; initialFormat?: Format; coverThumbUri?: string | null }
  | { type: 'setFormat'; format: Format }
  | { type: 'setTrim'; trim: PrintTrim }
  | { type: 'setTitle'; title: string }
  | { type: 'setAuthor'; author: string }
  | { type: 'setCover'; coverPath: string; coverThumbUri: string | null }
  | { type: 'setBookStyle'; bookStyle: string }
  | { type: 'setCitationStyle'; style: 'chicago' | 'apa' | 'mla' }
  | { type: 'setGenerateExtras'; enabled: boolean }
  | { type: 'compileStart'; format: Format }
  | { type: 'compileProgress'; phase: string }
  | { type: 'compileDone'; success: boolean; outputPath?: string; bytes?: number; warnings?: string[]; error?: string }
  | { type: 'reset' }

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'init': {
      const persistedTrim = action.config.pdf?.trim
      return {
        ...state,
        config: action.config,
        projectMode: action.projectMode,
        chapters: action.chapters,
        format: action.initialFormat ?? state.format,
        trim: persistedTrim ?? state.trim,
        coverThumbUri: action.coverThumbUri ?? null,
      }
    }
    case 'setFormat':
      return { ...state, format: action.format }
    case 'setTrim':
      return {
        ...state,
        trim: action.trim,
        config: { ...state.config, pdf: { ...state.config.pdf, trim: action.trim } },
      }
    case 'setTitle':
      return { ...state, config: { ...state.config, metadata: { ...state.config.metadata, title: action.title } } }
    case 'setAuthor':
      return { ...state, config: { ...state.config, metadata: { ...state.config.metadata, author: action.author } } }
    case 'setCover':
      return {
        ...state,
        config: {
          ...state.config,
          metadata: {
            ...state.config.metadata,
            // Empty string from the host means "clear" — store as null so
            // compile.config.json doesn't carry a stale path.
            coverImage: action.coverPath ? action.coverPath : null,
          },
        },
        coverThumbUri: action.coverThumbUri,
      }
    case 'setBookStyle':
      return { ...state, config: { ...state.config, bookStyle: action.bookStyle } }
    case 'setCitationStyle':
      return { ...state, config: { ...state.config, nonfiction: { ...state.config.nonfiction, citationStyle: action.style } } }
    case 'setGenerateExtras':
      return { ...state, config: { ...state.config, nonfiction: { ...state.config.nonfiction, generateExtras: action.enabled } } }
    case 'compileStart':
      return { ...state, screen: 'compiling', format: action.format, phase: 'Starting…', error: null }
    case 'compileProgress':
      return { ...state, phase: action.phase }
    case 'compileDone':
      return {
        ...state,
        screen: 'done',
        success: action.success,
        outputPath: action.outputPath ?? null,
        bytes: action.bytes ?? 0,
        warnings: action.warnings ?? [],
        error: action.error ?? null,
      }
    case 'reset':
      return { ...state, screen: 'form' }
    default:
      return state
  }
}

const INITIAL: State = {
  screen: 'form',
  config: { metadata: { title: '', author: null, language: 'en' }, bookStyle: 'classic-serif' },
  format: 'epub',
  trim: '6x9',
  projectMode: 'fiction',
  chapters: [],
  coverThumbUri: null,
  phase: '',
  success: false,
  outputPath: null,
  bytes: 0,
  warnings: [],
  error: null,
}

// ── Component ─────────────────────────────────────────────────────────────────

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(reduce, INITIAL)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>
      switch (msg.type) {
        case 'init':
          dispatch({
            type: 'init',
            config: msg.config as CompileConfig,
            projectMode: (msg.projectMode as 'fiction' | 'nonfiction') ?? 'fiction',
            chapters: (msg.chapters as string[]) ?? [],
            initialFormat: msg.initialFormat as Format | undefined,
            coverThumbUri: (msg.coverThumbUri as string | null | undefined) ?? null,
          })
          break
        case 'setFormat':
          dispatch({ type: 'setFormat', format: msg.format as Format })
          break
        case 'coverImagePicked':
          dispatch({
            type: 'setCover',
            coverPath: msg.coverPath as string,
            coverThumbUri: (msg.coverThumbUri as string | null | undefined) ?? null,
          })
          break
        case 'compileStart':
          dispatch({ type: 'compileStart', format: msg.format as Format })
          break
        case 'compileProgress':
          dispatch({ type: 'compileProgress', phase: msg.phase as string })
          break
        case 'compileDone':
          dispatch({
            type: 'compileDone',
            success: msg.success as boolean,
            outputPath: msg.outputPath as string | undefined,
            bytes: msg.bytes as number | undefined,
            warnings: msg.warnings as string[] | undefined,
            error: msg.error as string | undefined,
          })
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  if (state.screen === 'compiling') return <CompileProgress state={state} />
  if (state.screen === 'done') return <CompileResult state={state} dispatch={dispatch} />
  return <CompileForm state={state} dispatch={dispatch} />
}

// ── Form screen ───────────────────────────────────────────────────────────────

function CompileForm({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }): JSX.Element {
  const { config, format, trim, projectMode, chapters, coverThumbUri } = state
  const { metadata } = config
  const coverName = metadata.coverImage ? metadata.coverImage.split('/').pop() : null

  const handleCompile = () => {
    vscode.postMessage({ type: 'compile', config, format, trim })
  }

  return (
    <div className="compile-panel">
      <h1>Compile</h1>
      <p className="subtitle">Export your manuscript to EPUB or PDF.</p>

      {/* Format selector */}
      <div className="section">
        <div className="section-label">Output format</div>
        <div className="format-toggle">
          <button
            className={`format-btn${format === 'epub' ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'setFormat', format: 'epub' })}
          >EPUB</button>
          <button
            className={`format-btn${format === 'print-pdf' ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'setFormat', format: 'print-pdf' })}
          >Print PDF</button>
        </div>
      </div>

      {/* Trim selector — only relevant for Print PDF */}
      {format === 'print-pdf' && (
        <div className="section">
          <div className="section-label">Print trim size</div>
          <select
            className="theme-select"
            value={trim}
            onChange={e => dispatch({ type: 'setTrim', trim: e.target.value as PrintTrim })}
          >
            {TRIM_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label} — {opt.sub}</option>
            ))}
          </select>
        </div>
      )}

      <div className="divider" />

      {/* Metadata */}
      <div className="section">
        <div className="section-label">Metadata</div>

        <div className="field">
          <label>Title</label>
          <input
            type="text"
            value={metadata.title}
            placeholder="My Novel"
            onChange={e => dispatch({ type: 'setTitle', title: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Author</label>
          <input
            type="text"
            value={metadata.author ?? ''}
            placeholder="Jane Smith"
            onChange={e => dispatch({ type: 'setAuthor', author: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Cover image</label>
          <div className="cover-row">
            {coverName && coverThumbUri
              ? <img className="cover-preview" src={coverThumbUri} alt="cover" />
              : <div className="cover-placeholder"><ImageIcon size={20} strokeWidth={1.5} /></div>
            }
            <span className="cover-filename">{coverName ?? 'No image selected'}</span>
            <button className="btn-ghost" onClick={() => vscode.postMessage({ type: 'pickCoverImage' })}>
              {coverName ? 'Replace…' : 'Choose…'}
            </button>
            {coverName && (
              <button
                className="btn-ghost"
                onClick={() => vscode.postMessage({ type: 'clearCoverImage' })}
                title="Remove cover image"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Book Style picker */}
      <div className="section">
        <div className="section-label">Book Style</div>
        <BookStylePicker
          selected={config.bookStyle ?? config.theme ?? 'classic-serif'}
          onChange={id => dispatch({ type: 'setBookStyle', bookStyle: id })}
        />
      </div>

      {/* Chapter order */}
      {chapters.length > 0 && (
        <div className="section">
          <div className="section-label">Chapters — filename order</div>
          <ul className="chapter-list">
            {chapters.map(ch => <li key={ch}>{ch}</li>)}
          </ul>
        </div>
      )}
      {chapters.length === 0 && (
        <div className="section">
          <div className="section-label">Chapters</div>
          <p className="chapter-list-empty">No chapters found in manuscript/ yet.</p>
        </div>
      )}

      {/* Non-fiction extras */}
      {projectMode === 'nonfiction' && (
        <>
          <div className="divider" />
          <div className="nf-section">
            <div className="section-label">Non-fiction options</div>

            <div className="field">
              <label>Citation style</label>
              <select
                className="theme-select"
                value={config.nonfiction?.citationStyle ?? 'chicago'}
                onChange={e => dispatch({ type: 'setCitationStyle', style: e.target.value as 'chicago' | 'apa' | 'mla' })}
              >
                <option value="chicago">Chicago (default)</option>
                <option value="apa">APA</option>
                <option value="mla">MLA</option>
              </select>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.nonfiction?.generateExtras !== false}
                onChange={e => dispatch({ type: 'setGenerateExtras', enabled: e.target.checked })}
              />
              Generate non-fiction extras (fact-check, bibliography, timeline)
            </label>
          </div>
        </>
      )}

      <div className="divider" />

      <button className="btn-compile" onClick={handleCompile} disabled={chapters.length === 0}>
        Compile to {format === 'epub' ? 'EPUB' : 'Print PDF'}
      </button>
      {chapters.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginTop: 8 }}>
          Add chapters to manuscript/ to enable compile.
        </p>
      )}
    </div>
  )
}

// ── Book Style Picker ─────────────────────────────────────────────────────────

function BookStylePicker({ selected, onChange }: { selected: string; onChange: (id: string) => void }): JSX.Element {
  return (
    <div className="book-style-grid">
      {BOOK_STYLES.map(style => (
        <button
          key={style.id}
          className={`book-style-card${selected === style.id ? ' selected' : ''}`}
          onClick={() => onChange(style.id)}
          title={style.description}
        >
          <span className="book-style-accent" style={{ background: style.accent }} />
          <span className="book-style-body">
            <span className="book-style-name">{style.name}</span>
            <span className="book-style-genre">{style.genre}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Compiling screen ──────────────────────────────────────────────────────────

function CompileProgress({ state }: { state: State }): JSX.Element {
  const label = state.format === 'epub' ? 'EPUB' : 'Print PDF'
  return (
    <div className="compile-panel">
      <div className="compile-progress">
        <div className="spinner" />
        <div className="progress-format">Compiling to {label}…</div>
        <div className="progress-phase">{state.phase}</div>
      </div>
    </div>
  )
}

// ── Done screen ───────────────────────────────────────────────────────────────

function CompileResult({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }): JSX.Element {
  const filename = state.outputPath?.split('/').pop() ?? state.outputPath ?? ''
  const kb = state.bytes > 0 ? ` (${(state.bytes / 1024).toFixed(0)} KB)` : ''

  return (
    <div className="compile-panel">
      <div className="compile-result">
        <div className="result-icon">{state.success ? <Check size={20} strokeWidth={2.5} /> : <X size={20} strokeWidth={2.5} />}</div>
        <div className="result-title">{state.success ? 'Compile complete' : 'Compile failed'}</div>

        {state.success && state.outputPath && (
          <div className="result-filename">{filename}{kb}</div>
        )}

        {!state.success && state.error && (
          <div className="result-error">{state.error}</div>
        )}

        <div className="result-actions">
          {state.success && state.outputPath && (
            <>
              <button className="btn-ghost" onClick={() => vscode.postMessage({ type: 'openOutput', outputPath: state.outputPath })}>
                Open
              </button>
              <button className="btn-ghost" onClick={() => vscode.postMessage({ type: 'revealOutput', outputPath: state.outputPath })}>
                Reveal in Finder
              </button>
            </>
          )}
          <button className="btn-ghost" onClick={() => dispatch({ type: 'reset' })}>
            {state.success ? 'Compile again' : 'Try again'}
          </button>
        </div>

        {state.warnings.length > 0 && (
          <div className="result-warnings">
            <strong>Warnings:</strong>
            <ul>
              {state.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
