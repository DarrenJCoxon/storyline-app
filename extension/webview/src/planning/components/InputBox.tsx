import React, { useRef, useState, useCallback } from 'react'
import { Send as SendIcon } from 'lucide-react'

interface Props {
  onSend: (text: string) => void
  onSave: () => void
  disabled?: boolean
}

export function InputBox({ onSend, onSave, disabled }: Props) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || disabled) return
    setValue('')
    if (ref.current) {
      ref.current.style.height = 'auto'
    }
    if (text.toLowerCase() === 'save') {
      onSave()
    } else {
      onSend(text)
    }
  }, [value, disabled, onSend, onSave])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
    // Plain Enter inserts newline (no action needed — default textarea behaviour)
  }, [submit])

  const onInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-grow up to 4 lines (~88px)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 88)}px`
  }, [])

  const hasText = value.trim().length > 0

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
        padding: '8px 10px',
        boxShadow: 'none',
        transition: 'box-shadow 150ms',
      }}
        onFocusCapture={e => {
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px rgba(201,168,76,0.15)'
        }}
        onBlurCapture={e => {
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
        }}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={onInput}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Reply to Storyline…"
          rows={1}
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
            maxHeight: '88px',
            padding: 0,
          }}
        />
        {hasText && (
          <button
            onClick={submit}
            disabled={disabled}
            title="Send (⌘↵)"
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: '6px',
              width: '24px',
              height: '24px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              opacity: disabled ? 0.5 : 1,
              fontSize: '12px',
              color: '#1A1A1A',
              fontWeight: 700,
              transition: 'opacity 150ms',
            }}
          >
            <SendIcon size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <p style={{
        margin: '5px 4px 0',
        fontSize: '10px',
        color: 'var(--text-muted)',
        userSelect: 'none',
      }}>
        ⌘↵ to send · Enter for line
      </p>
    </div>
  )
}
