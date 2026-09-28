<script setup lang="ts">
// The Appearance controls (Todo v2, 1a/1b): Dark / Light / Auto tabs on top,
// then what that tab holds. One component, two homes — the bottom pill's
// popover on a desktop and a bottom sheet on a phone — so the two can never
// disagree about what "Appearance" contains.
//
// The tabs only navigate. Dark lists the dark themes, Light the light ones,
// and Auto explains itself and offers to switch it on; nothing changes until a
// theme (or "Use Auto") is picked. Picking is the end of the errand, and
// `pick` tells the host so it can close. The tab that is actually in use
// carries a dot, so "which am I looking at" and "which am I using" never blur.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { THEME_DESCRIPTORS, type ThemeKey } from '@/themes'
import Icon from '@/components/ui/Icon.vue'

const emit = defineEmits<{ pick: [] }>()

const ui = useUiStore()
const { themeSetting, dark, preferredLight, preferredDark } = storeToRefs(ui)
const { c } = useStyles()

const autoActive = computed(() => themeSetting.value === 'auto')
function isThemeActive(key: ThemeKey) {
  return !autoActive.value && themeSetting.value === key
}
type Mode = 'dark' | 'light' | 'auto'
const mode = computed<Mode>(() => (autoActive.value ? 'auto' : dark.value ? 'dark' : 'light'))
const modes: { id: Mode; label: string; icon: 'moon' | 'sun' | 'clock' }[] = [
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'auto', label: 'Auto', icon: 'clock' },
]
// Opens on the tab in use, so the ringed swatch (or Auto) is what is in view.
const tab = ref<Mode>(mode.value)
function pickTheme(key: ThemeKey) {
  ui.setTheme(key)
  emit('pick')
}
function useAuto() {
  ui.setTheme('auto')
  emit('pick')
}

// Dark or Light: the ordinary themes of that mode first, then any Special or
// Standalone ones of the same mode under a small heading of their own.
type Descriptor = (typeof THEME_DESCRIPTORS)[number]
const shownGroups = computed(() => {
  const m = tab.value
  if (m === 'auto') return []
  const of = (pred: (t: Descriptor) => boolean) =>
    THEME_DESCRIPTORS.filter((t) => t.mode === m && pred(t))
  return [
    { label: '', items: of((t) => !t.special && !t.standalone) },
    { label: 'Special', items: of((t) => t.special) },
    { label: 'Standalone', items: of((t) => t.standalone) },
  ].filter((g) => g.items.length)
})
function countFor(m: Mode): number | null {
  return m === 'auto' ? null : THEME_DESCRIPTORS.filter((t) => t.mode === m).length
}
// What Auto switches between: the last light and dark theme picked.
const autoPair = computed(() => {
  const find = (key: ThemeKey) => THEME_DESCRIPTORS.find((t) => t.id === key)
  const light = find(preferredLight.value)
  const night = find(preferredDark.value)
  return [
    { when: 'Day', icon: 'sun' as const, theme: light, name: light?.name ?? preferredLight.value },
    {
      when: 'Night',
      icon: 'moon' as const,
      theme: night,
      name: night?.name ?? preferredDark.value,
    },
  ]
})

// --- styles -------------------------------------------------------------------
const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' })
const groupLabel = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim }))
const segment = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 4,
    padding: 4,
    borderRadius: 'var(--radius-card)',
    background: 'color-mix(in srgb, ' + c.value.text + ' 6%, transparent)',
  }),
)
const swatchGrid = pxify({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 })
function swatchRow(preview: readonly [string, string, string]) {
  return pxify({
    display: 'flex',
    height: 22,
    borderRadius: 'var(--radius-control)',
    overflow: 'hidden',
    border: '1px solid ' + c.value.border,
    background: preview[0],
  })
}
const swatchName = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-medium)',
    color: c.value.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
)
// The Auto swatch is a wheel of every theme, not a status colour.
const autoWheel = pxify({
  width: 18,
  height: 18,
  borderRadius: '50%',
  flexShrink: 0,
  background:
    'conic-gradient(from 0deg, oklch(0.85 0.15 85), oklch(0.74 0.13 250), oklch(0.78 0.15 340), oklch(0.83 0.13 88), oklch(0.85 0.15 85))',
})
</script>

