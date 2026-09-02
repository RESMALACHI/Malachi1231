import { useRef, useState } from 'react'
import { Check, X } from 'lucide-react'

// How far the finger must travel before the swipe counts. Below this the row
// springs back — a scroll that drifted sideways must never mark a meeting.
const COMMIT_PX = 72
// Past this the row stops following the finger, so a long drag can't tear the
// row out of the list.
const MAX_PX = 108

/**
 * Wraps a meeting row so it can be marked with one thumb movement.
 *
 * Directions are PHYSICAL, not logical: dragging right reveals the panel on the
 * left, and vice versa. That is how every phone list behaves, and mirroring it
 * for RTL would put the reveal on the wrong side of the finger.
 *   drag right → "הגיע"      drag left → "לא הגיע"
 *
 * Touch only. On a mouse the row is unchanged and the buttons inside it (or the
 * detail view) remain the way to set a status.
 */
export default function SwipeToMark({ onMark, disabled = false, children }) {
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)
  const start = useRef(null)

  const begin = (e) => {
    if (disabled) return
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY, locked: null }
    setSettling(false)
  }

  const move = (e) => {
    const s = start.current
    if (!s) return
    const t = e.touches[0]
    const dX = t.clientX - s.x
    const dY = t.clientY - s.y

    // First meaningful movement decides what this gesture is. Once it's a
    // vertical scroll it stays one, so the list never fights the finger.
    if (s.locked === null) {
      if (Math.abs(dX) < 8 && Math.abs(dY) < 8) return
      s.locked = Math.abs(dX) > Math.abs(dY) ? 'x' : 'y'
    }
    if (s.locked !== 'x') return

    // Resist past the maximum instead of stopping dead — the row still responds,
    // it just gets heavier.
    const capped =
      Math.abs(dX) <= MAX_PX
        ? dX
        : Math.sign(dX) * (MAX_PX + (Math.abs(dX) - MAX_PX) * 0.18)
    setDx(capped)
  }

  const end = () => {
    const s = start.current
    start.current = null
    setSettling(true)

    if (s?.locked === 'x' && Math.abs(dx) >= COMMIT_PX) {
      onMark(dx > 0 ? 'attended' : 'no_show')
    }
    setDx(0)
  }

  const revealing = Math.abs(dx) > 4
  const strength = Math.min(1, Math.abs(dx) / COMMIT_PX)
  const armed = Math.abs(dx) >= COMMIT_PX

  return (
    <div className="relative overflow-hidden">
      {/* Action panels sit underneath; the row slides to uncover one.

          dir="ltr" is deliberate and load-bearing. The page is RTL, which would
          put the FIRST flex child on the right — but dragging right uncovers the
          LEFT, so "הגיע" has to be the physically-left panel. Forcing LTR here
          makes source order match physical order, and the gesture match the
          label it reveals. */}
      {revealing && (
        <div className="absolute inset-0 flex" dir="ltr" aria-hidden="true">
          <div
            className={`flex flex-1 items-center justify-start pl-5 text-sm font-extrabold text-white transition-colors ${
              armed && dx > 0 ? 'bg-green-600' : 'bg-green-500/70'
            }`}
            style={{ opacity: dx > 0 ? strength : 0 }}
          >
            <Check className="me-1.5 h-5 w-5" strokeWidth={3} />
            הגיע
          </div>
          <div
            className={`flex flex-1 items-center justify-end pr-5 text-sm font-extrabold text-white transition-colors ${
              armed && dx < 0 ? 'bg-red-600' : 'bg-red-500/70'
            }`}
            style={{ opacity: dx < 0 ? strength : 0 }}
          >
            לא הגיע
            <X className="ms-1.5 h-5 w-5" strokeWidth={3} />
          </div>
        </div>
      )}

      <div
        onTouchStart={begin}
        onTouchMove={move}
        onTouchEnd={end}
        onTouchCancel={end}
        // pan-y lets the page scroll vertically while this element keeps the
        // horizontal axis — without it the browser steals the gesture.
        style={{
          transform: `translateX(${dx}px)`,
          touchAction: 'pan-y',
          transition: settling ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none',
        }}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  )
}
