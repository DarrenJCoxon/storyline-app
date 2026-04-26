import React from 'react'
import { ChevronDown } from 'lucide-react'
import type { StageInfo } from '../App.js'

interface Props {
  stages: StageInfo[]
  collapsed: boolean
  onToggle: () => void
  activeStage: StageInfo | null
}

function StageIcon({ stage }: { stage: StageInfo }) {
  if (stage.completed) {
    return (
      <span style={{ color: 'var(--accent)', fontSize: '11px', width: '14px', flexShrink: 0 }}>●</span>
    )
  }
  if (stage.active) {
    return (
      <span style={{ color: 'var(--accent)', fontSize: '11px', width: '14px', flexShrink: 0 }}>◉</span>
    )
  }
  return (
    <span style={{ color: 'var(--text-muted)', fontSize: '11px', width: '14px', flexShrink: 0 }}>○</span>
  )
}

export function StageRail({ stages, collapsed, onToggle, activeStage }: Props) {
  return (
    <div style={{
      background: 'var(--chat-rail-bg)',
      borderBottom: '1px solid var(--sep)',
      flexShrink: 0,
    }}>
      {/* Header row — always visible */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 14px',
          color: 'var(--text-muted)',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          PLANNING STAGES
          {collapsed && activeStage && (
            <span style={{ color: 'var(--text)', textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: '11px' }}>
              {activeStage.id.match(/\d+/)?.[0] ?? ''} · {activeStage.name}
            </span>
          )}
        </span>
        <span style={{
          color: 'var(--text)',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 200ms ease',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <ChevronDown size={18} strokeWidth={2.25} />
        </span>
      </button>

      {/* Expandable list */}
      <div style={{
        maxHeight: collapsed ? '0px' : `${stages.length * 28 + 8}px`,
        overflow: 'hidden',
        transition: 'max-height 220ms ease',
      }}>
        <div style={{ paddingBottom: '6px' }}>
          {stages.map((stage, i) => (
            <div
              key={stage.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 14px',
                background: stage.active ? 'var(--accent-sub)' : 'transparent',
                borderLeft: stage.active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'background 150ms',
              }}
            >
              <StageIcon stage={stage} />
              <span style={{
                fontSize: '12px',
                color: stage.active ? 'var(--text)' : stage.completed ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: stage.active ? 500 : 400,
              }}>
                {i + 1}. {stage.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
