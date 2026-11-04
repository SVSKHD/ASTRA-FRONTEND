// Modules that have a page of their own. A manifest module whose key is here
// opens that page instead of the generic view; anything else — including a
// module whose page has gone missing from the router — gets the generic view,
// so a new backend module is never a dead link.

/** Manifest module key → the app's own page for it. */
export const OVERRIDES: Record<string, string> = {
  agents: '/dev/agents',
  approvals: '/dev/inbox',
  audit: '/dev/audit',
  dhan: '/trading/dhan',
  github: '/dev',
  images: '/images',
  mt5: '/trading/mt5',
  news: '/news',
  paper: '/trading/paper',
  repairs: '/dev/repairs',
  settings: '/settings',
  system: '/dev/system',
  trading: '/trading',
}

export interface ModuleTarget {
  to: string
  /** True when it is the app's own page rather than the generic view. */
  custom: boolean
}

/**
 * Where a module opens. `exists` says whether a path resolves to a real page
 * (router.resolve(path).name !== 'not-found'); without it, overrides are trusted.
 */
export function moduleTarget(
  key: string,
  exists: (path: string) => boolean = () => true,
  overrides: Record<string, string> = OVERRIDES,
): ModuleTarget {
  const own = overrides[key]
  if (own && exists(own)) return { to: own, custom: true }
  return { to: `/modules/${encodeURIComponent(key)}`, custom: false }
}
