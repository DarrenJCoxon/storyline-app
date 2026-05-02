'use client'

import { useEffect, useState } from 'react'
import styles from './DownloadCard.module.css'

// GitHub's `releases/latest/download/<asset-name>` URLs always redirect to the
// newest tagged release's matching asset. Asset names below match the Tauri
// bundler's output for Storyline Installer 0.1.0 — if the installer's own
// version (in installer/src-tauri/tauri.conf.json) ever bumps, these
// filenames change and the page stops resolving.
const REPO = 'DarrenJCoxon/storyline-app'
const BASE = `https://github.com/${REPO}/releases/latest/download`

const downloads = {
  macAppleSilicon: {
    label: 'Mac (Apple Silicon — M1, M2, M3, M4)',
    url: `${BASE}/Storyline.Installer_0.1.0_aarch64.dmg`,
  },
  macIntel: {
    label: 'Mac (Intel — older Macs)',
    url: `${BASE}/Storyline.Installer_0.1.0_x64.dmg`,
  },
  windows: {
    label: 'Windows 10 or 11',
    url: `${BASE}/Storyline.Installer_0.1.0_x64-setup.exe`,
  },
} as const

type PlatformKey = keyof typeof downloads | null

async function detectPlatform(): Promise<PlatformKey> {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (!/Mac/i.test(ua)) return null

  // Apple Silicon detection: try UA-CH first (Chrome/Edge), then fall back
  // to the historic ua-arch heuristic. Safari blocks this, so we default
  // unknown Macs to Apple Silicon since 90%+ of Macs sold since 2020 are.
  type UAData = {
    getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }>
  }
  const data = (navigator as Navigator & { userAgentData?: UAData }).userAgentData
  if (data?.getHighEntropyValues) {
    try {
      const info = await data.getHighEntropyValues(['architecture'])
      if (info.architecture === 'x86') return 'macIntel'
      if (info.architecture === 'arm') return 'macAppleSilicon'
    } catch {
      /* fall through */
    }
  }
  if (/Intel/i.test(ua)) return 'macAppleSilicon'
  return 'macAppleSilicon'
}

export default function DownloadCard() {
  const [primary, setPrimary] = useState<PlatformKey>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    void detectPlatform().then(setPrimary)
  }, [])

  const primaryEntry = primary ? downloads[primary] : null

  return (
    <div className={styles.card}>
      {primaryEntry ? (
        <>
          <a href={primaryEntry.url} className={styles.primary}>
            <span className={styles.primaryLabel}>Download Storyline</span>
            <span className={styles.primarySub}>for {primaryEntry.label}</span>
          </a>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setShowAll(v => !v)}
            aria-expanded={showAll}
          >
            {showAll ? 'Hide other versions' : 'Different computer? Choose another version'}
          </button>
        </>
      ) : (
        <div className={styles.fallback}>
          <p className={styles.fallbackText}>Choose your system to download:</p>
        </div>
      )}

      {(showAll || !primaryEntry) && (
        <ul className={styles.altList}>
          {(Object.entries(downloads) as Array<[keyof typeof downloads, (typeof downloads)[keyof typeof downloads]]>).map(([key, entry]) => (
            <li key={key}>
              <a href={entry.url} className={styles.altLink}>
                <span>{entry.label}</span>
                <span className={styles.altArrow}>↓</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.helpText}>
        Not sure which Mac you have? Click the Apple menu → <strong>About This Mac</strong>. If it lists an{' '}
        <strong>M1, M2, M3 or M4</strong> chip, choose Apple Silicon.
      </p>
    </div>
  )
}
