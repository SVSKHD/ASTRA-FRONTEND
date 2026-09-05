<script setup lang="ts">
// The bottom utility bar (section 44, items 4–5).
//
// Everything that used to float over the bottom of the viewport now lives here,
// in one row: the notes and settings orbs that were fixed bottom-left, the sync
// indicator that was fixed bottom-left on top of them, and the theme / espresso
// / appearance / account / GitHub cluster that was fixed bottom-right on top of
// the trades table's last rows.
//
// A ROW, NOT AN ISLAND. The cluster was a floating capsule with its own shadow
// and its own coordinates; docked, it is four buttons at the end of a flex row.
// The bar is a grid region, so the content area above it stops where the bar
// starts and there is nothing left for it to cover. The `padding-bottom` the
// content area carries (equal to this bar's height) is the second half of the
// same promise: the last row of a table is not merely uncovered, it is clear.
//
// The popovers still open upward, and they are still absolutely positioned —
// against their own button's wrapper, which is what `position: relative` on the
// wrapper is for. An overlay that opens on demand and closes on Escape is not
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
const { themePanelOpen, themeSetting, isPhone, dark, preferredLight } = storeToRefs(ui)
const { avatarMenuOpen, avatarInitial, avatarName, avatarSub, avatarColor, ghMenuLabel } =
  storeToRefs(auth)
const { security, autoRollover, hideCompleted, reminderSound } = storeToRefs(app)

const bar = computed(() => pxify(barGeometry({ isPhone: isPhone.value })))

const autoActive = computed(() => themeSetting.value === 'auto')
function isThemeActive(key: ThemeKey) {
  return !autoActive.value && themeSetting.value === key
}
const darkThemes = computed(() =>
  THEME_DESCRIPTORS.filter((t) => t.mode === 'dark' && !t.special && !t.standalone),
)
const lightThemes = computed(() =>
  THEME_DESCRIPTORS.filter((t) => t.mode === 'light' && !t.special && !t.standalone),
)
const specialThemes = computed(() => THEME_DESCRIPTORS.filter((t) => t.special))
const standaloneThemes = computed(() => THEME_DESCRIPTORS.filter((t) => t.standalone))

const espressoOn = computed(() => themeSetting.value === 'espresso')
function toggleEspresso() {
  ui.setTheme(espressoOn.value ? preferredLight.value : 'espresso')
}
function onAutoLockChange(on: boolean) {
  lock.setAutoLock(on)
}
function onLockNow() {
  auth.avatarMenuOpen = false
  lock.lockNow()
}

// --- styles -----------------------------------------------------------------
// Bar buttons, not orbs. A 44px floating disc made sense when it hovered over a
// starfield; in a 52px row it is the row. These are 32px and square-ish, which
// is what a utility bar's controls look like.
const btn = computed(() =>
  pxify({
    position: 'relative',
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 'var(--radius-control)',
    display: 'grid',
    placeItems: 'center',
    background: 'transparent',
    border: '1px solid transparent',
    cursor: 'pointer',
    color: c.value.accent,
    transition: 'background .18s ease, border-color .18s ease',
  }),
)
const btnHover = computed(() => pxify({ background: c.value.card, borderColor: c.value.border }))
const wrapRel = pxify({ position: 'relative', display: 'inline-flex' })
/** The slack between the left group and the right cluster. */
const spacer = pxify({ flex: '1 1 auto', minWidth: 0 })

const avatarDisc = computed(() =>
  pxify({
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--theme-on-accent)',
    background: avatarColor.value,
  }),
)

