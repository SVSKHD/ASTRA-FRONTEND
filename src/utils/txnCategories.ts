// Spend categories: the seeded defaults, and the rules for editing them.
//
// Seeded rather than empty, because the first thing a new user does is add a
// transaction, and a Combobox with nothing in it makes them invent a taxonomy
// before they have recorded a single rupee. Seeded lightly, though — twelve
// buckets that cover most of a month, each of which a person can rename,
// recolour or archive.
//
// Archived rather than deleted, always. A category is referenced by name on
// every transaction that used it, so deleting one would either orphan those
// rows or silently rewrite history; archiving takes it out of the picker and
// leaves the past intact.

import type { TxnCategory } from '@/types'
import type { IconName } from '@/components/ui/icons'

export interface CategorySeed {
  name: string
  icon: IconName
  color: string
}

// Colours are spread around the wheel at one lightness and one chroma, so no
// category shouts louder than another — the colour identifies, it does not
// rank. They land on a dot and a 3px bar, never on the text.
export const CATEGORY_SEEDS: readonly CategorySeed[] = [
  { name: 'Food', icon: 'rupee', color: 'oklch(0.72 0.14 45)' },
  { name: 'Groceries', icon: 'list', color: 'oklch(0.72 0.14 130)' },
  { name: 'Rent', icon: 'notebook', color: 'oklch(0.72 0.14 265)' },
  { name: 'Bills', icon: 'bell', color: 'oklch(0.72 0.14 20)' },
  { name: 'Transport', icon: 'map-pin', color: 'oklch(0.72 0.14 210)' },
  { name: 'Fuel', icon: 'repeat', color: 'oklch(0.72 0.14 90)' },
  { name: 'Health', icon: 'help', color: 'oklch(0.72 0.14 350)' },
  { name: 'Shopping', icon: 'tag', color: 'oklch(0.72 0.14 320)' },
  { name: 'Entertainment', icon: 'star', color: 'oklch(0.72 0.14 300)' },
  { name: 'Travel', icon: 'globe', color: 'oklch(0.72 0.14 175)' },
  { name: 'Debt', icon: 'lock', color: 'oklch(0.72 0.14 5)' },
  { name: 'Other', icon: 'x', color: 'oklch(0.68 0.03 260)' },
]

/** The income side is short on purpose: income has sources, not categories. */
export const INCOME_SEEDS: readonly CategorySeed[] = [
  { name: 'Salary', icon: 'rupee', color: 'oklch(0.72 0.14 150)' },
  { name: 'Freelance', icon: 'bot', color: 'oklch(0.72 0.14 240)' },
  { name: 'Interest', icon: 'star', color: 'oklch(0.72 0.14 100)' },
  { name: 'Refund', icon: 'arrow-down', color: 'oklch(0.72 0.14 195)' },
  { name: 'Income', icon: 'arrow-down', color: 'oklch(0.68 0.03 260)' },
]

export function seedCategories(startId: number): TxnCategory[] {
  let id = startId
  return [
    ...CATEGORY_SEEDS.map((s) => ({ id: id++, ...s, kind: 'expense' as const })),
    ...INCOME_SEEDS.map((s) => ({ id: id++, ...s, kind: 'income' as const })),
  ]
}

/** Case-insensitive, so "food" and "Food" are the same bucket, not two. */
export function findCategory(categories: TxnCategory[], name: string): TxnCategory | undefined {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return undefined
  return categories.find((c) => c.name.toLowerCase() === wanted)
}

/** The picker's list: live categories for this direction, archived ones hidden. */
export function pickerCategories(
  categories: TxnCategory[],
  kind: 'expense' | 'income',
): TxnCategory[] {
  return categories.filter((c) => !c.archived && (c.kind === kind || c.kind === 'both'))
}

/**
 * The colour for a category name, falling back to a neutral rather than to a
 * random hue. An unknown name means a category that was archived or renamed
 * out from under a historic row — a grey bar says "no longer classified", where
 * a generated colour would say "this is a category" about something that is not.
 */
export const UNCLASSIFIED_COLOR = 'var(--text-muted, var(--theme-dim))'

export function categoryColor(categories: TxnCategory[], name: string): string {
  return findCategory(categories, name)?.color ?? UNCLASSIFIED_COLOR
}

export function categoryIcon(categories: TxnCategory[], name: string): IconName {
  return (findCategory(categories, name)?.icon as IconName) ?? 'x'
}
