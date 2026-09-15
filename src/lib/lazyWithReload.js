import { lazy } from 'react'

// React.lazy that survives a deploy.
//
// Every page is code-split, and Vite stamps a content hash into each chunk's
// filename. When a new version ships, the filenames change — so a browser tab
// that was already open still holds the OLD index.html and asks for chunks that
// no longer exist. The import rejects, React unmounts the tree, and the user is
// left looking at a blank white page until they refresh by hand.
//
// A failed chunk import almost always means exactly one thing: a newer version
// is live. So reload once and let the fresh index.html point at the current
// files. The sessionStorage flag makes sure that can never become a reload
// loop — if the very next attempt fails too, the error is something else and is
// allowed to reach the error boundary instead.

const RELOAD_FLAG = 'mt_chunk_reloaded'

// Every page's import, kept so they can be fetched ahead of the first click.
const factories = []

/**
 * Fetch every page in the background, one at a time while the browser is idle.
 *
 * A code-split page downloads on its first click — and with navigations run
 * as transitions, the old page just sits there until it arrives: the click
 * feels like it did nothing. Fetched ahead, a menu click is instant. One module
 * per idle slot, so a weak machine never feels the prefetch itself. A failure
 * is ignored; that page simply loads on its click, as before.
 */
export function prefetchPages() {
  const queue = [...factories]
  const idle = (fn) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200)
  const next = () => {
    const factory = queue.shift()
    if (!factory) return
    factory()
      .catch(() => {})
      .finally(() => idle(next))
  }
  idle(next)
}

export function lazyWithReload(factory) {
  factories.push(factory)
  return lazy(async () => {
    try {
      const mod = await factory()
      // Loaded cleanly — re-arm, so the next deploy gets its own single retry.
      try {
        sessionStorage.removeItem(RELOAD_FLAG)
      } catch {
        /* private mode */
      }
      return mod
    } catch (err) {
      let alreadyTried = false
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === '1'
        sessionStorage.setItem(RELOAD_FLAG, '1')
      } catch {
        /* private mode — fall through and just rethrow */
      }

      if (alreadyTried) throw err

      window.location.reload()
      // The page is being replaced; never resolve, so nothing renders meanwhile.
      return new Promise(() => {})
    }
  })
}
