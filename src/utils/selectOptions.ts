// Turning a list into listbox options (section 25d).
//
// Half the selects in this app were over a plain array of strings — tags,
// units, repo names. The library's Select takes { value, label } so that an
// option can also carry a group or an icon, which a bare string cannot. This is
// the one-line bridge, kept here rather than written out at thirty call sites
// where it would be thirty chances to write `label: o.value` by mistake.
import type { ListOption } from '@/composables/useListbox'

/** `['work', 'home']` → two options whose value and label are the same. */
export function toOptions(values: readonly string[]): ListOption[] {
  return values.map((value) => ({ value, label: value }))
}

/**
 * For a list keyed by a number — a repo id, a note id. The listbox works in
 * strings, since a DOM value is a string and a mixed-type option list is how
 * `4 === '4'` bugs get in; the caller converts back at the point of use.
 */
export function toOptionsBy<T>(
  items: readonly T[],
  value: (item: T) => string | number,
  label: (item: T) => string,
): ListOption[] {
  return items.map((item) => ({ value: String(value(item)), label: label(item) }))
}
