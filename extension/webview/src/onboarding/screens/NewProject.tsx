import React, { useState } from 'react'
import { Check } from 'lucide-react'
import { primaryBtn, inputStyle, labelStyle, headingStyle } from '../shared.js'

const GENRE_HINTS = [
  '', 'Thriller', 'Literary Fiction', 'Romance', 'Fantasy', 'Science Fiction',
  'Mystery', 'Historical Fiction', 'Horror', 'Young Adult', 'Other',
]

interface Props {
  workspaceName: string
  scaffolded: boolean
  onScaffold: (name: string, genreHint?: string) => void
}

export function NewProject({ workspaceName, scaffolded, onScaffold }: Props) {
  const [name, setName] = useState(workspaceName)
  const [genre, setGenre] = useState('')
  const [pending, setPending] = useState(false)

  const handleCreate = () => {
    if (!name.trim() || pending) return
    setPending(true)
    onScaffold(name.trim(), genre || undefined)
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

  return (
    <div style={{ maxWidth: '400px', width: '100%' }}>
      <h2 style={headingStyle}>Create your project</h2>

      <label style={labelStyle}>Project name</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        style={{ ...inputStyle, marginBottom: '12px' }}
        onKeyDown={e => e.key === 'Enter' && handleCreate()}
      />

      <label style={labelStyle}>What kind of book? (optional)</label>
      <select
        value={genre}
        onChange={e => setGenre(e.target.value)}
        style={{ ...inputStyle, marginBottom: '24px' }}
      >
        {GENRE_HINTS.map(g => <option key={g} value={g}>{g || 'Not sure yet'}</option>)}
      </select>

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
