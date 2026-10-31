import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'coindeccflow-theme'
const META_COLOR: Record<Theme, string> = { dark: '#050B18', light: '#EDF7FF' }
const listeners = new Set<() => void>()

function read(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'light' ? 'light' : 'dark'
}

/** Applies a theme to the page, saves it, and notifies subscribers. */
export function setTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.add('theme-transition')
  root.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme])
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable (private mode). The theme still applies for this visit.
  }
  window.setTimeout(() => root.classList.remove('theme-transition'), 300)
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current theme, kept in sync with <html data-theme>. The inline script in index.html sets it before first paint. */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void; toggle: () => void } {
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => 'dark')
  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}