const popover = computed(() =>
  pxify({
    position: 'absolute',
    bottom: 'calc(100% + 10px)',
    right: 0,
    width: 224,
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: B.value,
    borderRadius: 'var(--radius-dialog)',
    padding: 10,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    zIndex: 30,
  }),
)
const themePopover = computed(() =>
  pxify({
    position: 'absolute',
    bottom: 'calc(100% + 10px)',
    right: 0,
    width: 268,
    maxHeight: 'min(70vh, 520px)',
    overflowY: 'auto',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: B.value,
    borderRadius: 'var(--radius-dialog)',
    padding: 10,
    boxShadow: c.value.shadow,
    zIndex: 30,
  }),
)
function themeRow(active: boolean) {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: '7px 8px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + (active ? c.value.border : 'transparent'),
    background: active ? c.value.card : 'transparent',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  })
}
function swatch(bg: string, active: boolean) {
  return pxify({
    width: 18,
    height: 18,
    borderRadius: '50%',
    flexShrink: 0,
    background: bg,
    border: '2px solid ' + (active ? c.value.accent : 'transparent'),
  })
}
const groupLabel = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
    padding: '6px 8px 2px',
  }),
)
const pickerGrid = pxify({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--sp-2)',
  padding: '2px 2px 4px',
})
function themeCard(active: boolean) {
  return pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    padding: 8,
    borderRadius: 'var(--radius-card)',
    border: '2px solid ' + (active ? c.value.accent : 'transparent'),
    background: active ? c.value.card : 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  })
}
function cardSwatchRow(preview: readonly [string, string, string]) {
  return pxify({
    display: 'flex',
    height: 22,
    borderRadius: 'var(--radius-control)',
    overflow: 'hidden',
    border: '1px solid ' + c.value.border,
    background: preview[0],
  })
}
const cardName = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    lineHeight: 1.1,
  }),
)
const rowText = computed(() => pxify({ ...typeStep('xs'), color: c.value.text }))
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
    <!-- Left: the two utilities, then the sync status. -->
    <button :style="btn" v-hover-style="btnHover" aria-label="Notes" @click="ui.toggleDrawer()">
      <Icon name="notebook" size="sm" :style="{ color: c.accent }" />
    </button>
    <button
      :style="btn"
      v-hover-style="btnHover"
      aria-label="Settings"
      @click="auth.toggleAvatarMenu()"
    >
      <Icon name="sun" size="sm" :style="{ color: c.accent }" />
    </button>

    <ShellSync />

    <span :style="spacer"></span>

    <!-- Right: the action cluster, docked as a row rather than floating. -->
    <button
      :style="btn"
      v-hover-style="btnHover"
      :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="ui.toggleThemeMode()"
    >
      <Icon v-if="dark" name="sun" size="sm" :style="{ color: c.accent }" />
      <Icon v-else name="moon" size="sm" :style="{ color: c.accent }" />
    </button>

    <button
      :style="btn"
      v-hover-style="btnHover"
      :aria-pressed="espressoOn"
      :aria-label="espressoOn ? 'Leave the espresso theme' : 'Switch to the espresso theme'"
      @click="toggleEspresso()"
    >
      <Icon name="coffee" size="sm" :style="{ color: c.accent }" />
    </button>

    <div :style="wrapRel">
      <button
        :style="btn"
        v-hover-style="btnHover"
        aria-label="Appearance"
        :aria-expanded="themePanelOpen"
        @click="ui.toggleThemePanel()"
      >
        <Icon name="palette" size="sm" :style="{ color: c.accent }" />
      </button>
      <div v-if="themePanelOpen" :style="themePopover" role="menu">
        <button :style="themeRow(autoActive)" @click="ui.setTheme('auto')">
          <span
            :style="
              swatch(
                'conic-gradient(from 0deg, oklch(0.85 0.15 85), oklch(0.74 0.13 250), oklch(0.78 0.15 340), oklch(0.83 0.13 88), oklch(0.85 0.15 85))',
                autoActive,
              )
            "
          ></span>
          <span :style="rowText">Auto (follows time)</span>
        </button>
        <span :style="groupLabel">Dark</span>
        <div :style="pickerGrid">
          <button
            v-for="t in darkThemes"
            :key="t.id"
            :style="themeCard(isThemeActive(t.id))"
            :aria-pressed="isThemeActive(t.id)"
            @click="ui.setTheme(t.id)"
          >
            <span :style="cardSwatchRow(t.preview)">
              <span style="flex: 1" />
              <span :style="{ flex: 1, background: t.preview[1] }" />
              <span :style="{ flex: 1, background: t.preview[2] }" />
            </span>
            <span :style="cardName">{{ t.name }}</span>
          </button>
        </div>
        <span :style="groupLabel">Light</span>
        <div :style="pickerGrid">
          <button
            v-for="t in lightThemes"
            :key="t.id"
            :style="themeCard(isThemeActive(t.id))"
            :aria-pressed="isThemeActive(t.id)"
            @click="ui.setTheme(t.id)"
          >
            <span :style="cardSwatchRow(t.preview)">
              <span style="flex: 1" />
              <span :style="{ flex: 1, background: t.preview[1] }" />
              <span :style="{ flex: 1, background: t.preview[2] }" />
            </span>
            <span :style="cardName">{{ t.name }}</span>
          </button>
        </div>
        <template v-if="specialThemes.length">
          <span :style="groupLabel">Special</span>
          <div :style="pickerGrid">
            <button
              v-for="t in specialThemes"
              :key="t.id"
              :style="themeCard(isThemeActive(t.id))"
              :aria-pressed="isThemeActive(t.id)"
              @click="ui.setTheme(t.id)"
            >
              <span :style="cardSwatchRow(t.preview)">
                <span style="flex: 1" />
                <span :style="{ flex: 1, background: t.preview[1] }" />
                <span :style="{ flex: 1, background: t.preview[2] }" />
              </span>
              <span :style="cardName">{{ t.name }}</span>
            </button>
          </div>
        </template>
        <template v-if="standaloneThemes.length">
          <span :style="groupLabel">Standalone</span>
          <div :style="pickerGrid">
            <button
              v-for="t in standaloneThemes"
              :key="t.id"
              :style="themeCard(isThemeActive(t.id))"
              :aria-pressed="isThemeActive(t.id)"
              @click="ui.setTheme(t.id)"
            >
              <span :style="cardSwatchRow(t.preview)">
                <span style="flex: 1" />
                <span :style="{ flex: 1, background: t.preview[1] }" />
                <span :style="{ flex: 1, background: t.preview[2] }" />
              </span>
              <span :style="cardName">{{ t.name }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>

    <div :style="wrapRel">
      <button
        :style="btn"
        v-hover-style="btnHover"
        aria-label="Account"
        @click="auth.toggleAvatarMenu()"
      >
        <span :style="avatarDisc">{{ avatarInitial }}</span>
      </button>
      <div v-if="avatarMenuOpen" :style="popover">
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
          <Checkbox :model-value="autoRollover" @update:model-value="app.setAutoRollover($event)" />
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
        <button :style="menuItem" v-hover-style="menuHover" @click="auth.openGithubPanel()">
          {{ ghMenuLabel }}
        </button>
        <button :style="menuItem" v-hover-style="menuHover" @click="auth.signOut()">
          Sign out
        </button>
      </div>
    </div>

    <button
      :style="btn"
      v-hover-style="btnHover"
      aria-label="GitHub"
      @click="auth.openGithubPanel()"
    >
      <Icon name="share" size="sm" :style="{ color: c.accent }" />
    </button>
  </footer>
</template>
