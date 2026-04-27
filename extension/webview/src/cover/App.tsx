import React, { useEffect, useReducer, useRef } from 'react'

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }
const vscode = acquireVsCodeApi()

type Screen = 'setup' | 'generating' | 'front-preview' | 'generating-back' | 'both-preview' | 'saving' | 'done'
type PaperType = 'white' | 'cream'

interface GalleryItem {
  filename: string
  uri: string
  absolutePath: string
  isActive: boolean
}

interface State {
  screen: Screen
  title: string
  author: string
  genre: string
  wordCount: number
  spineLabel: string
  spineLabelCream: string
  paperType: PaperType
  blurb: string
  blurbStreaming: boolean
  styleDirection: string
  customPrompt: string
  customPromptDirty: boolean
  frontUri: string | null
  backUri: string | null
  frontGallery: GalleryItem[]
  backGallery: GalleryItem[]
  wraparoundUri: string | null
  wraparoundError: string | null
  phase: string
  error: string | null
  creditCost: number
}

type Action =
  | { type: 'init'; payload: Partial<State> }
  | { type: 'blurbStart' }
  | { type: 'blurbChunk'; text: string }
  | { type: 'blurbDone' }
  | { type: 'blurbError'; message: string }
  | { type: 'progress'; phase: string }
  | { type: 'frontGenerated'; uri: string; gallery?: GalleryItem[] }
  | { type: 'backGenerated'; uri: string; gallery?: GalleryItem[] }
  | { type: 'frontGalleryUpdated'; gallery: GalleryItem[] }
  | { type: 'backGalleryUpdated'; gallery: GalleryItem[] }
  | { type: 'coverSaved'; frontUri: string; wraparoundUri: string | null; wraparoundError?: string | null }
  | { type: 'error'; message: string }
  | { type: 'setBlurb'; text: string }
  | { type: 'setStyle'; text: string }
  | { type: 'setCustomPrompt'; text: string }
  | { type: 'resetCustomPrompt' }
  | { type: 'setPaperType'; paperType: PaperType }
  | { type: 'regenerateFront' }
  | { type: 'regenerateBack' }
  | { type: 'approveBack' }

const INITIAL: State = {
  screen: 'setup', title: '', author: '', genre: '', wordCount: 0,
  spineLabel: '', spineLabelCream: '', paperType: 'white',
  blurb: '', blurbStreaming: false, styleDirection: '',
  customPrompt: '', customPromptDirty: false,
  frontUri: null, backUri: null, wraparoundUri: null, wraparoundError: null,
  frontGallery: [], backGallery: [],
  phase: '', error: null, creditCost: 40,
}

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'init': return { ...s, ...a.payload }
    case 'blurbStart': return { ...s, blurb: '', blurbStreaming: true, error: null }
    case 'blurbChunk': return { ...s, blurb: s.blurb + a.text }
    case 'blurbDone': return { ...s, blurbStreaming: false }
    case 'blurbError': return { ...s, blurbStreaming: false, error: a.message }
    case 'progress': return { ...s, phase: a.phase }
    case 'frontGenerated': return { ...s, screen: 'front-preview', frontUri: a.uri, phase: '', frontGallery: a.gallery ?? s.frontGallery }
    case 'backGenerated': return { ...s, screen: 'both-preview', backUri: a.uri, phase: '', backGallery: a.gallery ?? s.backGallery }
    case 'frontGalleryUpdated': return { ...s, frontGallery: a.gallery }
    case 'backGalleryUpdated': return { ...s, backGallery: a.gallery }
    case 'coverSaved': return { ...s, screen: 'done', frontUri: a.frontUri, wraparoundUri: a.wraparoundUri, wraparoundError: a.wraparoundError ?? null, phase: '' }
    case 'error': return { ...s, screen: s.screen === 'generating' || s.screen === 'generating-back' || s.screen === 'saving' ? 'setup' : s.screen, phase: '', error: a.message }
    case 'setBlurb': return { ...s, blurb: a.text }
    case 'setStyle': return { ...s, styleDirection: a.text }
    case 'setCustomPrompt': return { ...s, customPrompt: a.text, customPromptDirty: true }
    case 'resetCustomPrompt': return { ...s, customPrompt: '', customPromptDirty: false }
    case 'setPaperType': return { ...s, paperType: a.paperType }
    case 'regenerateFront': return { ...s, screen: 'setup', frontUri: null, backUri: null }
    case 'regenerateBack': return { ...s, screen: 'front-preview', backUri: null }
    case 'approveBack': return { ...s, screen: 'saving' }
    default: return s
  }
}

