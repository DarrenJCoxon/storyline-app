import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles } from 'lucide-react'

interface Props {
  content: string
  streaming: boolean
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null }
}

/**
 * Pull the first balanced top-level JSON object out of the AI's reply
 * (with or without a ```json fence) and return both the parsed object
 * and the markdown text with that block removed. The block is the AI's
 * machine-readable save signal — it shouldn't be visible as raw JSON
 * in the chat UI.
 */
function splitSaveBlock(text: string): { prose: string; payload: Record<string, unknown> | null } {
  // Match a fenced ```json ... ``` block first (preferred form).
  const fence = /```json\s*\n([\s\S]*?)\n```/m.exec(text)
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1]) as Record<string, unknown>
      return { prose: text.replace(fence[0], '').trim(), payload: parsed }
    } catch { /* malformed JSON — fall through */ }
  }
  // Fallback: a top-level { ... } block. Find the first { and walk to its match.
  const start = text.indexOf('{')
  if (start === -1) return { prose: text, payload: null }
  let depth = 0
  let end = -1
  let inStr = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) return { prose: text, payload: null }
  const candidate = text.slice(start, end + 1)
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>
    return { prose: (text.slice(0, start) + text.slice(end + 1)).trim(), payload: parsed }
  } catch {
    return { prose: text, payload: null }
  }
}

function renderField(key: string, value: unknown): JSX.Element | null {
  if (value === null || value === undefined || value === '') return null
  const label = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return (
      <div key={key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px', marginBottom: 4 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 2 }}>{label}</span>
        <span>{value.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ')}</span>
      </div>
    )
  }
  if (typeof value === 'object') {
    return (
      <div key={key} style={{ marginBottom: 6 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
        <div style={{ paddingLeft: 10, borderLeft: '2px solid var(--accent-sub)' }}>
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => renderField(k, v))}
        </div>
      </div>
    )
  }
  return (
    <div key={key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px', marginBottom: 4 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 2 }}>{label}</span>
      <span>{String(value)}</span>
    </div>
  )
}

function SaveCard({ payload }: { payload: Record<string, unknown> }): JSX.Element {
  // Top-level keys are usually a single stage object — flatten one level so the
  // card shows the meaningful fields, not "Genre: { ... }".
  const keys = Object.keys(payload)
  const flat = keys.length === 1 && typeof payload[keys[0]] === 'object' && payload[keys[0]] !== null && !Array.isArray(payload[keys[0]])
    ? { stage: keys[0], data: payload[keys[0]] as Record<string, unknown> }
    : { stage: null, data: payload }

  return (
    <div style={{
      background: 'var(--accent-sub)',
      border: '1px solid rgba(201,168,76,0.3)',
      borderRadius: 8,
      padding: '12px 14px',
      margin: '8px 0',
      fontSize: '13px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(201,168,76,0.25)',
      }}>
        <span style={{ fontSize: 14 }}>✓</span>
        <span style={{
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: 'var(--text)',
        }}>
          {flat.stage
            ? `Saved — ${flat.stage.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())}`
            : 'Stage saved'}
        </span>
      </div>
      <div>
        {Object.entries(flat.data).map(([k, v]) => renderField(k, v))}
      </div>
    </div>
  )
}

// ── Thinking indicator ────────────────────────────────────────────────────
// Shown during the dead time between streamStart and the first chunk —
// when the model is reasoning. Cycles through evocative words and pulses
// a soft accent-coloured spark icon. Replaces the blinking cursor (which
// looks broken when the wait is several seconds).

const THINKING_WORDS = [
  'Thinking',
  'Considering',
  'Reflecting',
  'Working it through',
  'Drafting',
] as const

function ThinkingIndicator() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % THINKING_WORDS.length), 1800)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      color: 'var(--text-muted)',
      fontSize: 'var(--font-size-body)',
      lineHeight: 'var(--line-height)',
      paddingTop: 2,
    }}>
      <motion.span
        animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.12, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ display: 'inline-flex', color: 'var(--accent)' }}
      >
        <Sparkles size={14} strokeWidth={2.2} />
      </motion.span>
      <motion.span
        key={idx}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.25 }}
      >
        {THINKING_WORDS[idx]}…
      </motion.span>
    </div>
  )
}

