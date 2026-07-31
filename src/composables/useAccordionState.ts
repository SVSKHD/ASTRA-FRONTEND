// Per-parent expanded state for the linked-items accordion, persisted to
// localStorage keyed by "collection:id" so it survives navigation and reload.
// A single module-scoped reactive map is shared by every accordion instance, so
// the list header's expand/collapse-all and an individual chevron stay in sync.

import { ref } from 'vue'

const STORE_KEY = 'aureon:linkAccordion'

function load(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

const state = ref<Record<string, boolean>>(load())

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.value))
  } catch {
    /* ignore (private mode / quota) */
  }
}

export function useAccordionState() {
  function isOpen(key: string, fallback = false): boolean {
    return state.value[key] ?? fallback
  }
  function set(key: string, open: boolean) {
    state.value = { ...state.value, [key]: open }
    persist()
  }
  function toggle(key: string, fallback = false) {
    set(key, !isOpen(key, fallback))
  }
  function setMany(keys: string[], open: boolean) {
    const next = { ...state.value }
    for (const k of keys) next[k] = open
    state.value = next
    persist()
  }
  return { isOpen, set, toggle, setMany }
}
