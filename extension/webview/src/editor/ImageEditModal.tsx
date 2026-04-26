import React, { useEffect, useMemo, useRef, useState } from 'react'

interface Props {
  src: string
  initialWidth: number | null
  initialHeight: number | null
  onCommit: (next: { width: number | null; height: number | null }) => void
  onCancel: () => void
}

export function ImageEditModal({ src, initialWidth, initialHeight, onCommit, onCancel }: Props): JSX.Element {
  const [naturalW, setNaturalW] = useState<number | null>(null)
  const [naturalH, setNaturalH] = useState<number | null>(null)
  const [width, setWidth] = useState<number | null>(initialWidth)
  const [height, setHeight] = useState<number | null>(initialHeight)
  const [lock, setLock] = useState(true)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const widthRef = useRef<HTMLInputElement | null>(null)

  // Load the file's natural dimensions once — so users can see the
  // original size and "Reset to natural size" works.
  useEffect(() => {
    const img = new window.Image()
    img.onload = () => {
      setNaturalW(img.naturalWidth || null)
      setNaturalH(img.naturalHeight || null)
      // If no explicit width/height yet, seed with naturals
      setWidth(prev => prev ?? img.naturalWidth ?? null)
      setHeight(prev => prev ?? img.naturalHeight ?? null)
    }
    img.src = src
  }, [src])

  useEffect(() => {
    widthRef.current?.focus()
    widthRef.current?.select()
  }, [])

  // Trap escape and click-outside to cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Enter') { e.preventDefault(); commit() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const ratio = useMemo(() => {
    if (naturalW && naturalH) return naturalW / naturalH
    if (width && height) return width / height
    return null
  }, [naturalW, naturalH, width, height])

  const updateWidth = (next: number | null): void => {
    setWidth(next)
    if (lock && ratio && next !== null) {
      setHeight(Math.round(next / ratio))
    }
  }
  const updateHeight = (next: number | null): void => {
    setHeight(next)
    if (lock && ratio && next !== null) {
      setWidth(Math.round(next * ratio))
    }
  }

  const setPercent = (pct: number): void => {
    if (!naturalW) return
    const w = Math.round(naturalW * (pct / 100))
    setWidth(w)
    if (ratio) setHeight(Math.round(w / ratio))
  }

  const reset = (): void => {
    setWidth(null)
    setHeight(null)
  }

  const commit = (): void => {
    onCommit({ width, height })
  }

  return (
    <div className="image-edit-overlay" onMouseDown={ev => { if (ev.target === ev.currentTarget) onCancel() }}>
      <div className="image-edit-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit image size">
        <div className="image-edit-header">Edit Image</div>

        <div className="image-edit-body">
          <div className="image-edit-preview">
            <img src={src} alt="" />
          </div>

          <div className="image-edit-fields">
            <div className="image-edit-row">
              <label htmlFor="iw">Width</label>
              <input
                id="iw"
                ref={widthRef}
                type="number"
                min={1}
                value={width ?? ''}
                onChange={e => updateWidth(e.target.value ? parseInt(e.target.value, 10) : null)}
              />
              <span className="image-edit-unit">px</span>
            </div>

            <div className="image-edit-row">
              <label htmlFor="ih">Height</label>
              <input
                id="ih"
                type="number"
                min={1}
                value={height ?? ''}
                onChange={e => updateHeight(e.target.value ? parseInt(e.target.value, 10) : null)}
              />
              <span className="image-edit-unit">px</span>
            </div>

            <label className="image-edit-lock">
              <input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} />
              <span>Lock aspect ratio</span>
            </label>

            {naturalW && (
              <div className="image-edit-natural">
                Natural size: {naturalW} × {naturalH} px
              </div>
            )}

            <div className="image-edit-presets">
              <button type="button" onClick={() => setPercent(25)} disabled={!naturalW}>25%</button>
              <button type="button" onClick={() => setPercent(50)} disabled={!naturalW}>50%</button>
              <button type="button" onClick={() => setPercent(75)} disabled={!naturalW}>75%</button>
              <button type="button" onClick={() => setPercent(100)} disabled={!naturalW}>100%</button>
              <button type="button" className="image-edit-reset" onClick={reset}>Reset</button>
            </div>
          </div>
        </div>

        <div className="image-edit-footer">
          <button type="button" className="image-edit-btn image-edit-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="image-edit-btn image-edit-btn-primary" onClick={commit}>OK</button>
        </div>
      </div>
    </div>
  )
}
