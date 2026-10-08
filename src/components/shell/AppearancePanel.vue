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
//
// THE TILES are the theme itself, in miniature: its own page, a card in its
// own glass, two lines of its text and a dot of its accent. Three flat stripes
// said what colours a theme had; this says what it looks like to work in.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { THEMES, THEME_DESCRIPTORS, type ThemeKey } from '@/themes'
import Icon from '@/components/ui/Icon.vue'

const emit = defineEmits<{ pick: [] }>()

const ui = useUiStore()
const { themeSetting, dark, preferredLight, preferredDark } = storeToRefs(ui)

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
// Opens on the tab in use, so the ringed tile (or Auto) is what is in view.
const tab = ref<Mode>(mode.value)
function pickTheme(key: ThemeKey) {
  ui.setTheme(key)
  emit('pick')
}
function useAuto() {
  ui.setTheme('auto')
  emit('pick')
}

// Dark or Light: the ordinary themes of that mode first, then the coffee
// family, then any Special or Standalone ones, each under a heading.
type Descriptor = (typeof THEME_DESCRIPTORS)[number]
type GroupIcon = 'palette' | 'coffee' | null
const shownGroups = computed(() => {
  const m = tab.value
  if (m === 'auto') return []
  const of = (pred: (t: Descriptor) => boolean) =>
    THEME_DESCRIPTORS.filter((t) => t.mode === m && pred(t))
  const groups: { label: string; icon: GroupIcon; items: Descriptor[] }[] = [
    {
      label: 'Themes',
      icon: 'palette',
      items: of((t) => !t.special && !t.standalone && !t.coffee),
    },
    { label: 'Coffee', icon: 'coffee', items: of((t) => t.coffee) },
    { label: 'Special', icon: null, items: of((t) => t.special) },
    { label: 'Standalone', icon: null, items: of((t) => t.standalone) },
  ]
  return groups.filter((g) => g.items.length)
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

// The miniature's colours, straight from the theme's tokens. Custom
// properties rather than a style object per part, so the parts are styled
// once in the stylesheet and only the palette changes per tile.
function sceneVars(id: ThemeKey) {
  const t = THEMES[id]
  return {
    '--m-page': t.pageBg,
    '--m-card': t.card,
    '--m-border': t.border,
    '--m-text': t.text,
    '--m-dim': t.dim,
    '--m-accent': t.accent,
    '--m-on-accent': t.onAccent,
  }
}
</script>

<template>
  <div class="appearance">
    <div class="seg" role="tablist" aria-label="Appearance">
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
        <span v-if="m.id === 'auto'" class="auto-wheel" aria-hidden="true"></span>
        <Icon v-else :name="m.icon" size="xs" />
        <span>{{ m.label }}</span>
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
          Follows the time of day — your light theme by day, your dark theme at night.
        </p>
        <div class="auto-pair">
          <div v-for="p in autoPair" :key="p.when" class="auto-slot">
            <span class="auto-when"><Icon :name="p.icon" size="xs" />{{ p.when }}</span>
            <span v-if="p.theme" class="scene" :style="sceneVars(p.theme.id)" aria-hidden="true">
              <span class="scene__card">
                <span class="scene__line" />
                <span class="scene__line scene__line--dim" />
                <span class="scene__pill" />
              </span>
            </span>
            <span class="tile__name">{{ p.name }}</span>
          </div>
        </div>
        <p class="auto-hint">Pick a theme in the Light and Dark tabs to change these.</p>
        <button type="button" class="auto-use" :disabled="autoActive" @click="useAuto">
          <Icon :name="autoActive ? 'check' : 'clock'" size="xs" />
          {{ autoActive ? 'Auto is on' : 'Use Auto' }}
        </button>
      </template>

      <!-- Dark or Light: that mode's themes, as live miniatures. -->
      <template v-else>
        <section v-for="g in shownGroups" :key="g.label" class="group">
          <h3 class="group__head">
            <Icon v-if="g.icon" :name="g.icon" size="xs" />
            <span>{{ g.label }}</span>
            <span class="group__count">{{ g.items.length }}</span>
          </h3>
          <div class="grid">
            <button
              v-for="t in g.items"
              :key="t.id"
              type="button"
              class="tile"
              :class="{ 'is-on': isThemeActive(t.id) }"
              :aria-pressed="isThemeActive(t.id)"
              :title="t.name"
              @click="pickTheme(t.id)"
            >
              <span class="scene" :style="sceneVars(t.id)" aria-hidden="true">
                <span class="scene__card">
                  <span class="scene__line" />
                  <span class="scene__line scene__line--dim" />
                  <span class="scene__pill" />
                </span>
                <span v-if="isThemeActive(t.id)" class="scene__check">
                  <Icon name="check" size="xs" />
                </span>
              </span>
              <span class="tile__name">{{ t.name }}</span>
            </button>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.appearance {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

/* ---- the mode switch ----------------------------------------------------- */
.seg {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
}
/* Hover and the on state are CSS, not v-hover-style: that directive restores
   the style it snapshotted on enter, which is wrong for a toggle clicked while
   the pointer is still on it. */
.seg-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 6px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--dur-fast, 120ms) ease,
    color var(--dur-fast, 120ms) ease,
    box-shadow var(--dur-fast, 120ms) ease;
}
.seg-btn:hover:not(.is-on) {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
}
/* The tab being looked at: a raised chip on the track. */
.seg-btn.is-on {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
  background: var(--glass-solid, var(--theme-card));
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shadow-ink, #000) 10%, transparent),
    0 4px 12px -6px color-mix(in srgb, var(--shadow-ink, #000) 30%, transparent);
}
.seg-btn:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.seg-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}
.seg-btn.is-on .seg-count {
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  color: var(--theme-text);
}
/* The mode actually in use, whichever tab is open: a dot on the corner. */
.seg-live {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--theme-accent) 25%, transparent);
}
/* The Auto mark is a wheel of every theme, not a status colour. */
.auto-wheel {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    oklch(0.85 0.15 85),
    oklch(0.74 0.13 250),
    oklch(0.78 0.15 340),
    oklch(0.83 0.13 88),
    oklch(0.85 0.15 85)
  );
}

