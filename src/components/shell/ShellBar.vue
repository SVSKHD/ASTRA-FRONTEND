<script setup lang="ts">
// The bottom utility bar (section 44, items 4–5; Todo v2, 1b).
//
// ONE CENTRED, LABELLED PILL. The bar used to be eight icon buttons in two
// groups, and two of them were suns that did different things — the left one
// opened the account menu, which the avatar also opened — while three separate
// buttons changed the theme and GitHub wore a share icon. It is now four
// labelled controls and the sync status:
//
//   Notes · Appearance · Account · GitHub  |  ● Synced
//
// Mode (dark / light / auto), the espresso roast and the theme grid all live in
// the Appearance popover, and only one panel is open at a time. Under 900px the
// labels drop and it is icons only.
//
// A ROW, NOT AN ISLAND, still. The pill is centred INSIDE the bar's grid region
// rather than floating over the page, so the content area above keeps stopping
// where the bar starts and the last row of a table stays clear (appShell.ts).
//
// Popovers open upward, absolutely positioned against their own button's
// wrapper. An overlay that opens on demand and closes on Escape is not
// persistent chrome and does not need a region.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useLockStore } from '@/stores/lock'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { barGeometry } from '@/views/appShell'
import { THEME_DESCRIPTORS, type ThemeKey } from '@/themes'
import Icon from '@/components/ui/Icon.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import ShellSync from '@/components/shell/ShellSync.vue'

const ui = useUiStore()
const auth = useAuthStore()
const app = useAppStore()
const lock = useLockStore()
const { c, B } = useStyles()
const { themePanelOpen, themeSetting, isPhone, dark, preferredLight, preferredDark, drawerOpen } =
  storeToRefs(ui)
const { avatarMenuOpen, avatarInitial, avatarName, avatarSub, avatarColor, ghMenuLabel } =
  storeToRefs(auth)
const { security, autoRollover, hideCompleted, reminderSound } = storeToRefs(app)

const bar = computed(() =>
  pxify({ ...barGeometry({ isPhone: isPhone.value }), justifyContent: 'center' }),
)

function open(name: 'notes' | 'appearance' | 'account') {
  ui.openShellPanel(name, avatarMenuOpen)
}

// --- appearance ---------------------------------------------------------------
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
// Picking a mode is not picking a theme, so the popover stays open for the
// theme choice that usually follows. setTheme closes it; this puts it back.
function setMode(m: Mode) {
  ui.setTheme(m === 'auto' ? 'auto' : m === 'dark' ? preferredDark.value : preferredLight.value)
  themePanelOpen.value = true
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

// --- account ------------------------------------------------------------------
function onAutoLockChange(on: boolean) {
  lock.setAutoLock(on)
}
function onLockNow() {
  auth.avatarMenuOpen = false
  lock.lockNow()
}
function openGithub() {
  ui.openShellPanel(null, avatarMenuOpen)
  auth.openGithubPanel()
}

// --- styles -------------------------------------------------------------------
// The glass is painted by `.shell-pill::before` in the stylesheet, not here: an
// element with a backdrop-filter becomes the backdrop root for everything inside
// it, so the popovers — which are inside it — would blur the pill's own empty
// box instead of the page and render see-through.
//
// The pill is a stacking context (so `::before` can sit under its buttons), and
// its popovers are trapped inside it — so the pill itself carries the popover
// layer, above whatever the page stacks in the content region.
const pill = computed(() =>
  pxify({
    position: 'relative',
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
    maxWidth: '100%',
    padding: 5,
    borderRadius: 'var(--radius-pill)',
    '--pill-glass': c.value.glass,
    border: B.value,
    boxShadow: 'inset 0 1px 0 color-mix(in srgb, white 7%, transparent)',
  }),
)
const wrapRel = pxify({ position: 'relative', display: 'inline-flex' })
const divider = computed(() =>
  pxify({ width: 1, height: 22, background: c.value.border, margin: '0 6px', flexShrink: 0 }),
)
const avatarDisc = computed(() =>
  pxify({
    width: 20,
    height: 20,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    ...typeStep('2xs'),
    color: 'var(--theme-on-accent)',
    background: avatarColor.value,
    flexShrink: 0,
  }),
)
function popover(width: number) {
  return pxify({
    position: 'absolute',
    bottom: 'calc(100% + 14px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width,
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'min(70vh, 560px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: B.value,
    borderRadius: 'var(--radius-dialog)',
    padding: 12,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    zIndex: 30,
  })
}
const accountPopover = computed(() => ({ ...popover(240), gap: '2px', padding: '10px' }))
const appearancePopover = computed(() => popover(300))
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
const autoWheel = pxify({
  width: 18,
  height: 18,
  borderRadius: '50%',
  flexShrink: 0,
  background:
    'conic-gradient(from 0deg, oklch(0.85 0.15 85), oklch(0.74 0.13 250), oklch(0.78 0.15 340), oklch(0.83 0.13 88), oklch(0.85 0.15 85))',
})
const menuItem = computed(() =>
  pxify({
    padding: '9px 10px',
    borderRadius: 'var(--radius-card)',
    ...typeStep('xs'),
    color: c.value.text,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
  }),
)
const menuHover = computed(() => pxify({ background: c.value.card }))
const menuToggle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '9px 10px',
    ...typeStep('xs'),
    color: c.value.dim,
  }),
)
const nameStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    whiteSpace: 'nowrap',
  }),
)
const subStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
</script>

