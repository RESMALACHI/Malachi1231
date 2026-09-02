import { useEffect } from 'react'

/**
 * What every blur-backdrop dialog owes the page behind it.
 *
 * While `active`:
 *   • the page underneath cannot scroll — without this, swiping over the
 *     backdrop scrolls the list behind the dialog, which feels broken and lets
 *     "actions outside the block" happen;
 *   • Escape closes the dialog, matching the click-on-backdrop behaviour.
 *
 * Clicks outside are already blocked physically: the backdrop is a full-screen
 * layer, so anything under it simply can't be reached.
 */
export function useModalLock(active, onClose) {
  useEffect(() => {
    if (!active) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [active, onClose])
}
