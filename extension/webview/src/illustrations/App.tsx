import React, { useEffect, useReducer, useState } from 'react'
import { Trash2, ExternalLink, RotateCcw, FileImage, Plus } from 'lucide-react'

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }
const vscode = acquireVsCodeApi()

interface Illustration { filename: string; uri: string; absolutePath: string; type?: string; isRef?: boolean; refKind?: string }

interface RefItem { filename: string; uri: string; absolutePath: string; kind: string; characterId?: string }

interface Character { id: string; name: string; description: string; isProtagonist: boolean }
interface StyleBible {
  characters: Character[]
  artStyle: string
  palette: string
  tone: string
}

interface State {
  illustrations: Illustration[]
  refs: RefItem[]
  styleBible: StyleBible
  generating: boolean
  phase: string
  error: string | null
  creditCost: number
  lastGenerated: Illustration | null
}

type Action =
  | { type: 'init'; illustrations: Illustration[]; creditCost: number; styleBible: StyleBible; refs: RefItem[] }
  | { type: 'refsUpdated'; illustrations: Illustration[]; refs: RefItem[] }
  | { type: 'styleBibleSaved'; styleBible: StyleBible }
  | { type: 'generated'; illustration: Illustration }
  | { type: 'progress'; phase: string }
  | { type: 'error'; message: string }
  | { type: 'delete'; absolutePath: string }
  | { type: 'clearJustGenerated' }

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'init':              return { ...s, illustrations: a.illustrations, creditCost: a.creditCost, styleBible: a.styleBible ?? s.styleBible, refs: a.refs ?? s.refs, generating: false, phase: '', error: null }
    case 'refsUpdated':       return { ...s, illustrations: a.illustrations, refs: a.refs }
    case 'styleBibleSaved':   return { ...s, styleBible: a.styleBible }
    case 'generated':         return { ...s, illustrations: [...s.illustrations, a.illustration], lastGenerated: a.illustration, generating: false, phase: '', error: null }
    case 'progress':          return { ...s, generating: true, phase: a.phase, error: null }
    case 'error':             return { ...s, generating: false, phase: '', error: a.message }
    case 'delete':            return { ...s, illustrations: s.illustrations.filter(i => i.absolutePath !== a.absolutePath), lastGenerated: s.lastGenerated?.absolutePath === a.absolutePath ? null : s.lastGenerated }
    case 'clearJustGenerated': return { ...s, lastGenerated: null }
    default: return s
  }
}

const EMPTY_BIBLE: StyleBible = { characters: [], artStyle: '', palette: '', tone: '' }
const INITIAL: State = { illustrations: [], refs: [], styleBible: EMPTY_BIBLE, generating: false, phase: '', error: null, creditCost: 40, lastGenerated: null }

interface IllustrationType {
  label: string
  slug: string
  /** Quality tier — drives credit cost (low=5, medium=15, high=40). */
  quality: 'low' | 'medium' | 'high'
  /** Default aspect ratio for this use case; user can override. */
  defaultAspect: AspectRatio
  promptScaffold: string
}

type AspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16'

interface AspectSpec {
  /** Final on-disk dimensions after sharp crops. */
  width: number
  height: number
  /** Closest size the model natively supports (1024×1024, 1024×1536, 1536×1024). */
  generationSize: string
}

const ASPECTS: Record<AspectRatio, AspectSpec> = {
  '16:9': { width: 1536, height: 864,  generationSize: '1536x1024' },  // landscape
  '4:3':  { width: 1024, height: 768,  generationSize: '1024x1024' },  // landscape (cropped from sq)
  '1:1':  { width: 1024, height: 1024, generationSize: '1024x1024' },  // square
  '3:4':  { width: 768,  height: 1024, generationSize: '1024x1024' },  // portrait (cropped from sq)
  '9:16': { width: 864,  height: 1536, generationSize: '1024x1536' },  // tall portrait
}

