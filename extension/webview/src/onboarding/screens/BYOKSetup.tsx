import React, { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { primaryBtn, secondaryBtn, inputStyle, labelStyle, headingStyle, BackButton } from '../shared.js'

type ProviderKind = 'anthropic' | 'openai' | 'ollama'

export interface ByokConfig {
  kind: ProviderKind
  apiKey?: string
  baseUrl?: string
}

const PROVIDERS: Array<{ id: ProviderKind; label: string }> = [
  { id: 'anthropic', label: 'Anthropic (Claude)' },
  { id: 'openai',   label: 'OpenAI-compatible' },
  { id: 'ollama',   label: 'Ollama (local)' },
]

interface TestResult {
  success: boolean
  error?: string
}

interface Props {
  onBack: () => void
  onNavigate: (to: 'new-project') => void
  testResult: TestResult | null
  onTest: (config: ByokConfig) => void
  onSave: (config: ByokConfig) => void
}

export function BYOKSetup({ onBack, onNavigate: _onNavigate, testResult, onTest, onSave }: Props) {
  const [kind, setKind] = useState<ProviderKind>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (testResult) setTesting(false)
  }, [testResult])

  const config: ByokConfig =
    kind === 'ollama'
      ? { kind: 'ollama', baseUrl: ollamaUrl }
      : { kind, apiKey, baseUrl: kind === 'openai' ? baseUrl : undefined }

  const canTest = kind === 'ollama' ? !!ollamaUrl.trim() : !!apiKey.trim()

  return (
    <div style={{ maxWidth: '400px', width: '100%' }}>
      <BackButton onClick={onBack} />
      <h2 style={headingStyle}>Bring your own key</h2>

      <label style={labelStyle}>Provider</label>
      <select
        value={kind}
        onChange={e => { setKind(e.target.value as ProviderKind); setApiKey('') }}
        style={{ ...inputStyle, marginBottom: '12px' }}
      >
        {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      {kind !== 'ollama' && (
        <>
          <label style={labelStyle}>API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={kind === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
            style={{ ...inputStyle, marginBottom: '12px' }}
          />
        </>
      )}

      {kind === 'openai' && (
        <>
          <label style={labelStyle}>Base URL</label>
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            style={{ ...inputStyle, marginBottom: '12px' }}
          />
        </>
      )}

      {kind === 'ollama' && (
        <>
          <label style={labelStyle}>Ollama URL</label>
          <input
            value={ollamaUrl}
            onChange={e => setOllamaUrl(e.target.value)}
            style={{ ...inputStyle, marginBottom: '12px' }}
          />
        </>
      )}

      {testResult?.error && (
        <p style={{ fontSize: '11px', color: '#EF4444', margin: '0 0 8px' }}>{testResult.error}</p>
      )}
      {testResult?.success && (
        <p style={{ fontSize: '11px', color: '#22C55E', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Check size={12} strokeWidth={2.5} />
          <span>Connection successful</span>
        </p>
      )}

      <button
        onClick={() => { setTesting(true); onTest(config) }}
        disabled={!canTest || testing}
        style={{ ...secondaryBtn, opacity: !canTest || testing ? 0.5 : 1 }}
      >
        {testing ? 'Testing…' : 'Test connection'}
      </button>

      {testResult?.success && (
        <button onClick={() => onSave(config)} style={primaryBtn}>
          Save and continue
        </button>
      )}
    </div>
  )
}
