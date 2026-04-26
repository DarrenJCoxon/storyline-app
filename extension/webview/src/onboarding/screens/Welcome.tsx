import React, { useState } from 'react'
import { primaryBtn, secondaryBtn } from '../shared.js'

type Screen = 'buy-credits' | 'byok' | 'new-project'

interface Props {
  onNavigate: (to: Screen) => void
  onUseFree: () => void
}

export function Welcome({ onNavigate, onUseFree }: Props) {
  const [explainerOpen, setExplainerOpen] = useState(false)

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
