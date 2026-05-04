'use client'

import { useEffect, useState } from 'react'
import styles from './DownloadCard.module.css'

// GitHub's `releases/latest/download/<asset-name>` URLs always redirect to the
// newest tagged release's matching asset. Asset names below match the Tauri
// bundler's output for Storyline Installer 0.2.2 — if the installer's own
// version (in installer/src-tauri/tauri.conf.json) ever bumps, these
// filenames change and the page stops resolving.
const REPO = 'DarrenJCoxon/storyline-app'
const BASE = `https://github.com/${REPO}/releases/latest/download`

const downloads = {
  macAppleSilicon: {
    label: 'Mac (Apple Silicon — M1, M2, M3, M4)',
    url: `${BASE}/Storyline.Installer_0.2.2_aarch64.dmg`,
  },
  macIntel: {
    label: 'Mac (Intel — older Macs)',
    url: `${BASE}/Storyline.Installer_0.2.2_x64.dmg`,
  },
  windows: {
    label: 'Windows 10 or 11',
    url: `${BASE}/Storyline.Installer_0.2.2_x64-setup.exe`,
  },
} as const

type PlatformKey = keyof typeof downloads | null

async function detectPlatform(): Promise<PlatformKey> {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (!/Mac/i.test(ua)) return null

  // Apple Silicon detection: try UA-CH first (Chrome/Edge), then fall back
  // to Apple Silicon as the default — since 2020 the vast majority of Macs
  // sold are Apple Silicon, and Safari blocks UA-CH so we'd guess wrong
  // for most Mac visitors otherwise.
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
            Download for {primaryEntry.label.split(' (')[0]}
            <span className={styles.primarySub}>{primaryEntry.label.match(/\(([^)]+)\)/)?.[1] ?? ''}</span>
          </a>
          <p className={styles.helperLine}>
            Free to install. Includes a one-book free plan — no card required.
          </p>
          <p className={styles.platformNote}>
            Desktop app for <strong>Mac &amp; Windows</strong>. Not available on iOS, Android, or in a web browser — Storyline runs as a VS Code extension on your computer.
          </p>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setShowAll(v => !v)}
            aria-expanded={showAll}
          >
            {showAll ? 'Hide other versions' : 'Different computer?'}
          </button>
        </>
      ) : (
        <>
          <p className={styles.helperLine}>Choose your system to download:</p>
          <p className={styles.platformNote}>
            Desktop app for <strong>Mac &amp; Windows</strong>. Not available on iOS, Android, or in a web browser — Storyline runs as a VS Code extension on your computer.
          </p>
        </>
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
        Not sure which Mac you have? Click the Apple menu → <strong>About This Mac</strong>. If it
        lists an <strong>M1, M2, M3 or M4</strong> chip, choose Apple Silicon.
      </p>
    </div>
  )
}