/* ---- the page under the tabs --------------------------------------------- */
.tabpanel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.group__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.group__count {
  margin-left: auto;
  font-weight: var(--weight-medium);
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

/* ---- a tile: the miniature and its name ---------------------------------- */
.tile {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 5px 5px 8px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--dur-fast, 120ms) ease,
    transform 0.25s var(--spring, ease);
}
.tile:hover {
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.tile:hover .scene {
  transform: translateY(-1px);
  box-shadow:
    0 0 0 1px color-mix(in oklch, var(--theme-text) 14%, transparent),
    0 10px 20px -12px color-mix(in srgb, var(--shadow-ink, #000) 45%, transparent);
}
.tile:active {
  transform: scale(0.97);
}
.tile:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.tile.is-on {
  background: color-mix(in oklch, var(--theme-accent) 10%, transparent);
}
/* The picked one: the ring is the accent of the theme in use, round the
   miniature of the theme picked — which, when it is in use, are the same. */
.tile.is-on .scene {
  box-shadow:
    0 0 0 2px var(--theme-accent),
    0 10px 20px -12px color-mix(in srgb, var(--shadow-ink, #000) 45%, transparent);
}
.tile__name {
  min-width: 0;
  padding: 0 3px;
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tile.is-on .tile__name {
  color: var(--theme-text);
}

/* The miniature. Every colour is the theme's own, through --m-*. */
.scene {
  position: relative;
  display: flex;
  align-items: flex-end;
  height: 66px;
  padding: 10px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--m-page);
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--theme-text) 10%, transparent);
  transition:
    transform 0.25s var(--spring, ease),
    box-shadow var(--dur-fast, 120ms) ease;
}
.scene__card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 78%;
  padding: 8px 9px;
  border-radius: 8px;
  border: 1px solid var(--m-border);
  background: var(--m-card);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.scene__line {
  height: 4px;
  width: 80%;
  border-radius: 2px;
  background: var(--m-text);
}
.scene__line--dim {
  width: 55%;
  background: var(--m-dim);
}
.scene__pill {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 8px;
  border-radius: 4px;
  background: var(--m-accent);
}
.scene__check {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--m-accent);
  color: var(--m-on-accent);
  box-shadow: 0 2px 6px rgb(0 0 0 / 25%);
}

/* ---- Auto ------------------------------------------------------------------ */
.auto-copy {
  margin: 0;
  color: var(--theme-text);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.auto-hint {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.auto-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.auto-slot {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 8px;
  border-radius: 16px;
  background: color-mix(in oklch, var(--theme-text) 5%, transparent);
}
.auto-when {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.auto-use {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  border: 0;
  border-radius: 12px;
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition:
    filter var(--dur-fast, 120ms) ease,
    transform 0.2s var(--spring, ease);
}
.auto-use:hover:not(:disabled) {
  filter: brightness(1.06);
}
.auto-use:active:not(:disabled) {
  transform: scale(0.97);
}
.auto-use:disabled {
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-text);
  cursor: default;
}
.auto-use:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .seg-btn,
  .tile,
  .scene,
  .auto-use {
    transition: none;
  }
  .tile:hover .scene,
  .tile:active,
  .auto-use:active:not(:disabled) {
    transform: none;
  }
}
</style>
