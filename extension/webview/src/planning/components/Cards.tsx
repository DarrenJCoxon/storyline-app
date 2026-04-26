import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, AlertCircle, AlertTriangle, Lightbulb } from 'lucide-react'

// ── Stage complete card ────────────────────────────────────────────────────

interface StageCompleteProps {
  stageName: string
  statePath: string
}

export function StageCompleteCard({ stageName, statePath }: StageCompleteProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{
        margin: '12px 0',
        padding: '12px 14px',
        borderRadius: 'var(--radius-card)',
        background: 'var(--accent-sub)',
        border: '1px solid rgba(201,168,76,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      }}
    >
      <div>
        <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Check size={14} strokeWidth={2.5} />
          {stageName} saved
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {statePath.replace(/.*\/\.storyline/, '.storyline')}
        </div>
      </div>
    </motion.div>
  )
}

// ── Option card ────────────────────────────────────────────────────────────

interface OptionCardProps {
  label: string
  description?: string
  selected?: boolean
  onSelect: () => void
}

export function OptionCard({ label, description, selected, onSelect }: OptionCardProps) {
  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        background: selected ? 'var(--accent-sub)' : 'var(--chat-rail-bg)',
        border: selected ? '1px solid var(--accent)' : '1px solid var(--sep)',
        borderRadius: 'var(--radius-card)',
        padding: '10px 12px',
        cursor: 'pointer',
        marginBottom: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        transition: 'border-color 150ms, background 150ms',
      }}
    >
      <div>
        <div style={{ fontSize: '12px', color: 'var(--text)', fontWeight: selected ? 600 : 400 }}>{label}</div>
        {description && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{description}</div>
        )}
      </div>
      {selected && <Check size={14} strokeWidth={2.5} color="var(--accent)" />}
    </button>
  )
}

// ── Beat card ──────────────────────────────────────────────────────────────

interface BeatCardProps {
  title: string
  description: string
}

export function BeatCard({ title, description }: BeatCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: 'var(--chat-rail-bg)',
        border: '1px solid var(--sep)',
        borderRadius: 'var(--radius-card)',
        padding: '10px 12px',
        cursor: 'pointer',
        marginBottom: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500 }}>{title}</span>
        <span style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 150ms',
          display: 'inline-block',
        }}>▶</span>
      </div>
      {expanded && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0 }}>
          {description}
        </p>
      )}
    </div>
  )
}

// ── Critique badge ─────────────────────────────────────────────────────────

type CritiqueSeverity = 'error' | 'warning' | 'suggestion'

interface CritiqueBadgeProps {
  severity: CritiqueSeverity
  message: string
  fixProtocol?: string[]
}

const SEVERITY_STYLES: Record<CritiqueSeverity, { bg: string; border: string; color: string; Icon: typeof AlertCircle }> = {
  error:      { bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.3)',   color: '#EF4444', Icon: AlertCircle    },
  warning:    { bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.3)',   color: '#F59E0B', Icon: AlertTriangle  },
  suggestion: { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.3)', color: '#94A3B8', Icon: Lightbulb      },
}

export function CritiqueBadge({ severity, message, fixProtocol }: CritiqueBadgeProps) {
  const [expanded, setExpanded] = useState(false)
  const s = SEVERITY_STYLES[severity]

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 'var(--radius-card)',
        padding: '8px 12px',
        cursor: fixProtocol ? 'pointer' : 'default',
        marginBottom: '6px',
      }}
    >
      <div style={{ fontSize: '12px', color: s.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <s.Icon size={14} strokeWidth={2} />
        <span>{message}</span>
      </div>
      {expanded && fixProtocol && (
        <ol style={{ margin: '8px 0 0', paddingLeft: '16px' }}>
          {fixProtocol.map((step, i) => (
            <li key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {step.replace(/^\d+\.\s*/, '')}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