const ASPECT_LABELS: Record<AspectRatio, string> = {
  '16:9': '16 : 9  ·  Landscape',
  '4:3':  '4 : 3  ·  Landscape',
  '1:1':  '1 : 1  ·  Square',
  '3:4':  '3 : 4  ·  Portrait',
  '9:16': '9 : 16  ·  Tall portrait',
}

const TYPES: IllustrationType[] = [
  {
    label: 'Chapter header',
    slug: 'chapter-header',
    quality: 'medium',
    defaultAspect: '16:9',
    promptScaffold: 'A wide, atmospheric chapter header illustration suitable for the top of a book chapter. Cinematic, evocative, no text. Subject:',
  },
  {
    label: 'Character portrait',
    slug: 'character-portrait',
    quality: 'low',
    defaultAspect: '3:4',
    promptScaffold: 'A head-and-shoulders portrait illustration of a single character, neutral background, suitable for character reference. Subject:',
  },
  {
    label: 'Setting / location reference',
    slug: 'setting-ref',
    quality: 'low',
    defaultAspect: '4:3',
    promptScaffold: 'A reference illustration of a location or setting, atmospheric, no people, no text. Subject:',
  },
  {
    label: 'Map',
    slug: 'map',
    quality: 'medium',
    defaultAspect: '1:1',
    promptScaffold: 'A hand-drawn fictional map in the style of a fantasy novel endpaper, parchment background, ornamental compass rose and border. Subject:',
  },
  {
    label: 'In-book illustration',
    slug: 'illustration',
    quality: 'medium',
    defaultAspect: '1:1',
    promptScaffold: 'A clean illustration suitable for embedding in a book chapter. Subject:',
  },
  {
    label: 'Diagram (non-fiction)',
    slug: 'diagram',
    quality: 'medium',
    defaultAspect: '4:3',
    promptScaffold: 'A clean explanatory diagram for a non-fiction book, simple line work, labelled where useful. Subject:',
  },
]

const CREDITS_BY_QUALITY: Record<'low' | 'medium' | 'high', number> = { low: 5, medium: 15, high: 40 }

