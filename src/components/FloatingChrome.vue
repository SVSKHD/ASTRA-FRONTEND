<script setup lang="ts">
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
import { pxify } from '@/styles'
import { THEMES, LIGHT_THEME_KEYS, DARK_THEME_KEYS, type ThemeKey } from '@/themes'

const ui = useUiStore()
const auth = useAuthStore()
const app = useAppStore()
const lock = useLockStore()
const { c, B } = useStyles()
const { themePanelOpen, themeSetting, isDayTime, isPhone } = storeToRefs(ui)
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
function onAutoLockChange(e: Event) {
  lock.setAutoLock((e.target as HTMLInputElement).checked)
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
    gap: 12,
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
    gap: 12,
  }),
)
const orbRel = pxify({ position: 'relative' })

// Time-of-day orb face, reused from the old header's sun/moon.
const themeFace = computed(() =>
  pxify({
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: isDayTime.value
      ? 'radial-gradient(circle at 35% 35%, ' + c.value.accent + ' 0%, transparent 75%)'
      : 'radial-gradient(circle at 35% 35%, #f0f0f8 0%, #c7c7d6 70%)',
    boxShadow: isDayTime.value ? '0 0 12px ' + c.value.accent : '0 0 12px rgba(230,230,245,0.55)',
    animation: isDayTime.value ? 'breathe 5s ease-in-out infinite' : 'none',
  }),
)
const avatarDisc = computed(() =>
  pxify({
    width: 30,
    height: 30,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
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
    borderRadius: 18,
    padding: 10,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    zIndex: 20,
    animation: 'fadeUp .22s ease both',
  }),
)
function themeRow(active: boolean) {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 8px',
    borderRadius: 10,
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
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
    padding: '6px 8px 2px',
  }),
)
const rowText = computed(() => pxify({ fontSize: 12, color: c.value.text }))
const menuItem = computed(() =>
  pxify({
    padding: '9px 10px',
    borderRadius: 10,
    fontSize: 12,
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
    gap: 8,
    padding: '9px 10px',
    fontSize: 12,
    color: c.value.dim,
  }),
)
const nameStyle = computed(() =>
  pxify({ fontSize: 12, fontWeight: 600, color: c.value.text, whiteSpace: 'nowrap' }),
)
const subStyle = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
</script>

<template>
  <!-- Brand orb, top-left -->
  <div :style="brandWrap">
    <div :style="brandOrb" aria-label="Aureon"><span :style="brandDot"></span></div>
  </div>

  <!-- Notes + Settings orbs, bottom-left -->
  <div :style="leftStack">
    <button :style="orb" v-hover-style="orbHover" aria-label="Notes" @click="ui.toggleDrawer()">
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        :stroke="c.accent"
        stroke-width="2"
        stroke-linecap="round"
      >
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <line x1="7.5" y1="8" x2="16.5" y2="8" />
        <line x1="7.5" y1="12" x2="16.5" y2="12" />
        <line x1="7.5" y1="16" x2="13" y2="16" />
      </svg>
    </button>
    <button
      :style="orb"
      v-hover-style="orbHover"
      aria-label="Settings"
      @click="auth.toggleAvatarMenu()"
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        :stroke="c.accent"
        stroke-width="1.9"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="3.2" />
        <path
          d="M12 3v2.2M12 18.8V21M4.2 7l1.9 1.1M17.9 15.9 19.8 17M3 13.5l2.2-.6M18.8 11.1 21 10.5M4.2 17l1.9-1.1M17.9 8.1 19.8 7"
        />
      </svg>
    </button>
  </div>

  <!-- Theme + account + GitHub cluster, bottom-right -->
  <div :style="rightCluster">
    <div :style="orbRel">
      <button
        :style="orb"
        v-hover-style="orbHover"
        aria-label="Theme"
        :aria-expanded="themePanelOpen"
        @click="ui.toggleThemePanel()"
      >
        <span :style="themeFace"></span>
      </button>
      <div v-if="themePanelOpen" :style="popover">
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
        <span :style="groupLabel">Light</span>
        <button
          v-for="key in LIGHT_THEME_KEYS"
          :key="key"
          :style="themeRow(isThemeActive(key))"
          @click="ui.setTheme(key)"
        >
          <span :style="swatch(THEMES[key].pageBg, isThemeActive(key))"></span>
          <span :style="rowText">{{ THEMES[key].label }}</span>
        </button>
        <span :style="groupLabel">Dark</span>
        <button
          v-for="key in DARK_THEME_KEYS"
          :key="key"
          :style="themeRow(isThemeActive(key))"
          @click="ui.setTheme(key)"
        >
          <span :style="swatch(THEMES[key].pageBg, isThemeActive(key))"></span>
          <span :style="rowText">{{ THEMES[key].label }}</span>
        </button>
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
          <input type="checkbox" :checked="security.autoLockEnabled" @change="onAutoLockChange" />
          <span>Auto-lock after 50 min</span>
        </label>
        <label :style="menuToggle">
          <input
            type="checkbox"
            :checked="autoRollover"
            @change="app.setAutoRollover(($event.target as HTMLInputElement).checked)"
          />
          <span>Auto-roll overdue to today</span>
        </label>
        <label :style="menuToggle">
          <input
            type="checkbox"
            :checked="hideCompleted"
            @change="app.setHideCompleted(($event.target as HTMLInputElement).checked)"
          />
          <span>Hide completed items</span>
        </label>
        <label :style="menuToggle">
          <input
            type="checkbox"
            :checked="reminderSound"
            @change="app.setReminderSound(($event.target as HTMLInputElement).checked)"
          />
          <span>Reminder sound</span>
        </label>
        <button :style="menuItem" v-hover-style="menuHover" @click="onLockNow">Lock now</button>
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
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        :stroke="c.accent"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="6" cy="18" r="2.4" />
        <circle cx="18" cy="8" r="2.4" />
        <path d="M18 10.4v1.6a3 3 0 0 1-3 3H9" />
        <line x1="6" y1="8.4" x2="6" y2="15.6" />
      </svg>
    </button>
  </div>
</template>
