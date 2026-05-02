import React from 'react'
import { Sun, Moon, Monitor, Clock, Plus } from 'lucide-react'
import type { CreditInfo } from '../App.js'
import type { ThemeMode } from '../hooks/useTheme.js'

interface Props {
  creditInfo: CreditInfo
  activeStageIndex: number
  stageCount: number
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
  onShowHistory: () => void
  onNewChat: () => void
  isStreaming: boolean
}

const MODES: Array<{ value: ThemeMode; Icon: typeof Sun; title: string }> = [
  { value: 'light', Icon: Sun,     title: 'Light theme'    },
  { value: 'dark',  Icon: Moon,    title: 'Dark theme'     },
  { value: 'auto',  Icon: Monitor, title: 'Follow system'  },
]

function creditLabel(info: CreditInfo, _activeStageIndex: number, _stageCount: number): string {
  if (info.type === 'byok') return `BYOK — ${info.providerName ?? 'Custom'}`
  // Always surface the credit count — free users used to see only "Free
  // plan — Stage X of Y" and had no visibility into how much of their
  // 250-credit allowance was left. Keeping the "Free plan" prefix makes
  // it clear they're on the trial AND shows the running balance.
  if (info.type === 'free') {
    return `Free plan · ${info.balance.toLocaleString()} credits`
  }
  return `${info.balance.toLocaleString()} credits remaining`
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  transition: 'color 150ms, background 150ms',
  lineHeight: 0,
}

export function Header({ creditInfo, activeStageIndex, stageCount, themeMode, onThemeChange, onShowHistory, onNewChat, isStreaming }: Props) {
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            title="Chat history"
            aria-label="Chat history"
            onClick={onShowHistory}
            style={iconBtnStyle}
          >
            <Clock size={15} strokeWidth={2} />
          </button>
          <button
            title="New chat"
            aria-label="New chat"
            onClick={onNewChat}
            disabled={isStreaming}
            style={{ ...iconBtnStyle, opacity: isStreaming ? 0.4 : 1, cursor: isStreaming ? 'default' : 'pointer' }}
          >
            <Plus size={15} strokeWidth={2} />
          </button>
        </div>

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
