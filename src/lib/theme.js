// Night mode. One class on <html>, one key in localStorage.
//
// The choice is applied in main.jsx BEFORE React mounts — applying it after
// paint flashes the wrong theme on every load, and on a phone that flash is
// the first thing seen every single time.

const KEY = 'mt_theme'

export function savedTheme() {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* a blocked storage costs persistence, not the theme itself */
  }
}

export const isDark = () => document.documentElement.classList.contains('dark')
