import React from 'react'
import { motion } from 'framer-motion'

interface Props {
  text: string
}

export function UserBubble({ text }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '10px',
        marginTop: '4px',
      }}
    >
      <div style={{
        background: 'var(--bubble)',
        color: 'var(--text)',
        border: '1px solid var(--sep)',
        borderRadius: 'var(--radius-bubble)',
        padding: '9px 13px',
        maxWidth: '100%',
        fontSize: 'var(--font-size-body)',
        lineHeight: 'var(--line-height)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {text}
      </div>
    </motion.div>
  )
}
