import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, AlertCircle, AlertTriangle, Lightbulb, BookOpen, GitBranch, Zap } from 'lucide-react'
import type { StoryTrapFinding } from '../App.js'

// ── Stage complete card ────────────────────────────────────────────────────

interface StageCompleteProps {
  stageName: string
  statePath: string
  memoryMethod?: 'odd-flow' | 'jsonl' | 'skipped'
}

export function StageCompleteCard({ stageName, statePath, memoryMethod }: StageCompleteProps) {
  // Hide implementation detail (odd-flow vs jsonl) from the writer.
  // Both are "memory" — only differentiate when something failed.
  const memoryLabel = memoryMethod === 'odd-flow' || memoryMethod === 'jsonl'
    ? 'written to memory'
    : memoryMethod === 'skipped'
      ? 'memory write failed'
      : null

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
        {memoryLabel && (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {memoryLabel}
          </div>
        )}
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

// ── Story traps findings card ──────────────────────────────────────────────────

interface FindingsCardProps {
  findings: StoryTrapFinding[]
}

export function FindingsCard({ findings }: FindingsCardProps) {
  if (findings.length === 0) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ margin: '8px 0' }}
    >
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <AlertTriangle size={11} strokeWidth={2} />
        Story traps check
      </div>
      {findings.map(f => (
        <CritiqueBadge
          key={f.id}
          severity={f.severity}
          message={f.name + (f.description ? ` — ${f.description}` : '')}
          fixProtocol={f.fixProtocol}
        />
      ))}
    </motion.div>
  )
}

// ── Series detected card ───────────────────────────────────────────────────────

interface SeriesDetectedCardProps {
  suggestion: string
  indicators: string[]
}

export function SeriesDetectedCard({ suggestion, indicators }: SeriesDetectedCardProps) {
  const [expanded, setExpanded] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        margin: '8px 0',
        padding: '10px 12px',
        borderRadius: 'var(--radius-card)',
        background: 'rgba(100,116,139,0.07)',
        border: '1px solid rgba(100,116,139,0.25)',
        cursor: indicators.length > 0 ? 'pointer' : 'default',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      <div style={{ fontSize: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <BookOpen size={13} strokeWidth={2} color="var(--text-muted)" />
        <span>{suggestion}</span>
      </div>
      {expanded && indicators.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: '16px' }}>
          {indicators.map((ind, i) => (
            <li key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>{ind}</li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}

// ── Downstream impacts card ────────────────────────────────────────────────────

interface DownstreamImpactsCardProps {
  stageId: string
  impacts: string[]
}

export function DownstreamImpactsCard({ stageId, impacts }: DownstreamImpactsCardProps) {
  if (impacts.length === 0) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        margin: '8px 0',
        padding: '10px 12px',
        borderRadius: 'var(--radius-card)',
        background: 'rgba(217,119,6,0.06)',
        border: '1px solid rgba(217,119,6,0.2)',
      }}
    >
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <GitBranch size={11} strokeWidth={2} />
        Changing {stageId} may affect
      </div>
      <ul style={{ margin: 0, paddingLeft: '16px' }}>
        {impacts.map((imp, i) => (
          <li key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>{imp}</li>
        ))}
      </ul>
    </motion.div>
  )
}

// ── Critique card ──────────────────────────────────────────────────────────────

interface CritiqueCardProps {
  findings: string
  tier: string
  stageId: string
}

function parseCritiqueLine(line: string): { severity: CritiqueSeverity; text: string } | null {
  if (line.startsWith('🔴') || line.toLowerCase().includes('error:')) {
    return { severity: 'error', text: line.replace(/^🔴\s*(ERROR:\s*)?/i, '').trim() }
  }
  if (line.startsWith('🟡') || line.toLowerCase().includes('warning:')) {
    return { severity: 'warning', text: line.replace(/^🟡\s*(WARNING:\s*)?/i, '').trim() }
  }
  if (line.startsWith('💡') || line.toLowerCase().includes('suggestion:')) {
    return { severity: 'suggestion', text: line.replace(/^💡\s*(SUGGESTION:\s*)?/i, '').trim() }
  }
  return null
}

const TIER_LABELS: Record<string, string> = {
  validate: 'Schema check',
  structural: 'Structural critique',
  synthesis: 'Whole-book synthesis',
  prose: 'Prose-vs-plan critique',
}

export function CritiqueCard({ findings, tier, stageId }: CritiqueCardProps) {
  const lines = findings.split('\n').map(l => l.trim()).filter(Boolean)
  const parsed = lines.map(parseCritiqueLine).filter(Boolean) as Array<{ severity: CritiqueSeverity; text: string }>
  const passing = findings.includes('✅')
  const tierLabel = TIER_LABELS[tier] ?? tier.charAt(0).toUpperCase() + tier.slice(1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ margin: '8px 0' }}
    >
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Zap size={11} strokeWidth={2} />
        {tierLabel} critique — {stageId}
      </div>
      {passing && parsed.length === 0 ? (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-card)',
          background: 'rgba(34,197,94,0.07)',
          border: '1px solid rgba(34,197,94,0.2)',
          fontSize: '12px',
          color: '#4ADE80',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Check size={13} strokeWidth={2.5} />
          {lines.find(l => l.includes('✅'))?.replace('✅', '').trim() ?? 'Structurally sound.'}
        </div>
      ) : (
        parsed.map((item, i) => (
          <CritiqueBadge key={i} severity={item.severity} message={item.text} />
        ))
      )}
    </motion.div>
  )
}
