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

interface CompileConfig {
  metadata: CompileMetadata
  theme: string
  epub?: { theme?: string }
  pdf?: { pageSize?: 'A5' | 'US Letter' }
  nonfiction?: { citationStyle?: 'chicago' | 'apa' | 'mla'; generateExtras?: boolean }
}

type Format = 'epub' | 'print-pdf'
type Screen = 'form' | 'compiling' | 'done'

interface State {
  screen: Screen
  config: CompileConfig
  format: Format
  projectMode: 'fiction' | 'nonfiction'
  chapters: string[]
  phase: string
  success: boolean
  outputPath: string | null
  bytes: number
  warnings: string[]
  error: string | null
}

type Action =
  | { type: 'init'; config: CompileConfig; projectMode: 'fiction' | 'nonfiction'; chapters: string[]; initialFormat?: Format }
  | { type: 'setFormat'; format: Format }
  | { type: 'setTitle'; title: string }
  | { type: 'setAuthor'; author: string }
  | { type: 'setCover'; coverPath: string }
  | { type: 'setTheme'; theme: string }
  | { type: 'setCitationStyle'; style: 'chicago' | 'apa' | 'mla' }
  | { type: 'setGenerateExtras'; enabled: boolean }
  | { type: 'compileStart'; format: Format }
  | { type: 'compileProgress'; phase: string }
  | { type: 'compileDone'; success: boolean; outputPath?: string; bytes?: number; warnings?: string[]; error?: string }
  | { type: 'reset' }

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'init':
      return {
        ...state,
        config: action.config,
        projectMode: action.projectMode,
        chapters: action.chapters,
        format: action.initialFormat ?? state.format,
      }
    case 'setFormat':
      return { ...state, format: action.format }
    case 'setTitle':
      return { ...state, config: { ...state.config, metadata: { ...state.config.metadata, title: action.title } } }
    case 'setAuthor':
      return { ...state, config: { ...state.config, metadata: { ...state.config.metadata, author: action.author } } }
    case 'setCover':
      return { ...state, config: { ...state.config, metadata: { ...state.config.metadata, coverImage: action.coverPath } } }
    case 'setTheme':
      return { ...state, config: { ...state.config, theme: action.theme } }
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
  config: { metadata: { title: '', author: null, language: 'en' }, theme: 'classic-serif' },
  format: 'epub',
  projectMode: 'fiction',
  chapters: [],
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
          })
          break
        case 'setFormat':
          dispatch({ type: 'setFormat', format: msg.format as Format })
          break
        case 'coverImagePicked':
          dispatch({ type: 'setCover', coverPath: msg.coverPath as string })
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
  const { config, format, projectMode, chapters } = state
  const { metadata } = config
  const coverName = metadata.coverImage ? metadata.coverImage.split('/').pop() : null

  const handleCompile = () => {
    vscode.postMessage({ type: 'compile', config, format })
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
            {coverName
              ? <img className="cover-preview" src={`vscode-resource:${metadata.coverImage}`} alt="cover" />
              : <div className="cover-placeholder"><ImageIcon size={20} strokeWidth={1.5} /></div>
            }
            <span className="cover-filename">{coverName ?? 'No image selected'}</span>
            <button className="btn-ghost" onClick={() => vscode.postMessage({ type: 'pickCoverImage' })}>
              Choose…
            </button>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Theme */}
      <div className="section">
        <div className="section-label">Theme</div>
        <select
          className="theme-select"
          value={config.theme}
          onChange={e => dispatch({ type: 'setTheme', theme: e.target.value })}
        >
          <option value="classic-serif">Classic Serif</option>
          <option value="heritage">Heritage</option>
          <option value="modern-sans">Modern Sans</option>
        </select>
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
