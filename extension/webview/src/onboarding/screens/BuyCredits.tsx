import React, { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { primaryBtn, inputStyle, headingStyle, BackButton } from '../shared.js'

const PACKS = [
  { id: '10' as const, price: '£9.99', credits: '1,000 credits', description: '~120 complete book journeys' },
  { id: '20' as const, price: '£17.99', credits: '2,200 credits', description: '~264 complete book journeys' },
]

interface ValidateResult {
  success: boolean
  creditBalance?: number
  error?: string
}

interface Props {
  onBack: () => void
  onNavigate: (to: 'new-project') => void
  validateResult: ValidateResult | null
  onOpenStripe: (pack: '10' | '20') => void
  onValidate: (key: string) => void
}

export function BuyCredits({ onBack, onNavigate, validateResult, onOpenStripe, onValidate }: Props) {
  const [selectedPack, setSelectedPack] = useState<'10' | '20' | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [pending, setPending] = useState(false)

  const handleValidate = () => {
    if (!keyInput.trim() || pending) return
    setPending(true)
    onValidate(keyInput.trim())
  }

  useEffect(() => {
    if (!validateResult) return
    setPending(false)
    if (validateResult.success) {
      setTimeout(() => onNavigate('new-project'), 800)
    }
  }, [validateResult, onNavigate])

  return (
    <div style={{ maxWidth: '400px', width: '100%' }}>
      <BackButton onClick={onBack} />
      <h2 style={headingStyle}>Choose a credit pack</h2>

      {PACKS.map(pack => (
        <button
          key={pack.id}
          onClick={() => setSelectedPack(pack.id)}
          style={{
            width: '100%',
            textAlign: 'left',
            background: selectedPack === pack.id ? 'var(--accent-sub)' : 'var(--chat-rail-bg)',
            border: selectedPack === pack.id ? '1px solid var(--accent)' : '1px solid var(--sep)',
            borderRadius: 'var(--radius-card)',
            padding: '12px 14px',
            cursor: 'pointer',
            marginBottom: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>
              {pack.price} — {pack.credits}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {pack.description}
            </div>
          </div>
          {selectedPack === pack.id && <Check size={14} strokeWidth={2.5} color="var(--accent)" />}
        </button>
      ))}

      {selectedPack && (
        <button
          onClick={() => onOpenStripe(selectedPack)}
          style={{ ...primaryBtn, marginBottom: '20px' }}
        >
          Buy now — opens checkout in browser
        </button>
      )}

      <div style={{ borderTop: '1px solid var(--sep)', paddingTop: '16px' }}>
        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
          Already purchased? Enter your licence key:
        </label>
        <input
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          placeholder="SL-XXXX-XXXX-XXXX-XXXX"
          style={inputStyle}
          onKeyDown={e => e.key === 'Enter' && handleValidate()}
        />
        {validateResult?.error && (
          <p style={{ fontSize: '11px', color: '#EF4444', margin: '4px 0 0' }}>
            {validateResult.error}
          </p>
        )}
        {validateResult?.success && (
          <p style={{ fontSize: '11px', color: '#22C55E', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Check size={12} strokeWidth={2.5} />
            <span>Activated — {validateResult.creditBalance?.toLocaleString()} credits</span>
          </p>
        )}
        <button
          onClick={handleValidate}
          disabled={!keyInput.trim() || pending}
          style={{ ...primaryBtn, marginTop: '8px', opacity: !keyInput.trim() || pending ? 0.5 : 1 }}
        >
          {pending ? 'Checking…' : 'Activate key'}
        </button>
      </div>
    </div>
  )
}
