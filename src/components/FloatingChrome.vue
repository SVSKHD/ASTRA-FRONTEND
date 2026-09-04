<script setup lang="ts">
import Checkbox from '@/components/ui/Checkbox.vue'
// All the floating chrome that used to live docked in the rail/header, now
// scattered as independent glass orbs over the starfield: the AUREON mark
// (top-left), the Notes and Settings orbs (bottom-left), and the theme + account
// + GitHub cluster (bottom-right). Every surface shares the one glass token set
// (c.glass / c.border / c.shadow) so nothing is styled one-off.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useLockStore } from '@/stores/lock'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { THEME_DESCRIPTORS, type ThemeKey } from '@/themes'
import Icon from '@/components/ui/Icon.vue'

const ui = useUiStore()
const auth = useAuthStore()
const app = useAppStore()
const lock = useLockStore()
const { c, B } = useStyles()
const { themePanelOpen, themeSetting, isPhone, dark, preferredLight } = storeToRefs(ui)
const { avatarMenuOpen, avatarInitial, avatarName, avatarSub, avatarColor, ghMenuLabel } =
  storeToRefs(auth)
const { security, autoRollover, hideCompleted, reminderSound } = storeToRefs(app)

// Lift the bottom clusters above the horizontal dock on phones.
const bottomInset = computed(() =>
  isPhone.value ? 'calc(92px + env(safe-area-inset-bottom, 0px))' : '24px',
)

const autoActive = computed(() => themeSetting.value === 'auto')
function isThemeActive(key: ThemeKey) {
  return !autoActive.value && themeSetting.value === key
}
// The picker groups, straight from the registry (dark, light, special,
// standalone).
const darkThemes = computed(() =>
  THEME_DESCRIPTORS.filter((t) => t.mode === 'dark' && !t.special && !t.standalone),
)
const lightThemes = computed(() =>
  THEME_DESCRIPTORS.filter((t) => t.mode === 'light' && !t.special && !t.standalone),
)
const specialThemes = computed(() => THEME_DESCRIPTORS.filter((t) => t.special))
const standaloneThemes = computed(() => THEME_DESCRIPTORS.filter((t) => t.standalone))
// The control hands over the value; there is no event to dig into any more.
function onAutoLockChange(on: boolean) {
  lock.setAutoLock(on)
}
function onLockNow() {
  auth.avatarMenuOpen = false
  lock.lockNow()
}

// ---- shared orb -----------------------------------------------------------
const orb = computed(() =>
  pxify({
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.5)',
    '-webkit-backdrop-filter': 'blur(20px) saturate(1.5)',
    border: B.value,
    boxShadow: c.value.shadow + ', inset 0 1px 0 rgba(255,255,255,0.18)',
    cursor: 'pointer',
    color: c.value.accent,
    transition: 'transform .2s ease, box-shadow .25s ease',
  }),
)
const orbHover = pxify({ transform: 'translateY(-3px) scale(1.05)' })

const brandWrap = pxify({ position: 'fixed', top: 20, left: 24, zIndex: 6 })
const brandOrb = computed(() =>
  pxify({
    width: 40,
    height: 40,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.5)',
    '-webkit-backdrop-filter': 'blur(20px) saturate(1.5)',
    border: B.value,
    boxShadow: c.value.shadow,
  }),
)
const brandDot = computed(() =>
  pxify({
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 34% 32%, ' + c.value.accent + ' 0%, transparent 72%)',
    boxShadow: '0 0 12px ' + c.value.accent,
  }),
)

const leftStack = computed(() =>
  pxify({
    position: 'fixed',
    left: 24,
    bottom: bottomInset.value,
    zIndex: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
  }),
)
const rightCluster = computed(() =>
  pxify({
    position: 'fixed',
    right: 24,
    bottom: bottomInset.value,
    zIndex: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
  }),
)
const orbRel = pxify({ position: 'relative' })

