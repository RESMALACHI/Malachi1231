import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

/**
 * Draw a signature with a finger, a pen or a mouse.
 *
 * Strokes are smoothed (quadratic curves through the midpoints) and the width
 * follows speed a little, so it looks like ink rather than a polyline. The
 * result is TRIMMED to the ink before export — a signature with a canvas of
 * empty space around it would be shrunk to a scribble inside its box.
 */
const SignaturePad = forwardRef(function SignaturePad({ height = 220, onChange }, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const lastMid = useRef(null)
  const [empty, setEmpty] = useState(true)

  const setup = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const w = c.clientWidth
    c.width = Math.round(w * dpr)
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0b2e6b'
  }, [height])

  useEffect(() => {
    setup()
  }, [setup])

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }
  }

  const down = (e) => {
    e.preventDefault()
    // Keeps the stroke when the finger slides off the pad. Some browsers throw
    // for a pointer they consider inactive — a lost capture is not worth a
    // lost stroke.
    try {
      canvasRef.current.setPointerCapture?.(e.pointerId)
    } catch {
      /* draw without capture */
    }
    drawing.current = true
    const p = point(e)
    last.current = p
    lastMid.current = p
    // A tap is a dot.
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2)
    ctx.fillStyle = '#0b2e6b'
    ctx.fill()
  }

  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const p = point(e)
    const l = last.current
    const mid = { x: (l.x + p.x) / 2, y: (l.y + p.y) / 2 }
    const speed = Math.hypot(p.x - l.x, p.y - l.y) / Math.max(1, p.t - l.t)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineWidth = Math.max(1.6, Math.min(3.4, 3.4 - speed * 1.1))
    ctx.beginPath()
    ctx.moveTo(lastMid.current.x, lastMid.current.y)
    ctx.quadraticCurveTo(l.x, l.y, mid.x, mid.y)
    ctx.stroke()
    last.current = p
    lastMid.current = mid
    if (empty) {
      setEmpty(false)
      onChange?.(false)
    }
  }

  const up = () => {
    drawing.current = false
  }

  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setEmpty(true)
    onChange?.(true)
  }

  /** The ink, cropped, as a PNG data URL — or null if nothing was drawn. */
  const toDataUrl = () => {
    if (empty) return null
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const { data, width, height: h } = ctx.getImageData(0, 0, c.width, c.height)
    let minX = width
    let minY = h
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return null
    const pad = 8
    const sx = Math.max(0, minX - pad)
    const sy = Math.max(0, minY - pad)
    const sw = Math.min(width - sx, maxX - minX + pad * 2)
    const sh = Math.min(h - sy, maxY - minY + pad * 2)
    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh)
    return out.toDataURL('image/png')
  }

  useImperativeHandle(ref, () => ({ clear, toDataUrl, isEmpty: () => empty }))

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        // Paper-white in night mode too (exact values dodge the dark remap):
        // the ink is dark blue, and the signature goes onto a white page.
        className="block w-full touch-none rounded-2xl border-2 border-dashed border-[#cbd5e1] bg-[#ffffff]"
        style={{ height }}
        aria-label="משטח חתימה"
      />
      {/* The line people sign on — it makes a blank pad read as "sign here". */}
      <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-[#cbd5e1]" aria-hidden="true" />
      {empty && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#94a3b8]">
          חתמו כאן
        </span>
      )}
    </div>
  )
})

export default SignaturePad
