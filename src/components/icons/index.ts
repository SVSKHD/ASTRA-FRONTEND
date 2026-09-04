// The trade family (section 28b).
//
// A second, deliberately separate set from `components/ui/icons.ts`. That one is
// the interface's: Lucide geometry at 2.25 stroke, drawn once into a sprite and
// referenced by name. This one is the trade logger's, at 1.5, one component per
// glyph, because the audit that started this pass found the same glyph carrying
// several meanings — `x` was a danger alert, the "Other" category, a remove and
// an unschedule; `check` was a selection, a completion and a sync state — and
// the fix for that is a glyph per concept, not another name in a shared map.
//
// The rule the set is held to: ONE MEANING PER GLYPH. Nothing here is reused for
// a second concept, and nothing here duplicates a meaning the sprite already
// carries (Export points out of the tray where the sprite's Download points in;
// Secured is a vault where the sprite's Lock is the lock screen's).
//
// Every file carries an identical frame — 24x24, `currentColor`, stroke 1.5,
// round caps and joins, no fill, no colour — so a call site can only choose a
// size. `family.test.ts` reads the directory and fails the build if one drifts.

export { default as IconBuy } from './IconBuy.vue'
export { default as IconSell } from './IconSell.vue'
export { default as IconSecured } from './IconSecured.vue'
export { default as IconBalance } from './IconBalance.vue'
export { default as IconProfit } from './IconProfit.vue'
export { default as IconSessionAsia } from './IconSessionAsia.vue'
export { default as IconSessionLondon } from './IconSessionLondon.vue'
export { default as IconSessionNy } from './IconSessionNy.vue'
export { default as IconTargetHit } from './IconTargetHit.vue'
export { default as IconTargetMissed } from './IconTargetMissed.vue'
export { default as IconExport } from './IconExport.vue'
export { default as IconDelete } from './IconDelete.vue'
export { default as IconFilter } from './IconFilter.vue'
export { default as IconSymbol } from './IconSymbol.vue'