export function App(): JSX.Element {
  const [s, dispatch] = useReducer(reduce, INITIAL)
  const [prompt, setPrompt] = useState('')
  const [typeIndex, setTypeIndex] = useState(0)
  const [aspect, setAspect] = useState<AspectRatio>(TYPES[0].defaultAspect)
  const [qualityOverride, setQualityOverride] = useState<'low' | 'medium' | 'high' | null>(null)
  const [showForm, setShowForm] = useState(true)
  const [lockToRefs, setLockToRefs] = useState(true)
  const [bibleOpen, setBibleOpen] = useState(false)

  const ilType = TYPES[typeIndex]
  const spec = ASPECTS[aspect]
  const quality = qualityOverride ?? ilType.quality
  const cost = CREDITS_BY_QUALITY[quality]

  // Snap aspect/quality to the type's defaults when type changes.
  useEffect(() => {
    setAspect(TYPES[typeIndex].defaultAspect)
    setQualityOverride(null)
  }, [typeIndex])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>
      switch (msg.type) {
        case 'init':            dispatch({ type: 'init', illustrations: msg.illustrations as Illustration[], creditCost: msg.creditCost as number, styleBible: (msg.styleBible as StyleBible) ?? EMPTY_BIBLE, refs: (msg.refs as RefItem[]) ?? [] }); break
        case 'refsUpdated':     dispatch({ type: 'refsUpdated', illustrations: msg.illustrations as Illustration[], refs: (msg.refs as RefItem[]) ?? [] }); break
        case 'styleBibleSaved': dispatch({ type: 'styleBibleSaved', styleBible: msg.styleBible as StyleBible }); break
        case 'generated':       dispatch({ type: 'generated', illustration: msg.illustration as Illustration }); break
        case 'progress':        dispatch({ type: 'progress', phase: msg.phase as string }); break
        case 'error':           dispatch({ type: 'error', message: msg.message as string }); break
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const submit = () => {
    const text = prompt.trim()
    if (!text || s.generating) return
    // Prepend an explicit aspect-ratio directive so the model can't default
    // to square. Sharp will also crop on save as a hard guarantee.
    const aspectDirective = `Aspect ratio: ${aspect} — orient and frame the composition for ${ASPECT_LABELS[aspect].split('·')[1]?.trim() ?? aspect}. Do NOT generate a square image.`
    const fullPrompt = `${aspectDirective}\n\n${ilType.promptScaffold} ${text}`
    vscode.postMessage({
      type: 'generate',
      prompt: fullPrompt,
      slug: ilType.slug,
      width: spec.width,
      height: spec.height,
      generationSize: spec.generationSize,
      aspectRatio: aspect,
      quality,
      lockToRefs,
      illustrationType: ilType.label,
    })
  }

  const setRef = (il: Illustration, kind: 'character' | 'style' | 'scene') =>
    vscode.postMessage({ type: 'setRef', absolutePath: il.absolutePath, filename: il.filename, kind })
  const unsetRef = (il: Illustration) =>
    vscode.postMessage({ type: 'unsetRef', absolutePath: il.absolutePath })

  const insertIntoChapter = (il: Illustration) => {
    vscode.postMessage({ type: 'insertIntoChapter', absolutePath: il.absolutePath, filename: il.filename })
  }

  return (
    <div className="illustrations-panel">
      <div className="il-header">
        <h1>Illustrations</h1>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          <Plus size={14} strokeWidth={2.25} /> {showForm ? 'Hide' : 'New'}
        </button>
      </div>

      <StyleBibleEditor
        bible={s.styleBible}
        open={bibleOpen}
        onToggle={() => setBibleOpen(v => !v)}
        onSave={(next) => vscode.postMessage({ type: 'saveStyleBible', styleBible: next })}
      />

      {showForm && (
        <div className="generate-form">
          <div className="field">
            <label>Type</label>
            <select
              className="type-select"
              value={typeIndex}
              onChange={e => setTypeIndex(Number(e.target.value))}
              disabled={s.generating}
            >
              {TYPES.map((t, i) => <option key={t.slug} value={i}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Aspect ratio</label>
            <select
              className="type-select"
              value={aspect}
              onChange={e => setAspect(e.target.value as AspectRatio)}
              disabled={s.generating}
            >
              {(Object.keys(ASPECTS) as AspectRatio[]).map(r => (
                <option key={r} value={r}>{ASPECT_LABELS[r]}</option>
              ))}
            </select>
            <div className="field-hint">{spec.width} × {spec.height}px on disk · model gen {spec.generationSize}</div>
          </div>
          <div className="field">
            <label>Quality</label>
            <select
              className="type-select"
              value={quality}
              onChange={e => setQualityOverride(e.target.value as 'low' | 'medium' | 'high')}
              disabled={s.generating}
            >
              <option value="low">Low — 5 credits  (~$0.011)</option>
              <option value="medium">Medium — 15 credits  (~$0.042)</option>
              <option value="high">High — 40 credits  (~$0.17)</option>
            </select>
          </div>
          {(s.refs.length > 0 || s.styleBible.characters.length > 0) && (
            <div className="field">
              <label>Consistency</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={lockToRefs}
                  onChange={e => setLockToRefs(e.target.checked)}
                  disabled={s.generating}
                />
                <span>
                  Lock to {s.refs.length} character/style ref{s.refs.length === 1 ? '' : 's'}
                  {s.styleBible.characters.length > 0 ? ' + style bible' : ''}
                </span>
              </label>
              <div className="field-hint">
                Uses /v1/images/edits with input_fidelity=high so the AI keeps characters and palette consistent across illustrations.
              </div>
            </div>
          )}

          <div className="field">
            <label>Describe the {ilType.label.toLowerCase()}</label>
            <textarea
              className="prompt-textarea"
              rows={4}
              value={prompt}
              placeholder={typeIndex === 0
                ? 'A storm-lashed harbour at dusk, ships at anchor, lanterns glowing in the rain.'
                : typeIndex === 1
                ? 'Eleanor Vance, late 30s, sharp dark eyes, weathered Edwardian travelling coat.'
                : 'What you want it to look like…'}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
              disabled={s.generating}
            />
          </div>
          <div className="field-hint">{cost} credits · ⌘↵ to generate</div>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={!prompt.trim() || s.generating}
          >
            {s.generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      )}

      {s.generating && (
        <div className="progress-row">
          <div className="spinner-small" />
          <span>{s.phase}</span>
        </div>
      )}

      {s.error && <div className="error-box">{s.error}</div>}

      {s.lastGenerated && !s.generating && (
        <div className="just-generated">
          <div className="just-generated-label">Just generated</div>
          <img src={s.lastGenerated.uri} alt={s.lastGenerated.filename} className="just-generated-img" />
          <div className="just-generated-actions">
            <button className="btn-primary" onClick={() => insertIntoChapter(s.lastGenerated!)}>
              <FileImage size={14} strokeWidth={2.25} /> Insert in chapter
            </button>
            <button className="btn-ghost" onClick={submit} disabled={!prompt.trim()}>
              <RotateCcw size={14} strokeWidth={2.25} /> Regenerate
            </button>
            <button className="btn-ghost" onClick={() => dispatch({ type: 'clearJustGenerated' })}>
              Keep
            </button>
          </div>
        </div>
      )}

      {s.illustrations.length === 0 && !s.generating && (
        <div className="empty-state">
          <p>No illustrations yet.</p>
          <p>Pick a type, describe what you want, and Storyline will generate it.</p>
          <p>Saved to <code>assets/illustrations/</code>.</p>
        </div>
      )}

      {s.illustrations.length > 0 && (
        <>
          <h3 className="grid-heading">All illustrations</h3>
          <div className="il-grid">
            {s.illustrations.map(il => (
              <div key={il.absolutePath} className={`il-card${il.isRef ? ' is-ref' : ''}`}>
                <img src={il.uri} alt={il.filename} className="il-img" />
                {il.isRef && (
                  <div className="il-ref-badge">★ {il.refKind} ref</div>
                )}
                <div className="il-filename">{il.filename}</div>
                <div className="il-actions">
                  <button className="btn-micro" onClick={() => insertIntoChapter(il)} title="Insert into current chapter">
                    <FileImage size={12} strokeWidth={2.25} /> Insert
                  </button>
                  {il.isRef ? (
                    <button className="btn-micro" onClick={() => unsetRef(il)} title="Stop using as a reference">
                      ★ Unref
                    </button>
                  ) : (
                    <>
                      <button className="btn-micro" onClick={() => setRef(il, 'character')} title="Use as a character reference (locks character features across future illustrations)">
                        ★ Char ref
                      </button>
                      <button className="btn-micro" onClick={() => setRef(il, 'style')} title="Use as a style reference (locks art style / palette across future illustrations)">
                        ✦ Style ref
                      </button>
                    </>
                  )}
                  <button className="btn-micro" onClick={() => vscode.postMessage({ type: 'openFile', absolutePath: il.absolutePath })} title="Open in default app">
                    <ExternalLink size={12} strokeWidth={2.25} /> Open
                  </button>
                  <button
                    className="btn-micro btn-danger"
                    title="Delete"
                    onClick={() => {
                      vscode.postMessage({ type: 'deleteFile', absolutePath: il.absolutePath })
                      dispatch({ type: 'delete', absolutePath: il.absolutePath })
                    }}
                  >
                    <Trash2 size={12} strokeWidth={2.25} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function characterIdFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'character'
}

function StyleBibleEditor({
  bible, open, onToggle, onSave,
}: { bible: StyleBible; open: boolean; onToggle: () => void; onSave: (next: StyleBible) => void }): JSX.Element {
  const [draft, setDraft] = useState<StyleBible>(bible)
  // Re-sync draft when host pushes a saved bible
  useEffect(() => { setDraft(bible) }, [bible])

  const dirty = JSON.stringify(draft) !== JSON.stringify(bible)
  const summary = (() => {
    const bits: string[] = []
    if (bible.characters.length) bits.push(`${bible.characters.length} char${bible.characters.length === 1 ? '' : 's'}`)
    if (bible.artStyle) bits.push('art style')
    if (bible.palette) bits.push('palette')
    if (bible.tone) bits.push('tone')
    return bits.length ? bits.join(' · ') : 'empty'
  })()

  const updateChar = (i: number, patch: Partial<Character>) => {
    setDraft(d => ({ ...d, characters: d.characters.map((c, idx) => idx === i ? { ...c, ...patch, id: patch.name ? characterIdFor(patch.name) : c.id } : c) }))
  }
  const removeChar = (i: number) => setDraft(d => ({ ...d, characters: d.characters.filter((_, idx) => idx !== i) }))
  const addChar = () => setDraft(d => ({
    ...d,
    characters: [...d.characters, { id: 'character', name: '', description: '', isProtagonist: d.characters.length === 0 }],
  }))

  return (
    <div className="style-bible">
      <button className="style-bible-summary" onClick={onToggle}>
        <span style={{ fontWeight: 600 }}>{open ? '▾' : '▸'} Style Bible</span>
        <span style={{ opacity: 0.65, fontSize: 11, marginLeft: 8 }}>{summary}</span>
      </button>
      {open && (
        <div className="style-bible-body">
          <div className="field">
            <label>Characters</label>
            {draft.characters.length === 0 && (
              <div className="field-hint">No recurring characters yet — add the protagonist first.</div>
            )}
            {draft.characters.map((c, i) => (
              <div key={i} className="bible-char-row">
                <input
                  type="text"
                  value={c.name}
                  placeholder="Name"
                  onChange={e => updateChar(i, { name: e.target.value })}
                />
                <textarea
                  rows={2}
                  value={c.description}
                  placeholder="Appearance, age, hair, eyes, build, signature outfit, distinguishing features…"
                  onChange={e => updateChar(i, { description: e.target.value })}
                />
                <div className="bible-char-row-foot">
                  <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="checkbox" checked={c.isProtagonist} onChange={e => updateChar(i, { isProtagonist: e.target.checked })} />
                    Protagonist
                  </label>
                  <button className="btn-micro btn-danger" onClick={() => removeChar(i)}>Remove</button>
                </div>
              </div>
            ))}
            <button className="btn-ghost" onClick={addChar} style={{ marginTop: 6 }}>+ Add character</button>
          </div>

          <div className="field">
            <label>Art style</label>
            <textarea
              rows={2}
              value={draft.artStyle}
              placeholder="e.g. Soft watercolour, gentle line work, painterly textures, no harsh outlines, dreamlike."
              onChange={e => setDraft(d => ({ ...d, artStyle: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Palette</label>
            <input
              type="text"
              value={draft.palette}
              placeholder="e.g. Warm earthy — terracotta, sage, ochre, dusk indigo"
              onChange={e => setDraft(d => ({ ...d, palette: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Tone</label>
            <input
              type="text"
              value={draft.tone}
              placeholder="e.g. Dreamy, hopeful, gentle, bedtime-story warmth"
              onChange={e => setDraft(d => ({ ...d, tone: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={!dirty} onClick={() => onSave(draft)}>
              Save Style Bible
            </button>
            <button className="btn-ghost" disabled={!dirty} onClick={() => setDraft(bible)}>
              Revert
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
