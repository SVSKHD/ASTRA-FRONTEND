// One document, read once and then watched: `Astra-users/{uid}` (section 32).
//
// It holds two different kinds of thing, and the difference matters:
//
//   • THE COLLECTION NAMES. Every query path in the app is built from these, so
//     nothing else may read Firestore until they have arrived. `ready` is what
//     the other composables wait on.
//   • THE DURABLE CHOICES — theme, targets, default symbol, the broker's clock.
//     Only choices that should follow the user to another machine live here;
//     which tab was open and what was half-typed belong to the URL and to
//     sessionStorage, not to a database (section 33).
//
// It is a plain top-level document keyed by the uid, so its own rule —
// `request.auth.uid == userId` — is the gate, and it needs no owner field.

import { computed, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { loadFirestore } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import {
  DEFAULT_COLLECTIONS,
  DEFAULT_WATCH_SETTINGS,
  resolveCollection,
  type CollectionKey,
} from '@/utils/collections'
import { DEFAULT_LOGGER_SETTINGS } from '@/utils/tradeMath'
import type { AstraSettings, LoggerSettings, NewsCategory } from '@/types'

export const ASTRA_USERS = 'Astra-users'

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readSettings(data: DocumentData | undefined): AstraSettings {
  const d = data ?? {}
  const logger: LoggerSettings = {
    startingBalance: num(d.startingBalance, DEFAULT_LOGGER_SETTINGS.startingBalance),
    dayTarget: num(d.dayTarget, DEFAULT_LOGGER_SETTINGS.dayTarget),
    monthTarget: num(d.monthTarget, DEFAULT_LOGGER_SETTINGS.monthTarget),
    monthlyBudget: num(d.monthlyBudget, DEFAULT_LOGGER_SETTINGS.monthlyBudget),
    netExpenses: d.netExpenses === true,
    defaultLot: num(d.defaultLot, DEFAULT_LOGGER_SETTINGS.defaultLot),
    lastSymbol: String(d.lastSymbol || DEFAULT_LOGGER_SETTINGS.lastSymbol),
    contractSizes: {
      ...DEFAULT_LOGGER_SETTINGS.contractSizes,
      ...(typeof d.contractSizes === 'object' && d.contractSizes
        ? (d.contractSizes as Record<string, number>)
        : {}),
    },
    theme: String(d.theme ?? ''),
    brokerTimezone: String(d.brokerTimezone ?? ''),
    brokerOffsetMinutes: num(d.brokerOffsetMinutes, DEFAULT_LOGGER_SETTINGS.brokerOffsetMinutes),
    sessionBounds: {
      ...DEFAULT_LOGGER_SETTINGS.sessionBounds,
      ...(typeof d.sessionBounds === 'object' && d.sessionBounds
        ? (d.sessionBounds as Record<string, string>)
        : {}),
    },
  }
  const names = {} as Record<CollectionKey, string>
  for (const key of Object.keys(DEFAULT_COLLECTIONS) as CollectionKey[]) {
    // Through `resolveCollection` rather than straight off the document: a name
    // that no longer validates falls back to the default instead of building a
    // query path that throws.
    names[key] = resolveCollection(d as Record<CollectionKey, string>, key)
  }
  return {
    ...logger,
    ...names,
    // Lower-cased on read as well as on write: the webhook matches on the
    // lower-case name, and a repo typed with capitals would silently never
    // resolve to this uid (section 40).
    trackedRepos: Array.isArray(d.trackedRepos)
      ? (d.trackedRepos as string[]).map((r) => String(r).trim().toLowerCase()).filter(Boolean)
      : [...DEFAULT_WATCH_SETTINGS.trackedRepos],
    newsCategories: Array.isArray(d.newsCategories)
      ? (d.newsCategories as NewsCategory[]).filter((c) =>
          (['forex', 'ai', 'code'] as string[]).includes(c),
        )
      : [...DEFAULT_WATCH_SETTINGS.newsCategories],
  }
}

let shared: ReturnType<typeof create> | null = null

function create() {
  const { user } = storeToRefs(useAuthStore())
  const uid = computed(() => user.value?.uid ?? '')
  const stored = ref<AstraSettings>(readSettings(undefined))
  const ready = ref(false)
  const error = ref('')
  let unsub: Unsubscribe | null = null
  let watching = ''

  async function attach(owner: string): Promise<void> {
    unsub?.()
    unsub = null
    watching = owner
    ready.value = false
    if (!owner) {
      stored.value = readSettings(undefined)
      return
    }
    const cloud = await loadFirestore()
    if (!cloud || owner !== watching) return
    const { db, fs } = cloud
    unsub = fs.onSnapshot(
      fs.doc(db, ASTRA_USERS, owner),
      (snap) => {
        stored.value = readSettings(snap.exists() ? snap.data() : undefined)
        // Ready on the FIRST snapshot whether or not the document exists: a new
        // account has no settings document and would otherwise wait forever for
        // one, with every other collection blocked behind it.
        ready.value = true
      },
      (err) => {
        console.error('[Astra] Settings listener failed:', err)
        error.value = 'Settings could not be read. The defaults are in use.'
        ready.value = true
      },
    )
  }

  async function save(patch: Partial<AstraSettings>): Promise<boolean> {
    const owner = uid.value
    if (!owner) return false
    const cloud = await loadFirestore()
    if (!cloud) return false
    const before = stored.value
    stored.value = { ...before, ...patch }
    try {
      // Merged, never replaced: two devices editing different settings must not
      // clobber one another, and the collection names must survive a theme
      // change made on a phone.
      await cloud.fs.setDoc(cloud.fs.doc(cloud.db, ASTRA_USERS, owner), patch, { merge: true })
      return true
    } catch (err) {
      console.error('[Astra] Settings write failed:', err)
      stored.value = before
      error.value = 'That setting could not be saved.'
      return false
    }
  }

  return { uid, settings: stored, ready, error, attach, save, unsubscribe: () => unsub?.() }
}

/**
 * One instance for the whole app.
 *
 * Shared rather than per-caller because the collection names are a singleton by
 * nature: two listeners on one document is two reads of the same bytes, and a
 * second copy that lags the first would have half the app querying the old name
 * after a rename.
 */
export function useSettings() {
  if (!shared) {
    shared = create()
    void shared.attach(shared.uid.value)
  }
  const api = shared
  // Re-attach on a uid change without tearing the singleton down: the watcher
  // lives here so a component's lifetime never ends the subscription for
  // everyone else.
  const seen = ref(api.uid.value)
  const stop = () => {
    if (seen.value !== api.uid.value) {
      seen.value = api.uid.value
      void api.attach(api.uid.value)
    }
  }
  stop()
  onUnmounted(stop)
  return api
}

/** Test seam: drops the shared instance so a fresh uid can be attached. */
export function resetSettings(): void {
  shared?.unsubscribe()
  shared = null
}
