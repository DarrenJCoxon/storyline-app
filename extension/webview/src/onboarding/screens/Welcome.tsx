import React, { useState } from 'react'
import { primaryBtn, secondaryBtn, inputStyle } from '../shared.js'

type Screen = 'buy-credits' | 'byok' | 'new-project'

interface Props {
  onNavigate: (to: Screen) => void
  onUseFree: () => void
  onActivateKey: (key: string) => void
  validating: boolean
  validateError: string | null
}

export function Welcome({ onNavigate, onUseFree, onActivateKey, validating, validateError }: Props) {
  const [explainerOpen, setExplainerOpen] = useState(false)
  const [keyOpen, setKeyOpen] = useState(false)
  const [key, setKey] = useState('')

  return (
    <div style={{ maxWidth: '400px', width: '100%' }}>
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '32px', letterSpacing: '-0.02em' }}>
          <span style={{ color: 'var(--text)' }}>story</span>
          <span style={{ color: 'var(--accent)' }}>line</span>
        </span>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 32px' }}>
        Plan your book. Write your story.
      </p>

      <button onClick={() => onNavigate('buy-credits')} style={primaryBtn}>
        Buy credits
      </button>
      <button onClick={() => onNavigate('byok')} style={secondaryBtn}>
        Bring your own key
      </button>

      <div style={{ marginTop: '14px', textAlign: 'center' }}>
        <button
          onClick={() => setKeyOpen(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: '12px', padding: 0, textDecoration: 'underline' }}
        >
          I already have a Storyline licence key
        </button>
      </div>

      {keyOpen && (
        <div style={{ marginTop: '10px' }}>
          <input
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="SL-XXXX-XXXX-XXXX-XXXX"
            style={{ ...inputStyle, marginBottom: 8 }}
            onKeyDown={e => { if (e.key === 'Enter' && key.trim()) onActivateKey(key.trim()) }}
          />
          <button
            onClick={() => key.trim() && onActivateKey(key.trim())}
            disabled={!key.trim() || validating}
            style={{ ...secondaryBtn, opacity: !key.trim() || validating ? 0.5 : 1 }}
          >
            {validating ? 'Activating…' : 'Activate'}
          </button>
          {validateError && (
            <p style={{ color: 'var(--vscode-errorForeground, #d13438)', fontSize: 11, marginTop: 6 }}>{validateError}</p>
          )}
        </div>
      )}

      <div style={{ marginTop: '12px' }}>
        <button
          onClick={() => setExplainerOpen(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: 0, textDecoration: 'underline' }}
        >
          {explainerOpen ? 'Hide' : 'What is this?'}
        </button>
        {explainerOpen && (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
            Storyline walks you through Save the Cat story structure — 14 planning stages
            from genre through to scene outline — with an AI planning partner at every step.
            Your plan lives locally in your workspace. The AI is never given your prose.
          </p>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <button
          onClick={onUseFree}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: 0, textDecoration: 'underline' }}
        >
          Start with the free plan
        </button>
      </div>
    </div>
  )
}