<template>
  <div :style="wrap" class="appearance">
    <div :style="segment" role="tablist" aria-label="Appearance">
      <button
        v-for="m in modes"
        :id="'appearance-tab-' + m.id"
        :key="m.id"
        type="button"
        class="seg-btn"
        :class="{ 'is-on': tab === m.id }"
        role="tab"
        :aria-selected="tab === m.id"
        aria-controls="appearance-tabpanel"
        @click="tab = m.id"
      >
        <span v-if="m.id === 'auto'" :style="autoWheel"></span>
        <Icon v-else :name="m.icon" size="xs" />
        {{ m.label }}
        <span v-if="countFor(m.id) != null" class="seg-count">{{ countFor(m.id) }}</span>
        <span v-if="mode === m.id" class="seg-live" title="In use"></span>
      </button>
    </div>

    <div
      id="appearance-tabpanel"
      class="tabpanel"
      role="tabpanel"
      :aria-labelledby="'appearance-tab-' + tab"
    >
      <!-- Auto: what it does, what it switches between, and the switch. -->
      <template v-if="tab === 'auto'">
        <p class="auto-copy">
          Follows the time of day: your light theme by day, your dark theme at night.
        </p>
        <div class="auto-pair">
          <div v-for="p in autoPair" :key="p.when" class="auto-slot">
            <span class="auto-when"><Icon :name="p.icon" size="xs" />{{ p.when }}</span>
            <span v-if="p.theme" :style="swatchRow(p.theme.preview)">
              <span style="flex: 1" />
              <span :style="{ flex: 1, background: p.theme.preview[1] }" />
              <span :style="{ flex: 1, background: p.theme.preview[2] }" />
            </span>
            <span :style="swatchName">{{ p.name }}</span>
          </div>
        </div>
        <p class="auto-hint">Pick in the Light and Dark tabs to change these.</p>
        <button type="button" class="auto-use" :disabled="autoActive" @click="useAuto">
          {{ autoActive ? 'Auto is on' : 'Use Auto' }}
        </button>
      </template>

      <!-- Dark or Light: that mode's themes. -->
      <template v-else>
        <template v-for="g in shownGroups" :key="g.label">
          <span v-if="g.label" :style="groupLabel">{{ g.label }}</span>
          <div :style="swatchGrid">
            <button
              v-for="t in g.items"
              :key="t.id"
              type="button"
              class="swatch"
              :class="{ 'is-on': isThemeActive(t.id) }"
              :aria-pressed="isThemeActive(t.id)"
              @click="pickTheme(t.id)"
            >
              <span :style="swatchRow(t.preview)">
                <span style="flex: 1" />
                <span :style="{ flex: 1, background: t.preview[1] }" />
                <span :style="{ flex: 1, background: t.preview[2] }" />
              </span>
              <span :style="swatchName">{{ t.name }}</span>
            </button>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Hover and the on state are CSS, not v-hover-style: that directive restores
   the style it snapshotted on enter, which is wrong for a toggle clicked while
   the pointer is still on it. */
.seg-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0;
  border-radius: var(--radius-control);
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
}
.seg-btn {
  position: relative;
  color: var(--theme-dim);
  transition:
    background var(--dur-fast, 120ms) ease,
    color var(--dur-fast, 120ms) ease;
}
.seg-btn:hover:not(.is-on) {
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
}
/* The tab being looked at: a raised card, full-strength text and an accent
   underline, so it is unmistakably the one the list below belongs to. */
.seg-btn.is-on {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
  background: var(--glass-solid, var(--theme-card));
  border-color: color-mix(in srgb, var(--theme-text) 18%, transparent);
  box-shadow: inset 0 -2px 0 var(--theme-accent);
}
/* The mode actually in use, whichever tab is open. */
.seg-live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-accent);
  flex-shrink: 0;
}
/* The list reads as the open tab's page, not as more of the panel. */
.tabpanel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-card);
  border: 1px solid color-mix(in srgb, var(--theme-text) 10%, transparent);
}
.auto-copy,
.auto-hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
}
.auto-hint {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.auto-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.auto-slot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
}
.auto-when {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.auto-use {
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.auto-use:disabled {
  background: transparent;
  color: var(--theme-accent);
  cursor: default;
}
/* The count inside a mode button: how many themes that tab lists. */
.seg-count {
  font-size: var(--text-xs);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
.swatch {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 6px;
  border-radius: var(--radius-card);
  border: 1.5px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.swatch:hover {
  background: var(--theme-card);
}
.swatch.is-on {
  border-color: var(--theme-accent);
}
</style>