<template>
  <footer :style="bar" class="shell-bar">
    <div :style="pill" class="shell-pill">
      <button
        type="button"
        class="pill-btn"
        :class="{ 'is-on': drawerOpen }"
        aria-label="Notes"
        :aria-expanded="drawerOpen"
        @click="open('notes')"
      >
        <Icon name="notebook" size="sm" class="pill-icon" />
        <span class="pill-label">Notes</span>
      </button>

      <div :style="wrapRel">
        <button
          type="button"
          class="pill-btn"
          :class="{ 'is-on': themePanelOpen }"
          aria-label="Appearance"
          :aria-expanded="themePanelOpen"
          @click="open('appearance')"
        >
          <Icon name="palette" size="sm" class="pill-icon" />
          <span class="pill-label">Appearance</span>
        </button>
        <div v-if="themePanelOpen" :style="appearancePopover" role="menu">
          <span :style="groupLabel">Appearance</span>
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
                @click="ui.setTheme(t.id)"
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
      </div>

      <div :style="wrapRel">
        <button
          type="button"
          class="pill-btn"
          :class="{ 'is-on': avatarMenuOpen }"
          aria-label="Account"
          :aria-expanded="avatarMenuOpen"
          @click="open('account')"
        >
          <span :style="avatarDisc">{{ avatarInitial }}</span>
          <span class="pill-label">Account</span>
        </button>
        <div v-if="avatarMenuOpen" :style="accountPopover">
          <div style="padding: 6px 8px">
            <div :style="nameStyle">{{ avatarName }}</div>
            <div :style="subStyle">{{ avatarSub }}</div>
          </div>
          <label :style="menuToggle">
            <Checkbox
              :model-value="security.autoLockEnabled"
              @update:model-value="onAutoLockChange"
            />
            <span>Auto-lock after 50 min</span>
          </label>
          <label :style="menuToggle">
            <Checkbox
              :model-value="autoRollover"
              @update:model-value="app.setAutoRollover($event)"
            />
            <span>Auto-roll overdue to today</span>
          </label>
          <label :style="menuToggle">
            <Checkbox
              :model-value="hideCompleted"
              @update:model-value="app.setHideCompleted($event)"
            />
            <span>Hide completed items</span>
          </label>
          <label :style="menuToggle">
            <Checkbox
              :model-value="reminderSound"
              @update:model-value="app.setReminderSound($event)"
            />
            <span>Reminder sound</span>
          </label>
          <button :style="menuItem" v-hover-style="menuHover" @click="onLockNow">Lock now</button>
          <button :style="menuItem" v-hover-style="menuHover" @click="auth.openSecurityPanel()">
            Security &amp; devices
          </button>
          <button :style="menuItem" v-hover-style="menuHover" @click="openGithub">
            {{ ghMenuLabel }}
          </button>
          <button :style="menuItem" v-hover-style="menuHover" @click="auth.signOut()">
            Sign out
          </button>
        </div>
      </div>

      <button type="button" class="pill-btn" aria-label="GitHub" @click="openGithub">
        <Icon name="github" size="sm" class="pill-icon" />
        <span class="pill-label">GitHub</span>
      </button>

      <span :style="divider"></span>
      <ShellSync inline />
    </div>
  </footer>
</template>

<style scoped>
/*
 * Hover and the open state are CSS, not v-hover-style: that directive snapshots
 * the style attribute on enter and restores it on leave, which is wrong for a
 * toggle clicked while the pointer is on it.
 */
.shell-pill::before {
  /* hide the bottom border */
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--pill-glass);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
}
.pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}
.pill-icon {
  color: var(--theme-accent);
}
.pill-btn:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--theme-text);
}
.pill-btn.is-on {
  background: color-mix(in srgb, var(--theme-text) 12%, transparent);
  border-color: color-mix(in srgb, var(--theme-text) 20%, transparent);
  color: var(--theme-text);
}
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
@media (max-width: 900px) {
  .pill-label {
    display: none;
  }
  .pill-btn {
    padding: 8px 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pill-btn {
    transition: none;
  }
}
</style>
