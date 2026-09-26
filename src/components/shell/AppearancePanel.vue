<script setup lang="ts">
// The Appearance controls (Todo v2, 1a/1b): a Dark / Light / Auto segment on
// top, then the theme grid. One component, two homes — the bottom pill's
// popover on a desktop and a bottom sheet on a phone — so the two can never
// disagree about what "Appearance" contains.
//
// Picking a MODE keeps the panel open, because the theme choice usually
// follows; picking a THEME is the end of the errand, and `pick` tells the host
// so it can close.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { THEME_DESCRIPTORS, type ThemeKey } from '@/themes'
import Icon from '@/components/ui/Icon.vue'

const emit = defineEmits<{ pick: [] }>()

const ui = useUiStore()
const { themePanelOpen, themeSetting, dark, preferredLight, preferredDark } = storeToRefs(ui)
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
// setTheme closes the desktop popover; a mode change puts it back, since the
// theme choice that usually follows still needs it.
function setMode(m: Mode) {
  ui.setTheme(m === 'auto' ? 'auto' : m === 'dark' ? preferredDark.value : preferredLight.value)
  themePanelOpen.value = true
}
function pickTheme(key: ThemeKey) {
  ui.setTheme(key)
  emit('pick')
}
const groups = computed(() =>
  [
    {
      label: 'Dark',
      items: THEME_DESCRIPTORS.filter((t) => t.mode === 'dark' && !t.special && !t.standalone),
    },
    {
      label: 'Light',
      items: THEME_DESCRIPTORS.filter((t) => t.mode === 'light' && !t.special && !t.standalone),
    },
    { label: 'Special', items: THEME_DESCRIPTORS.filter((t) => t.special) },
    { label: 'Standalone', items: THEME_DESCRIPTORS.filter((t) => t.standalone) },
  ].filter((g) => g.items.length),
)

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
    <div :style="segment" role="radiogroup" aria-label="Mode">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        class="seg-btn"
        :class="{ 'is-on': mode === m.id }"
        role="radio"
        :aria-checked="mode === m.id"
        @click="setMode(m.id)"
      >
        <span v-if="m.id === 'auto'" :style="autoWheel"></span>
        <Icon v-else :name="m.icon" size="xs" />
        {{ m.label }}
      </button>
    </div>
    <template v-for="g in groups" :key="g.label">
      <span :style="groupLabel">{{ g.label }}</span>
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
.seg-btn.is-on {
  background: color-mix(in srgb, var(--theme-text) 12%, transparent);
  border-color: color-mix(in srgb, var(--theme-text) 22%, transparent);
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
