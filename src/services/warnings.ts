import { reactive, toRaw } from 'vue'

export interface WarningEntry {
  id: string
  tone: 'danger' | 'warning' | 'success' | 'info'
  title?: string
  message: string
  dismissible: boolean
  dismiss: () => void
}

export const warningEntries = reactive<WarningEntry[]>([])

// The lookups read the RAW array. Each <Alert> calls these from inside its own
// watchEffect, and a reactive read there would subscribe that effect to the whole
// list: with two Alerts on one page, each one's write re-ran the other's effect,
// which wrote again — "Maximum recursive updates exceeded in component <Alert>".
// The writes still go through the reactive array, so WarningTray updates as before.
function indexOf(id: string): number {
  return toRaw(warningEntries).findIndex((item) => item.id === id)
}

export function upsertWarning(entry: WarningEntry): void {
  const index = indexOf(entry.id)
  if (index === -1) warningEntries.push(entry)
  else warningEntries[index] = entry
}

export function removeWarning(id: string): void {
  const index = indexOf(id)
  if (index !== -1) warningEntries.splice(index, 1)
}
