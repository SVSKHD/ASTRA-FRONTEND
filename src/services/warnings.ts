import { reactive } from 'vue'

export interface WarningEntry {
  id: string
  tone: 'danger' | 'warning' | 'success' | 'info'
  title?: string
  message: string
  dismissible: boolean
  dismiss: () => void
}

export const warningEntries = reactive<WarningEntry[]>([])

export function upsertWarning(entry: WarningEntry): void {
  const index = warningEntries.findIndex((item) => item.id === entry.id)
  if (index === -1) warningEntries.push(entry)
  else warningEntries[index] = entry
}

export function removeWarning(id: string): void {
  const index = warningEntries.findIndex((entry) => entry.id === id)
  if (index !== -1) warningEntries.splice(index, 1)
}
