import { useCallback, useEffect, useState } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'activity' }
  | { name: 'agreements' }
  | { name: 'milestones' }
  | { name: 'settings' }
  | { name: 'agreement'; id: bigint }

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'create') return { name: 'create' }
  if (parts[0] === 'activity') return { name: 'activity' }
  if (parts[0] === 'agreements') return { name: 'agreements' }
  if (parts[0] === 'milestones') return { name: 'milestones' }
  if (parts[0] === 'settings') return { name: 'settings' }
  if (parts[0] === 'agreement' && parts[1] && /^\d+$/.test(parts[1])) {
    return { name: 'agreement', id: BigInt(parts[1]) }
  }
  return { name: 'dashboard' }
}

const NAVIGATE_EVENT = 'flow:navigate'

/** Client-side navigation. Notifies every useRoute subscriber. */
export function navigate(path: string): void {
  if (window.location.pathname === path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
  window.scrollTo({ top: 0 })
}

export function useRoute(): Route {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  const sync = useCallback(() => setPathname(window.location.pathname), [])

  useEffect(() => {
    window.addEventListener('popstate', sync)
    window.addEventListener(NAVIGATE_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(NAVIGATE_EVENT, sync)
    }
  }, [sync])

  return parseRoute(pathname)
}
