import React, { useRef, useState, useCallback, useEffect } from 'react'
import { ArrowUp as ArrowUpIcon } from 'lucide-react'
import { useDictation } from '../hooks/useDictation.js'
import { MicIndicator } from './MicIndicator.js'

interface Props {
  onSend: (text: string) => void
  onSave: () => void
  disabled?: boolean
}

const MIN_TEXTAREA_HEIGHT = 56
const MAX_TEXTAREA_HEIGHT = 160

export function InputBox({ onSend, onSave, disabled }: Props) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  // Keep a ref so useDictation's getValue closure stays up-to-date
  const valueRef = useRef(value)
  valueRef.current = value

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || disabled) return
    setValue('')
    if (ref.current) {
      ref.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`
    }
    if (text.toLowerCase() === 'save') {
      onSave()
    } else {
      onSend(text)
    }
  }, [value, disabled, onSend, onSave])

  const handleInsert = useCallback((newValue: string, cursorAfter: number) => {
    setValue(newValue)
    // Recalculate height after insertion
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${Math.min(Math.max(ref.current.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT)}px`
    }
    // Restore cursor after React re-renders the controlled textarea
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.setSelectionRange(cursorAfter, cursorAfter)
        ref.current.focus()
      }
    })
  }, [])

  const { dictState, dictError, micDevice, handleKeyDown: dictKeyDown, handleKeyUp, cancelRecording, startRecording, selectMic } = useDictation({
    textareaRef: ref,
    getValue: () => valueRef.current,
    onInsert: handleInsert,
  })

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    dictKeyDown(e)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.defaultPrevented) {
      e.preventDefault()
      submit()
    }
  }, [submit, dictKeyDown])

  const onInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT)}px`
  }, [])

  const isRecording = dictState === 'recording'
  const isTranscribing = dictState === 'transcribing'
  const hasText = value.trim().length > 0
  const buttonEnabled = hasText && !disabled

  const borderGlow = isRecording
    ? '0 0 0 1px var(--accent)'
    : focused
    ? '0 0 0 1px var(--accent)'
    : 'none'

  const isActive = isRecording || isTranscribing
  const micLabel = micDevice ?? 'Choose mic'

  const statusText = dictError
    ? dictError
    : isRecording
    ? '● Recording — release ⌥ or click mic to stop · Esc to cancel'
    : isTranscribing
    ? 'Transcribing…'
    : '⌘↵ to send · click mic or ⌥ to dictate'

  return (
    <div style={{
      background: 'var(--chat-foot-bg)',
      borderTop: '1px solid var(--sep)',
      padding: '10px 28px 12px',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
        background: 'var(--chat-bg)',
        borderRadius: '10px',
        padding: '10px 12px',
        border: `1px solid var(--accent)`,
        transition: 'border-color 150ms, box-shadow 150ms',
        boxShadow: borderGlow,
      }}>
        <textarea
          ref={ref}
          value={value}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onKeyUp={handleKeyUp}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          placeholder="Reply to Storyline…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--font-size-body)',
            lineHeight: 'var(--line-height)',
            color: 'var(--text)',
            overflowY: 'auto',
            height: `${MIN_TEXTAREA_HEIGHT}px`,
            maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
            padding: 0,
          }}
        />
        <MicIndicator state={dictState} onCancel={cancelRecording} onStart={startRecording} />
        <button
          onClick={submit}
          disabled={!buttonEnabled}
          title="Send (⌘↵)"
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '6px',
            width: '28px',
            height: '28px',
            cursor: buttonEnabled ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            opacity: buttonEnabled ? 1 : 0.5,
            color: '#1A1A1A',
            transition: 'opacity 150ms',
          }}
        >
          <ArrowUpIcon size={16} strokeWidth={2.5} />
        </button>
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: '5px 4px 0',
      }}>
        <p style={{
          margin: 0,
          fontSize: '10px',
          color: dictError ? 'var(--error, #e05a5a)' : isRecording ? 'var(--accent)' : 'var(--text-muted)',
          userSelect: 'none',
          transition: 'color 150ms',
        }}>
          {statusText}
        </p>
        {!isActive && !dictError && (
          <button
            onClick={selectMic}
            title="Choose microphone"
            style={{
              background: 'none',
              border: 'none',
              padding: '0 2px',
              margin: 0,
              fontSize: '10px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
              opacity: 0.7,
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              whiteSpace: 'nowrap',
            }}
          >
            {micLabel} ▾
          </button>
        )}
      </div>
    </div>
  )
}
