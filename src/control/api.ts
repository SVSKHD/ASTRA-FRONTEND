// Shared plumbing for the control center (/dev, Phase 21).
//
// Every call goes through the typed Aureon client (`aureon`, cookies + CSRF).
// No credential for GitHub, Claude or Discord ever reaches the browser: the
// server holds them and the pages only see what its endpoints return.

import { reactive } from 'vue'
import type { components } from '@/api/client'
import { ApiFailure, must } from '@/trading/useLoad'

export { ApiFailure, must }
export type Schemas = components['schemas']
export type Gated = Schemas['GatedOut']

/** The repository every GitHub module is pointed at, "owner/name". Kept per browser. */
const REPO_KEY = 'cc.repo'
function readRepo(): string {
  try {
    return globalThis.localStorage?.getItem(REPO_KEY) ?? ''
  } catch {
    return ''
  }
}
export const cc = reactive({ repo: readRepo() })

export function setRepo(full: string): void {
  cc.repo = full
  try {
    globalThis.localStorage?.setItem(REPO_KEY, full)
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

/** `{ owner, repo }` path params for the selected repository, or null. */
export function repoParams(full = cc.repo): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = full.split('/')
  return owner && repo && !rest.length ? { owner, repo } : null
}

/** The error code FastAPI put in `detail.code`, if any. */
export function codeOf(error: unknown): string {
  const d = (error as { detail?: unknown } | undefined)?.detail
  if (d && typeof d === 'object' && 'code' in d && typeof d.code === 'string') return d.code
  return ''
}

/** A short sha for display. */
export function short(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : '—'
}
