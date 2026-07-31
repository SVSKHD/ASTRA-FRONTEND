// Draft-resume model. Every editable surface can stash its in-progress form
// state as a draft keyed by the entity being edited, so an interrupted edit — a
// killed tab, a route change, switching devices — is offered back on the next
// open rather than silently lost. Drafts live inside the same offline-synced
// workspace document as everything else, so this works offline and across
// devices for free, with no second persistence mechanism.

export interface DraftRecord {
  entityType: string
  // A create form has no id yet; it shares the type's single 'new' slot, stored
  // here as null.
  entityId: number | null
  payload: Record<string, unknown>
  updatedAt: number
  deviceLabel: string
}

// One draft slot per entity. Only one create dialog of a given type is ever
// open, so a null id collapses to a shared `${type}:new` slot.
export function draftKey(entityType: string, entityId: number | null | undefined): string {
  return `${entityType}:${entityId ?? 'new'}`
}

const DEVICE_STORAGE_KEY = 'aureon-device-label'

// A coarse, human-readable platform name so a cross-device draft can say where
// it came from ("…changes from another device"). Never used for logic — the
// stored deviceLabel is what identifies a device.
export function guessPlatform(): string {
  if (typeof navigator === 'undefined') return 'Device'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'Chromebook'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Device'
}

// Kept in a module variable so a browser with storage disabled (private mode)
// still gets one stable label for the lifetime of the tab.
let memoryLabel = ''

// A stable-per-browser device label, persisted so the same browser keeps its
// identity across reloads. Regenerated only if storage is cleared. The suffix
// disambiguates two browsers on the same platform.
export function deviceLabel(): string {
  if (memoryLabel) return memoryLabel
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DEVICE_STORAGE_KEY)
      if (stored) {
        memoryLabel = stored
        return stored
      }
      const fresh = `${guessPlatform()} · ${Math.random().toString(36).slice(2, 6)}`
      localStorage.setItem(DEVICE_STORAGE_KEY, fresh)
      memoryLabel = fresh
      return fresh
    }
  } catch {
    /* storage unavailable — fall through to an in-memory label */
  }
  memoryLabel = `${guessPlatform()} · ${Math.random().toString(36).slice(2, 6)}`
  return memoryLabel
}

export type DraftDecision =
  // Nothing worth restoring: no draft, or the draft is not newer than the saved
  // item (the item already contains everything the draft held).
  | { action: 'none' }
  // Restore silently and show a dismissible bar (same device, or a create form).
  | { action: 'restore'; record: DraftRecord }
  // Ask before applying — the draft was written on a different device.
  | { action: 'prompt'; record: DraftRecord }

// The one place that decides what to do with a stored draft on open. A draft
// only matters when it is strictly newer than the saved entity; a draft from
// another device is offered with a choice rather than applied silently.
export function decideDraft(
  record: DraftRecord | undefined | null,
  entityUpdatedAt: number,
  currentDevice: string,
): DraftDecision {
  if (!record) return { action: 'none' }
  if (!(record.updatedAt > entityUpdatedAt)) return { action: 'none' }
  if (record.deviceLabel && currentDevice && record.deviceLabel !== currentDevice) {
    return { action: 'prompt', record }
  }
  return { action: 'restore', record }
}

// Validate a drafts map read back from the workspace doc. A malformed or partial
// entry is dropped rather than trusted, matching how the store backfills every
// other stored shape on hydrate.
export function sanitizeDrafts(raw: unknown): Record<string, DraftRecord> {
  const out: Record<string, DraftRecord> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const r = value as Partial<DraftRecord>
    if (typeof r.entityType !== 'string' || !r.entityType) continue
    if (!r.payload || typeof r.payload !== 'object') continue
    out[key] = {
      entityType: r.entityType,
      entityId: typeof r.entityId === 'number' ? r.entityId : null,
      payload: r.payload as Record<string, unknown>,
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
      deviceLabel: typeof r.deviceLabel === 'string' ? r.deviceLabel : '',
    }
  }
  return out
}

// "2h ago" style label for the restore bar. Coarse on purpose — the exact
// second never matters to the reader.
export function relativeTime(from: number, now: number): string {
  const secs = Math.max(0, Math.round((now - from) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
