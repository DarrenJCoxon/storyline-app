import React from 'react'
import { Mic } from 'lucide-react'
import type { DictationState } from '../hooks/useDictation.js'

interface Props {
  state: DictationState
  onCancel: () => void
  onStart: () => void
}

export function MicIndicator({ state, onCancel, onStart }: Props) {
  const isRecording = state === 'recording'
  const isTranscribing = state === 'transcribing'
  const isIdle = state === 'idle'

  function handleClick() {
    if (isIdle) onStart()
    else if (isRecording) onCancel()
  }

  return (
    <button
      onClick={isTranscribing ? undefined : handleClick}
      title={
        isRecording
          ? 'Recording — click or Esc to cancel'
          : isTranscribing
          ? 'Transcribing…'
          : 'Click or hold ⌥ to dictate · ⌥Space to lock'
      }
      style={{
        background: isRecording ? 'var(--accent)' : 'transparent',
        border: 'none',
        borderRadius: '6px',
        width: '28px',
        height: '28px',
        cursor: isTranscribing ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: isRecording ? '#1A1A1A' : 'var(--text-muted)',
        opacity: isTranscribing ? 0.4 : 1,
        animation: isRecording ? 'mic-pulse 1.2s ease-in-out infinite' : 'none',
        transition: 'background 150ms, color 150ms, opacity 150ms',
      }}
    >
      <Mic size={14} strokeWidth={2.5} />
    </button>
  )
}