// The espresso switch. It sets the theme like any other, and — because the
// choice is persisted with the trade logger's settings rather than in the
// workspace document — it also asks the logger to remember it (section 29).
const espressoOn = computed(() => themeSetting.value === 'espresso')
function toggleEspresso() {
  ui.setTheme(espressoOn.value ? preferredLight.value : 'espresso')
}

const avatarDisc = computed(() =>
  pxify({
    width: 30,
    height: 30,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    // The ink on a filled disc, from the theme rather than a literal white: on
    // a pale accent white is unreadable, and the token is measured (section 29).
    color: 'var(--theme-on-accent)',
    background: avatarColor.value,
  }),
)

// Popovers open upward from the cluster.
const popover = computed(() =>
  pxify({
    position: 'absolute',
    bottom: 'calc(100% + 10px)',
    right: 0,
    width: 220,
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
    zIndex: 20,
    animation: 'fadeUp .22s ease both',
  }),
)
// The Appearance picker is wider than the account menu to fit the card grid,
// and scrolls if the theme list outgrows the viewport.
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
    zIndex: 20,
    animation: 'fadeUp .22s ease both',
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
// --- Appearance picker: a grid of theme cards, grouped dark / light / special.
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
// The three preview swatches (surface / accent / card) stacked as a mini board.
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
  <!-- Brand orb, top-left -->
  <div :style="brandWrap">
    <div :style="brandOrb" aria-label="Aureon"><span :style="brandDot"></span></div>
  </div>

  <!-- Notes + Settings orbs, bottom-left -->
  <div :style="leftStack">
    <button :style="orb" v-hover-style="orbHover" aria-label="Notes" @click="ui.toggleDrawer()">
      <Icon name="notebook" size="md" :style="{ color: c.accent }" />
    </button>
    <button
      :style="orb"
      v-hover-style="orbHover"
      aria-label="Settings"
      @click="auth.toggleAvatarMenu()"
    >
      <Icon name="sun" size="md" :style="{ color: c.accent }" />
    </button>
  </div>

  <!-- Theme + account + GitHub cluster, bottom-right -->
  <div :style="rightCluster">
    <!-- Quick dark/light toggle: flips between the user's last-chosen dark and
         light themes without opening the picker. -->
    <button
      :style="orb"
      v-hover-style="orbHover"
      :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="ui.toggleThemeMode()"
    >
      <Icon v-if="dark" name="sun" size="md" :style="{ color: c.accent }" />
      <Icon v-else name="moon" size="md" :style="{ color: c.accent }" />
    </button>
    <!-- Espresso (section 29). Its own control rather than another row in the
         picker: it is a whole ground, and a switch you can find without opening
         a menu is the difference between a theme people use and one they
         discover once. The cup is not used anywhere else in the app. -->
    <button
      :style="orb"
      v-hover-style="orbHover"
      class="orb-themed"
      :aria-pressed="espressoOn"
      :aria-label="espressoOn ? 'Leave the espresso theme' : 'Switch to the espresso theme'"
      @click="toggleEspresso()"
    >
      <Icon name="coffee" size="md" :style="{ color: c.accent }" />
    </button>
    <div :style="orbRel">
      <button
        :style="orb"
        v-hover-style="orbHover"
        aria-label="Appearance"
        :aria-expanded="themePanelOpen"
        @click="ui.toggleThemePanel()"
      >
        <Icon name="palette" size="md" :style="{ color: c.accent }" />
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
          <!-- Its own group: a standalone theme is a whole look rather than a
               variant of the current one (section 21d). -->
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

    <div :style="orbRel">
      <button
        :style="orb"
        v-hover-style="orbHover"
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
      :style="orb"
      v-hover-style="orbHover"
      aria-label="GitHub"
      @click="auth.openGithubPanel()"
    >
      <Icon name="share" size="md" :style="{ color: c.accent }" />
    </button>
  </div>
</template>
