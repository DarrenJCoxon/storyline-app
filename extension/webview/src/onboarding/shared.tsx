import React from 'react'

export const primaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '11px 16px',
  background: 'var(--accent)',
  color: '#1A1A1A',
  border: 'none',
  borderRadius: 'var(--radius-card)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  marginBottom: '8px',
}

export const secondaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '11px 16px',
  background: 'var(--chat-rail-bg)',
  color: 'var(--text)',
  border: '1px solid var(--sep)',
  borderRadius: 'var(--radius-card)',
  fontSize: '13px',
  cursor: 'pointer',
  marginBottom: '8px',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--chat-rail-bg)',
  border: '1px solid var(--sep)',
  borderRadius: 'var(--radius-card)',
  padding: '8px 10px',
  fontSize: '12px',
  color: 'var(--text)',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginBottom: '4px',
}

export const headingStyle: React.CSSProperties = {
  fontSize: '16px',
  color: 'var(--text)',
  fontWeight: 600,
  marginTop: 0,
  marginBottom: '20px',
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: '11px',
        padding: '0 0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      ← Back
    </button>
  )
}
