import React, { useEffect, useState, useCallback } from 'react'
import { X, Copy, Check } from 'lucide-react'

export interface ReferralStats {
  code: string
  referralCount: number
  creditsEarned: number
  capRemaining: number
}

interface Props {
  /** Posts a message to the host extension. The extension takes care of
   *  fetching /referral/stats and opening external URLs (writers'
   *  browser, not the webview). */
  send: (msg: { type: string; [k: string]: unknown }) => void
  /** Latest stats pushed from the host. null while loading. */
  stats: ReferralStats | null
  onClose: () => void
}

const SHARE_BASE_URL = 'https://storyline.my'

interface SharePlatform {
  id: string
  label: string
  buildUrl: (refUrl: string) => string
}

/** Pre-filled compose URLs per platform — opened externally via
 *  vscode.env.openExternal so the user lands in their preferred client. */
const PLATFORMS: SharePlatform[] = [
  {
    id: 'x',
    label: 'X / Twitter',
    buildUrl: refUrl => `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `I've been using Storyline to plan my next book — Save the Cat structure, AI gives notes after every stage. Genuinely changed how I think about story. Free trial: ${refUrl}`,
    )}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    buildUrl: refUrl => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(refUrl)}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    buildUrl: refUrl => `https://wa.me/?text=${encodeURIComponent(
      `Quick one — found a really good writing tool. Free trial: ${refUrl}`,
    )}`,
  },
  {
    id: 'email',
    label: 'Email',
    buildUrl: refUrl => `mailto:?subject=${encodeURIComponent('Thought of you')}&body=${encodeURIComponent(
      `Hey — found a tool I think you'd like. Storyline plans novels and non-fiction with you, AI critique at every stage, exports to EPUB. Free trial: ${refUrl}`,
    )}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    buildUrl: refUrl => `https://www.reddit.com/submit?url=${encodeURIComponent(refUrl)}&title=${encodeURIComponent(
      'Storyline — AI book planner with Save the Cat structure, free trial',
    )}`,
  },
]

export function ShareReferralModal({ send, stats, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  // Fetch stats once when the modal opens.
  useEffect(() => {
    send({ type: 'getReferralStats' })
  }, [send])

  const refUrl = stats ? `${SHARE_BASE_URL}/r/${stats.code}` : ''

  const handleCopy = useCallback(async () => {
    if (!stats) return
    try {
      await navigator.clipboard.writeText(refUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Webview clipboard occasionally requires focus; bounce through host.
      send({ type: 'clipboardWrite', text: refUrl })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [stats, refUrl, send])

  const handleShare = useCallback((platform: SharePlatform) => {
    if (!stats) return
    send({ type: 'openExternal', url: platform.buildUrl(refUrl) })
  }, [stats, refUrl, send])

  const onBackdropKey = (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose() }

  return (
    <div
      onClick={onClose}
      onKeyDown={onBackdropKey}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Share Storyline"
        style={{
          background: 'var(--chat-bg)',
          color: 'var(--text)',
          borderRadius: '12px',
          border: '1px solid var(--sep)',
          maxWidth: '480px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>
              Share Storyline, earn credits
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Send your link to a friend. They get <strong>50 bonus credits</strong> on top of the free plan.
              You earn <strong>25 credits</strong> when they join (up to 20 friends).
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 0,
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {stats === null ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Loading your link…
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              background: 'var(--chat-rail-bg)',
              border: '1px solid var(--sep)',
              borderRadius: '8px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '13px',
              marginBottom: '12px',
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {refUrl}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  background: copied ? 'var(--accent)' : 'var(--accent-sub)',
                  color: copied ? 'white' : 'var(--text)',
                  border: '1px solid rgba(201,168,76,0.4)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: '8px',
              marginBottom: '18px',
            }}>
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleShare(p)}
                  style={{
                    background: 'var(--chat-rail-bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--sep)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--sep)' }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{
              padding: '12px 14px',
              background: 'var(--chat-rail-bg)',
              border: '1px solid var(--sep)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              You've referred <strong style={{ color: 'var(--text)' }}>{stats.referralCount}</strong>{' '}
              friend{stats.referralCount === 1 ? '' : 's'}, earned{' '}
              <strong style={{ color: 'var(--text)' }}>{stats.creditsEarned}</strong> credits.{' '}
              {stats.capRemaining > 0
                ? `${stats.capRemaining} more referrals available.`
                : 'You\'ve hit the 20-referral cap — your link still works as an invite, but no more bonus credits.'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
