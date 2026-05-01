import React, { useState } from 'react'
import { Check } from 'lucide-react'
import { primaryBtn, inputStyle, labelStyle, headingStyle } from '../shared.js'

interface ReturningUser {
  creditBalance?: number
  licenceType?: string
  providerName?: string
}

interface Props {
  workspaceName: string
  scaffolded: boolean
  returningUser?: ReturningUser | null
  onScaffold: (name: string) => void
}

export function NewProject({ workspaceName, scaffolded, returningUser, onScaffold }: Props) {
  const [name, setName] = useState(workspaceName)
  const [pending, setPending] = useState(false)

  const handleCreate = () => {
    if (!name.trim() || pending) return
    setPending(true)
    onScaffold(name.trim())
  }

  if (scaffolded) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px', color: 'var(--accent)' }}>
          <Check size={32} strokeWidth={2.5} />
        </div>
        <p style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '14px', margin: 0 }}>Project created</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>Opening planning chat…</p>
      </div>
    )
  }

  // Friendly returning-user banner so a writer with credits / BYOK / Ollama
  // already configured doesn't get pushed through the plan-picker again.
  const banner = (() => {
    if (!returningUser) return null
    if (returningUser.providerName) {
      return `Welcome back. Using your ${returningUser.providerName} key from a previous project — no plan picker needed.`
    }
    if (typeof returningUser.creditBalance === 'number') {
      const credits = returningUser.creditBalance.toLocaleString()
      const tier = returningUser.licenceType === 'free' ? 'free' : 'paid'
      return `Welcome back. Picking up your existing ${tier} plan — ${credits} credits available.`
    }
    return 'Welcome back — using your existing plan.'
  })()

  return (
    <div style={{ maxWidth: '400px', width: '100%' }}>
      <h2 style={headingStyle}>{returningUser ? 'Start a new project' : 'Create your project'}</h2>

      {banner && (
        <div style={{
          background: 'var(--accent-sub, rgba(201,168,76,0.08))',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 6,
          padding: '10px 12px',
          fontSize: 12,
          color: 'var(--text)',
          marginBottom: 18,
        }}>
          {banner}
        </div>
      )}

      <label style={labelStyle}>Project name</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        style={{ ...inputStyle, marginBottom: '24px' }}
        onKeyDown={e => e.key === 'Enter' && handleCreate()}
      />

      <button
        onClick={handleCreate}
        disabled={!name.trim() || pending}
        style={{ ...primaryBtn, opacity: !name.trim() || pending ? 0.5 : 1 }}
      >
        {pending ? 'Creating…' : 'Create project'}
      </button>
    </div>
  )
}