export function App(): JSX.Element {
  const [s, dispatch] = useReducer(reduce, INITIAL)

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>
      switch (msg.type) {
        case 'init': dispatch({ type: 'init', payload: msg as Partial<State> }); break
        case 'blurbStart': dispatch({ type: 'blurbStart' }); break
        case 'blurbChunk': dispatch({ type: 'blurbChunk', text: msg.text as string }); break
        case 'blurbDone': dispatch({ type: 'blurbDone' }); break
        case 'blurbError': dispatch({ type: 'blurbError', message: msg.message as string }); break
        case 'progress': dispatch({ type: 'progress', phase: msg.phase as string }); break
        case 'frontGenerated': dispatch({ type: 'frontGenerated', uri: msg.uri as string, gallery: msg.gallery as GalleryItem[] | undefined }); break
        case 'backGenerated': dispatch({ type: 'backGenerated', uri: msg.uri as string, gallery: msg.gallery as GalleryItem[] | undefined }); break
        case 'frontGalleryUpdated': dispatch({ type: 'frontGalleryUpdated', gallery: msg.gallery as GalleryItem[] }); break
        case 'backGalleryUpdated': dispatch({ type: 'backGalleryUpdated', gallery: msg.gallery as GalleryItem[] }); break
        case 'coverSaved': dispatch({ type: 'coverSaved', frontUri: msg.frontUri as string, wraparoundUri: msg.wraparoundUri as string | null, wraparoundError: (msg.wraparoundError as string | null | undefined) ?? null }); break
        case 'error': dispatch({ type: 'error', message: msg.message as string }); break
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const defaultFrontPrompt = (): string => {
    const parts = [`Generate a professional book cover (front face only).\nPortrait orientation, 2:3 aspect ratio (6 inches wide × 9 inches tall).\nDo NOT generate a square image.`]
    if (s.title) parts.push(`Title: "${s.title}" — large, dominant, clearly legible`)
    if (s.author) parts.push(`Author: "${s.author}"`)
    if (s.genre) parts.push(`Genre: ${s.genre}`)
    if (s.styleDirection) parts.push(`Style: ${s.styleDirection}`)
    else parts.push(`Style: atmospheric, genre-appropriate, publication-quality`)
    parts.push(`Requirements: suitable for Amazon KDP. No spine, no back cover, front face only.`)
    return parts.join('\n')
  }

  const buildFrontPrompt = (): string => {
    return s.customPromptDirty && s.customPrompt.trim() ? s.customPrompt : defaultFrontPrompt()
  }

  const buildBackPrompt = () => {
    const blurbText = s.blurb || '(no blurb — generate atmospheric back cover)'
    return `Generate a book back cover, atmospheric continuation of the attached front cover.
Match its colour palette, texture, and lighting exactly.
Portrait orientation, 2:3 aspect ratio (6 inches wide × 9 inches tall).
Do NOT generate a square image.

Back cover text (render legibly in a clean serif font, upper portion):
"${blurbText}"

Bottom-right: leave a clean blank rectangle 600×360px for the ISBN barcode (must be empty — KDP adds it).

Style: continuation of front cover atmosphere — do not introduce new colours or motifs.`
  }

  if (s.screen === 'generating') {
    return <Spinner phase={s.phase} label="Generating front cover" />
  }
  if (s.screen === 'generating-back') {
    return <Spinner phase={s.phase} label="Generating back cover" />
  }
  if (s.screen === 'saving') {
    return <Spinner phase={s.phase} label="Compositing wraparound" />
  }

  if (s.screen === 'front-preview') {
    return (
      <div className="cover-panel">
        <h1>Front Cover</h1>
        <p className="subtitle">Save as ebook cover, generate the back for a print wraparound, or regenerate.</p>
        {s.frontUri && <img className="cover-preview-img" src={s.frontUri} alt="Front cover" />}
        {s.error && <div className="error-box">{s.error}</div>}
        <div className="action-row">
          <button className="btn-primary" onClick={() => {
            vscode.postMessage({ type: 'saveFrontOnly', title: s.title, author: s.author })
            dispatch({ type: 'init', payload: { screen: 'saving' } })
          }}>Save (ebook only)</button>
          <button className="btn-secondary" onClick={() => {
            const prompt = buildBackPrompt()
            dispatch({ type: 'progress', phase: '' })
            vscode.postMessage({ type: 'generateBack', prompt })
            dispatch({ type: 'init', payload: { screen: 'generating-back' } })
          }}>Generate back cover →</button>
          <button className="btn-ghost" onClick={() => dispatch({ type: 'regenerateFront' })}>Regenerate</button>
        </div>
      </div>
    )
  }

  if (s.screen === 'both-preview') {
    return (
      <div className="cover-panel">
        <h1>Cover Preview</h1>
        <p className="subtitle">{s.spineLabel}</p>
        <div className="both-preview-grid">
          {s.backUri && (
            <div className="preview-col">
              <div className="preview-label">Back</div>
              <img className="cover-preview-img cover-preview-img--half" src={s.backUri} alt="Back cover" />
            </div>
          )}
          {s.frontUri && (
            <div className="preview-col">
              <div className="preview-label">Front</div>
              <img className="cover-preview-img cover-preview-img--half" src={s.frontUri} alt="Front cover" />
            </div>
          )}
        </div>
        {s.error && <div className="error-box">{s.error}</div>}
        <div className="action-row">
          <button className="btn-primary" onClick={() => {
            vscode.postMessage({ type: 'useThisCover', title: s.title, author: s.author, paperType: s.paperType })
            dispatch({ type: 'approveBack' })
          }}>Use this cover</button>
          <button className="btn-ghost" onClick={() => {
            const prompt = buildBackPrompt()
            vscode.postMessage({ type: 'generateBack', prompt })
            dispatch({ type: 'init', payload: { screen: 'generating-back' } })
          }}>Regenerate back</button>
          <button className="btn-ghost" onClick={() => dispatch({ type: 'regenerateFront' })}>Start over</button>
        </div>
      </div>
    )
  }

  if (s.screen === 'done') {
    return (
      <div className="cover-panel">
        <div className="done-screen">
          <div className="done-icon" aria-hidden="true" />
          <h2>Cover saved</h2>
          <p className="subtitle">assets/cover.jpg (ebook) is ready for compile.</p>
          {s.wraparoundUri ? (
            <p className="subtitle">KDP print wraparound composited — <code>assets/cover-wraparound.jpg</code></p>
          ) : (
            <p className="subtitle" style={{ color: 'var(--vscode-errorForeground)' }}>
              {s.wraparoundError ?? 'Wraparound print cover not built.'}
            </p>
          )}
          <div className="action-row">
            <button className="btn-ghost" onClick={() => dispatch({ type: 'regenerateFront' })}>Generate new cover</button>
          </div>
        </div>
      </div>
    )
  }

  // Setup screen
  return (
    <div className="cover-panel">
      <h1>Generate Cover</h1>
      <p className="subtitle">AI-generated book cover from your planning notes. ~{s.creditCost} credits per image.</p>

      <div className="field">
        <label>Title</label>
        <input type="text" value={s.title} onChange={e => dispatch({ type: 'init', payload: { title: e.target.value } })} />
      </div>
      <div className="field">
        <label>Author</label>
        <input type="text" value={s.author} onChange={e => dispatch({ type: 'init', payload: { author: e.target.value } })} />
      </div>

      <div className="field">
        <div className="field-label-row">
          <label>Back cover blurb</label>
          <button className="btn-micro" onClick={() => vscode.postMessage({ type: 'regenerateBlurb' })} disabled={s.blurbStreaming}>
            {s.blurbStreaming ? 'Writing…' : 'Regenerate'}
          </button>
        </div>
        <textarea
          className="blurb-textarea"
          rows={6}
          value={s.blurb}
          placeholder={s.blurbStreaming ? 'Writing blurb…' : 'Blurb will appear here…'}
          onChange={e => dispatch({ type: 'setBlurb', text: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Style direction <span className="hint">(optional — feeds the default prompt)</span></label>
        <input
          type="text"
          value={s.styleDirection}
          placeholder="e.g. dark Victorian engraving, navy and gold, cipher motifs"
          onChange={e => dispatch({ type: 'setStyle', text: e.target.value })}
          disabled={s.customPromptDirty}
        />
      </div>

      <div className="field">
        <div className="field-label-row">
          <label>Image prompt <span className="hint">(edit to take full control)</span></label>
          {s.customPromptDirty && (
            <button className="btn-micro" onClick={() => dispatch({ type: 'resetCustomPrompt' })}>
              Reset to default
            </button>
          )}
        </div>
        <textarea
          className="blurb-textarea"
          rows={10}
          value={s.customPromptDirty ? s.customPrompt : defaultFrontPrompt()}
          placeholder="Describe the cover you want…"
          onChange={e => dispatch({ type: 'setCustomPrompt', text: e.target.value })}
        />
        <div className="hint" style={{ marginTop: 4 }}>
          Generates 1024 × 1536, upscaled to 1800 × 2700 for KDP 6 × 9 print at 300 dpi.
        </div>
      </div>

      <div className="field">
        <label>Paper type</label>
        <div className="format-toggle">
          {(['white', 'cream'] as const).map(pt => (
            <button key={pt} className={`format-btn${s.paperType === pt ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'setPaperType', paperType: pt })}>
              {pt.charAt(0).toUpperCase() + pt.slice(1)}
            </button>
          ))}
        </div>
        <div className="spine-label">{s.paperType === 'cream' ? s.spineLabelCream : s.spineLabel}</div>
      </div>

      {s.error && <div className="error-box">{s.error}</div>}

      <div className="action-row">
        <button className="btn-primary" onClick={() => {
          const prompt = buildFrontPrompt()
          vscode.postMessage({ type: 'generateFront', prompt })
          dispatch({ type: 'init', payload: { screen: 'generating', phase: 'Starting…', error: null } })
        }}>
          Generate new front cover →
        </button>
        <span className="existing-note">
          New covers are saved alongside existing ones — pick the active one from the library below.
        </span>
      </div>

      <CoverGallery
        kind="front"
        items={s.frontGallery}
        onSelect={(it) => vscode.postMessage({ type: 'selectCover', kind: 'front', absolutePath: it.absolutePath })}
        onDelete={(it) => vscode.postMessage({ type: 'deleteCover', kind: 'front', absolutePath: it.absolutePath })}
      />

      <CoverGallery
        kind="back"
        items={s.backGallery}
        onSelect={(it) => vscode.postMessage({ type: 'selectCover', kind: 'back', absolutePath: it.absolutePath })}
        onDelete={(it) => vscode.postMessage({ type: 'deleteCover', kind: 'back', absolutePath: it.absolutePath })}
      />
    </div>
  )
}

function CoverGallery({
  kind, items, onSelect, onDelete,
}: {
  kind: 'front' | 'back'
  items: GalleryItem[]
  onSelect: (it: GalleryItem) => void
  onDelete: (it: GalleryItem) => void
}): JSX.Element | null {
  if (!items.length) return null
  return (
    <div className="cover-gallery">
      <h3 className="cover-gallery-heading">
        {kind === 'front' ? 'Front cover library' : 'Back cover library'} <span style={{ opacity: 0.6, fontWeight: 400 }}>({items.length})</span>
      </h3>
      <div className="cover-gallery-grid">
        {items.map(it => (
          <div key={it.absolutePath} className={`cover-gallery-card${it.isActive ? ' is-active' : ''}`}>
            <img src={it.uri} alt="" />
            <div className="cover-gallery-actions">
              {it.isActive ? (
                <span className="cover-gallery-tag">✓ Active</span>
              ) : (
                <button className="btn-micro" onClick={() => onSelect(it)}>Use this</button>
              )}
              <button className="btn-micro btn-danger" onClick={() => onDelete(it)} title="Delete">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Spinner({ phase, label }: { phase: string; label: string }): JSX.Element {
  return (
    <div className="cover-panel">
      <div className="spinner-screen">
        <div className="spinner" />
        <div className="spinner-label">{label}…</div>
        <div className="spinner-phase">{phase}</div>
      </div>
    </div>
  )
}
