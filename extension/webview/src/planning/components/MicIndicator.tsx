import React from 'react'
import { Mic } from 'lucide-react'
import type { DictationState } from '../hooks/useDictation.js'

interface Props {
  state: DictationState
  onCancel: () => void
}

export function MicIndicator({ state, onCancel }: Props) {
  const isRecording = state === 'recording'
  const isActive = state !== 'idle'

  return (
    <button
      onClick={isActive ? onCancel : undefined}
      title={
        isRecording
          ? 'Recording — click or Esc to cancel'
          : state === 'transcribing'
          ? 'Transcribing…'
          : 'Hold ⌥ to dictate · ⌥Space to lock'
      }
      style={{
        background: isRecording ? 'var(--accent)' : 'transparent',
        border: 'none',
        borderRadius: '6px',
        width: '28px',
        height: '28px',
        cursor: isActive ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: isRecording ? '#1A1A1A' : 'var(--text-muted)',
        opacity: state === 'transcribing' ? 0.4 : 1,
        animation: isRecording ? 'mic-pulse 1.2s ease-in-out infinite' : 'none',
        transition: 'background 150ms, color 150ms, opacity 150ms',
      }}
    >
      <Mic size={14} strokeWidth={2.5} />
    </button>
  )
}
