// Select (or unselect) by tag, in the bulk-selection bar of Todos and Tasks.
//
// The menu lists every tag among the rows that can be selected right now, with
// how many rows wear it. Picking one adds all of those rows to the selection —
// or, when they are all selected already, takes them out again — and leaves
// every other row as it was, so tags combine: Office, then Home, then drop
// Office.
import { computed, type Ref } from 'vue'
import { sameTag } from '@/utils/tags'

export function useTagSelection(opts: {
  /** The rows the selection can include, as the view shows them. */
  selectable: Ref<number[]>
  /** A row's tag, '' for none. */
  tagOf: (id: number) => string
  selected: Ref<Set<number>>
  selectionMode: Ref<boolean>
}) {
  // Each tag once (by its first spelling), with the rows that wear it.
  const groups = computed(() => {
    const out: { tag: string; ids: number[] }[] = []
    for (const id of opts.selectable.value) {
      const tag = opts.tagOf(id)
      if (!tag) continue
      const g = out.find((x) => sameTag(x.tag, tag))
      if (g) g.ids.push(id)
      else out.push({ tag, ids: [id] })
    }
    return out.sort((a, b) => a.tag.localeCompare(b.tag))
  })

  function allPicked(ids: number[]) {
    return ids.every((id) => opts.selected.value.has(id))
  }

  const tagMenu = computed(() =>
    groups.value.map((g) => ({
      value: g.tag,
      label: (allPicked(g.ids) ? 'Unselect ' : '') + g.tag + ' · ' + g.ids.length,
    })),
  )

  function pickTag(tag: string) {
    const g = groups.value.find((x) => sameTag(x.tag, tag))
    if (!g) return
    const next = new Set(opts.selected.value)
    const remove = allPicked(g.ids)
    for (const id of g.ids) {
      if (remove) next.delete(id)
      else next.add(id)
    }
    opts.selected.value = next
    opts.selectionMode.value = true
  }

  return { tagMenu, pickTag }
}
