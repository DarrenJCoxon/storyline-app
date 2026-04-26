import React from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import type { CreditInfo } from '../App.js'
import type { ThemeMode } from '../hooks/useTheme.js'

interface Props {
  creditInfo: CreditInfo
  activeStageIndex: number
  stageCount: number
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
}

const MODES: Array<{ value: ThemeMode; Icon: typeof Sun; title: string }> = [
  { value: 'light', Icon: Sun,     title: 'Light theme'    },
  { value: 'dark',  Icon: Moon,    title: 'Dark theme'     },
  { value: 'auto',  Icon: Monitor, title: 'Follow system'  },
]

function creditLabel(info: CreditInfo, activeStageIndex: number, stageCount: number): string {
  if (info.type === 'byok') return `BYOK — ${info.providerName ?? 'Custom'}`
  if (info.type === 'free') {
    const stage = activeStageIndex >= 0 ? activeStageIndex + 1 : 1
    const total = stageCount || 14
    return `Free plan — Stage ${stage} of ${total}`
  }
  return `${info.balance.toLocaleString()} credits remaining`
}

export function Header({ creditInfo, activeStageIndex, stageCount, themeMode, onThemeChange }: Props) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      background: 'var(--chat-bg)',
      borderBottom: '1px solid var(--sep)',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', letterSpacing: '-0.02em' }}>
        <span style={{ color: 'var(--text)' }}>story</span>
        <span style={{ color: 'var(--accent)' }}>line</span>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          background: 'var(--accent-sub)',
          border: '1px solid rgba(201,168,76,0.18)',
          borderRadius: '20px',
          padding: '2px 8px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {creditLabel(creditInfo, activeStageIndex, stageCount)}
        </span>

        <div style={{
          display: 'flex',
          background: 'var(--chat-rail-bg)',
          border: '1px solid var(--sep)',
          borderRadius: '20px',
          overflow: 'hidden',
        }}>
          {MODES.map(({ value, Icon, title }) => (
            <button
              key={value}
              title={title}
              aria-label={title}
              onClick={() => onThemeChange(value)}
              style={{
                background: themeMode === value ? 'var(--accent-sub)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                color: themeMode === value ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'background 150ms, color 150ms',
                lineHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={13} strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