export function AIMessage({ content, streaming, usage }: Props) {
  // Don't try to extract until streaming is done — partial JSON would parse-fail
  // and flicker between text and card.
  const { prose, payload } = streaming ? { prose: content, payload: null } : splitSaveBlock(content)
  const isThinking = streaming && content.length === 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      style={{
        marginBottom: '10px',
        marginTop: '4px',
        paddingRight: '14px',
      }}
    >
      {isThinking && <ThinkingIndicator />}
      <div
        className="ai-markdown"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--font-size-body)',
          lineHeight: 'var(--line-height)',
          color: 'var(--text)',
          wordBreak: 'break-word',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p:    ({ node, ...props }) => <p style={{ margin: '0 0 0.6em' }} {...props} />,
            ul:   ({ node, ...props }) => <ul style={{ margin: '0 0 0.6em', paddingLeft: '1.2em' }} {...props} />,
            ol:   ({ node, ...props }) => <ol style={{ margin: '0 0 0.6em', paddingLeft: '1.2em' }} {...props} />,
            li:   ({ node, ...props }) => <li style={{ margin: '0 0 0.2em' }} {...props} />,
            h1:   ({ node, ...props }) => <h3 style={{ margin: '0.5em 0 0.4em', fontSize: '1.05em' }} {...props} />,
            h2:   ({ node, ...props }) => <h3 style={{ margin: '0.5em 0 0.4em', fontSize: '1.05em' }} {...props} />,
            h3:   ({ node, ...props }) => <h3 style={{ margin: '0.5em 0 0.4em', fontSize: '1.0em'  }} {...props} />,
            code: ({ node, ...props }) => <code style={{ fontFamily: 'var(--font-mono, monospace)', background: 'var(--accent-sub)', padding: '0 4px', borderRadius: '3px', fontSize: '0.9em' }} {...props} />,
            pre:  ({ node, ...props }) => <pre style={{ background: 'var(--chat-rail-bg)', padding: '8px 10px', borderRadius: '6px', overflowX: 'auto', fontSize: '0.85em', margin: '0 0 0.6em' }} {...props} />,
            strong: ({ node, ...props }) => <strong style={{ color: 'var(--text)' }} {...props} />,
            em:     ({ node, ...props }) => <em {...props} />,
            blockquote: ({ node, ...props }) => <blockquote style={{ borderLeft: '2px solid var(--accent-sub)', paddingLeft: '10px', margin: '0 0 0.6em', color: 'var(--text-muted)' }} {...props} />,
            // GFM tables — bordered, zebra-striped, scroll horizontally on overflow
            table: ({ node, ...props }) => (
              <div style={{ overflowX: 'auto', margin: '0 0 0.8em' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.92em', width: '100%', border: '1px solid var(--sep)' }} {...props} />
              </div>
            ),
            thead: ({ node, ...props }) => <thead style={{ background: 'var(--accent-sub)' }} {...props} />,
            tbody: ({ node, ...props }) => <tbody {...props} />,
            tr:    ({ node, ...props }) => <tr style={{ borderBottom: '1px solid var(--sep)' }} {...props} />,
            th:    ({ node, ...props }) => <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, borderRight: '1px solid var(--sep)' }} {...props} />,
            td:    ({ node, ...props }) => <td style={{ padding: '6px 10px', verticalAlign: 'top', borderRight: '1px solid var(--sep)' }} {...props} />,
            // Strikethrough (GFM ~~text~~)
            del:   ({ node, ...props }) => <del style={{ color: 'var(--text-muted)' }} {...props} />,
          }}
        >
          {prose}
        </ReactMarkdown>
        {payload && <SaveCard payload={payload} />}
      </div>
      {streaming && !isThinking && <span className="streaming-cursor" />}
    </motion.div>
  )
}
