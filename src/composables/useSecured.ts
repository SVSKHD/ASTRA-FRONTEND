// The secured ledger (section 28).
//
// Money taken OFF the table. It is its own collection and its own composable
// because it is its own question: "what did the trading earn" and "what have I
// withdrawn" are two answers, and netting them produces a third that answers
// neither. The account block shows both, which is why this exists — a Secured
// figure that always reads zero because nothing feeds it is worse than no
// figure at all.

import { computed, ref } from 'vue'
import type { DocumentData } from 'firebase/firestore'
import { useOwnedMonth } from '@/composables/useOwnedMonth'
import { newId, ownedDelete, ownedSet } from '@/services/owned'
import { round2 } from '@/utils/tradeMath'
import type { SecuredEntry } from '@/types'

export interface NewSecured {
  date: string
  amt: number
  note: string
}

function millis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : 0
}

export function readSecured(id: string, data: DocumentData): SecuredEntry {
  return {
    id,
    userId: String(data.userId ?? ''),
    date: String(data.date ?? ''),
    // A withdrawal is a size, like an expense: it has no direction.
    amt: Math.abs(typeof data.amt === 'number' ? data.amt : 0),
    note: String(data.note ?? ''),
    createdAt: millis(data.createdAt),
  }
}

export function useSecured(month: () => string) {
  const live = useOwnedMonth<SecuredEntry>({
    key: 'securedCollection',
    field: 'date',
    read: readSecured,
    month,
  })

  const error = ref('')

  const entries = computed(() =>
    live.rows.value
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id))),
  )

  const total = computed(() => round2(entries.value.reduce((sum, e) => sum + e.amt, 0)))

  async function add(input: NewSecured): Promise<boolean> {
    const ref = await live.ref()
    if (!ref) return false
    error.value = ''
    void ownedSet(ref, newId(ref), {
      date: input.date,
      amt: round2(Math.abs(input.amt)),
      note: input.note,
      createdAt: ref.fs.serverTimestamp(),
    }).catch((err) => {
      console.error('[Astra] Secured write refused:', err)
      error.value = 'That withdrawal was refused.'
    })
    return true
  }

  async function remove(id: string): Promise<boolean> {
    const ref = await live.ref()
    if (!ref) return false
    try {
      await ownedDelete(ref, id)
      return true
    } catch (err) {
      console.error('[Astra] Secured delete failed:', err)
      error.value = 'That withdrawal could not be deleted — it is still in the ledger.'
      return false
    }
  }

  return { entries, total, error, loading: live.loading, add, remove }
}
