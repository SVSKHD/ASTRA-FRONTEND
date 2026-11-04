// The Modules nav, read from the server (GET /api/v1/ui/manifest, backend
// docs/ui-manifest.md).
//
// A backend route that declares an `x-ui` block becomes a module here with no
// frontend change: the server derives the manifest from its own OpenAPI, and
// this renders a generic view for it — or the app's own page, when there is
// one (src/modules/overrides.ts).
//
// Read on sign-in, and again whenever the server's API fingerprint changes:
// every response carries `X-API-Schema` (src/api/client.ts onApiSchema), so the
// first request after a deploy notices; a `schema_changed` event on the stream
// does the same. Modules this browser has not opened yet carry a "New" badge.

import { reactive, watch } from 'vue'
import { onApiSchema } from '@/api/client'
import { callView } from './request'
import { checkSession, tradingSession } from '@/trading/session'

export type ColumnFormat = 'datetime' | 'date' | 'boolean' | 'number'
export interface ManifestColumn {
  key: string
  label: string
  format?: ColumnFormat
}
export type ViewKind = 'list' | 'detail' | 'form' | 'action' | 'stream'
export type Danger = 'none' | 'confirm' | 'approval' | 'hidden'

export interface ManifestView {
  kind: ViewKind
  id: string
  title: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  danger: Danger
  path_params: string[]
  roles?: string[]
  // list
  columns?: ManifestColumn[]
  items_path?: string
  total_path?: string | null
  filters?: { name: string; required: boolean; schema: Record<string, unknown> }[]
  pagination?:
    | { style: 'offset'; limit: string; offset: string }
    | { style: 'page'; page: string; per_page: string }
    | null
  detail?: string
  row_key?: string
  // detail
  fields?: ManifestColumn[]
  // form / action
  request_schema?: Record<string, unknown> | null
  confirm?: string
  row?: boolean
  // stream
  events?: string[]
}

export interface ManifestModule {
  key: string
  title: string
  description?: string | null
  roles?: string[]
  views: ManifestView[]
}

export interface Manifest {
  version: number
  schema_hash: string
  modules: ManifestModule[]
}

export const MANIFEST_PATH = '/api/v1/ui/manifest'
const SEEN_KEY = 'modules.seen'

function readSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}
function writeSeen(keys: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(keys))
  } catch {
    /* private window: badges come back next visit */
  }
}

export const moduleState = reactive({
  manifest: null as Manifest | null,
  loading: false,
  error: '',
  /** false when the server has no manifest endpoint (404): the nav stays empty, quietly. */
  available: true,
  /** Module keys this browser has opened (or that existed the first time it looked). */
  seen: readSeen(),
})

/**
 * Defence in depth: the server already filters by role and drops hidden
 * operations; this filters again, so a manifest from an older or misbehaving
 * server can never put a hidden operation or another role's view on screen.
 */
export function usable(m: Manifest | null, role: string): ManifestModule[] {
  if (!m || !Array.isArray(m.modules)) return []
  return m.modules
    .filter((mod) => !mod.roles?.length || mod.roles.includes(role))
    .map((mod) => ({
      ...mod,
      views: (mod.views ?? []).filter(
        (v) => v.danger !== 'hidden' && (!v.roles?.length || v.roles.includes(role)),
      ),
    }))
    .filter((mod) => mod.views.length > 0)
}

export function isNew(key: string): boolean {
  return !!moduleState.seen && !moduleState.seen.includes(key)
}
export function markSeen(key: string): void {
  if (!moduleState.seen || moduleState.seen.includes(key)) return
  moduleState.seen = [...moduleState.seen, key]
  writeSeen(moduleState.seen)
}

let inflight: Promise<void> | null = null
export function loadManifest(): Promise<void> {
  if (inflight) return inflight
  moduleState.loading = true
  inflight = (async () => {
    try {
      // Untyped on purpose: the endpoint can be newer than this build's client.
      const r = await callView({ method: 'GET', path: MANIFEST_PATH })
      if (r.status === 404) {
        moduleState.available = false
        moduleState.manifest = null
        return
      }
      if (!r.ok || !r.data) throw new Error(r.error || `HTTP ${r.status}`)
      const m = r.data as Manifest
      if (!Array.isArray(m.modules)) throw new Error('the manifest has no module list')
      moduleState.available = true
      moduleState.manifest = m
      moduleState.error = ''
      // The first manifest this browser sees sets the baseline: what is there
      // now is not "new"; what a later deploy adds is.
      if (!moduleState.seen) {
        moduleState.seen = m.modules.map((x) => x.key)
        writeSeen(moduleState.seen)
      }
    } catch (e) {
      moduleState.error = `Could not read the modules: ${(e as Error).message}`
    } finally {
      moduleState.loading = false
      inflight = null
    }
  })()
  return inflight
}

/** The server's fingerprint moved on: re-read, unless it is the one we hold. */
export function onSchemaFingerprint(fingerprint: string): void {
  const held = moduleState.manifest?.schema_hash
  if (!tradingSession.user || !moduleState.available) return
  if (held && held === fingerprint) return
  if (!held && moduleState.loading) return
  void loadManifest()
}

let started = false
/**
 * Wire it up once (App.vue). `signedIn` is the workspace's own sign-in (the
 * auth store's user): when it appears, the Aureon session is checked, and an
 * Aureon session loads the manifest. A fingerprint change reloads it.
 */
export function startModules(signedIn: () => unknown = () => null): void {
  if (started) return
  started = true
  watch(
    signedIn,
    (who) => {
      if (who && !tradingSession.user) void checkSession()
    },
    { immediate: true },
  )
  watch(
    () => tradingSession.user?.uid ?? null,
    (uid) => {
      if (uid) void loadManifest()
      else moduleState.manifest = null
    },
    { immediate: true },
  )
  onApiSchema(onSchemaFingerprint)
}

/** Tests only. */
export function resetModules(): void {
  started = false
  moduleState.manifest = null
  moduleState.loading = false
  moduleState.error = ''
  moduleState.available = true
  moduleState.seen = readSeen()
  inflight = null
}
