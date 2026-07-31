<script setup lang="ts">
// The left navigation rail — the vertical replacement for the old top tab
// carousel. Every tab is visible at once (no scrolling, no arrows); the rail
// collapses to a 72px icon strip or expands to 232px with labels. It also holds
// the brand mark, the Notes/Settings secondary items, the theme orb, the account
// chip and the collapse toggle. Tab ordering comes from tabs.config so the rail,
// the mobile bottom bar and the More sheet never disagree.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useLockStore } from '@/stores/lock'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { THEMES, LIGHT_THEME_KEYS, DARK_THEME_KEYS, type ThemeKey } from '@/themes'
import { TABS } from '@/tabs.config'
import TabGlyph from '@/components/TabGlyph.vue'
import type { TabKey } from '@/types'

const ui = useUiStore()
const app = useAppStore()
const auth = useAuthStore()
const lock = useLockStore()
const { c, B } = useStyles()
const { tab, railCollapsed, isTablet, isDayTime, themePanelOpen, themeSetting, now } =
  storeToRefs(ui)
const { avatarMenuOpen, avatarInitial, avatarName, avatarSub, avatarColor, ghMenuLabel } =
  storeToRefs(auth)
const { security } = storeToRefs(app)

// Tablet portrait renders the rail collapsed-only with no expand toggle; the
// user's saved preference drives it everywhere wider.
const collapsed = computed(() => isTablet.value || railCollapsed.value)

const greeting = computed(() => {
  const h = new Date(now.value).getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Late night'
})

// Row badges. Overdue counts share the store's single source (pendingOverdue) so
// the badge and the move-pending action can never disagree.
const badges = computed<Partial<Record<TabKey, number>>>(() => {
  void now.value // re-file at midnight
  return {
    todo: app.pendingOverdue('todos').length,
    tasks: app.pendingOverdue('tasks').length,
  }
})

function activate(key: TabKey) {
  ui.setTab(key)
}

// ---- styles ---------------------------------------------------------------
const rail = computed(() =>
  pxify({
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: collapsed.value ? '16px 12px' : '16px 14px',
    background: c.value.glass,
    backdropFilter: 'blur(24px) saturate(1.5)',
    '-webkit-backdrop-filter': 'blur(24px) saturate(1.5)',
    borderRight: B.value,
    boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)',
    overflow: 'hidden',
    transition: 'padding .22s cubic-bezier(.4,0,.2,1)',
  }),
)
const brandRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    height: 48,
    padding: collapsed.value ? '0' : '0 8px',
    justifyContent: collapsed.value ? 'center' : 'flex-start',
    marginBottom: 6,
  }),
)
const brandOrb = computed(() =>
  pxify({
    width: 26,
    height: 26,
    borderRadius: '50%',
    flexShrink: 0,
    background: 'radial-gradient(circle at 34% 32%, ' + c.value.accent + ' 0%, transparent 72%)',
    boxShadow: '0 0 14px ' + c.value.accent,
  }),
)
const brandWord = computed(() =>
  pxify({
    fontSize: 14,
    letterSpacing: '0.36em',
    fontWeight: 600,
    color: c.value.text,
    whiteSpace: 'nowrap',
  }),
)
const listWrap = pxify({ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minHeight: 0 })
const divider = computed(() => pxify({ height: 1, background: c.value.border, margin: '8px 6px' }))

function rowStyle(active: boolean) {
  return pxify({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    height: 48,
    padding: collapsed.value ? '0' : '0 12px',
    justifyContent: collapsed.value ? 'center' : 'flex-start',
    borderRadius: 14,
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    background: active ? c.value.card : 'transparent',
    boxShadow: active
      ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 16px ' + c.value.accent + '22'
      : 'none',
    transition: 'background .18s ease, box-shadow .25s ease',
  })
}
const rowHover = computed(() => pxify({ background: c.value.input }))
// The accent left indicator bar on the active row (3px, rounded).
function indicator(active: boolean) {
  return pxify({
    position: 'absolute',
    left: collapsed.value ? 2 : 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 3,
    height: active ? 22 : 0,
    borderRadius: 3,
    background: c.value.accent,
    boxShadow: '0 0 8px ' + c.value.accent,
    transition: 'height .2s cubic-bezier(.34,1.56,.64,1)',
  })
}
const iconBox = pxify({ position: 'relative', width: 20, height: 20, flexShrink: 0 })
function labelStyle(active: boolean) {
  return pxify({
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: active ? c.value.accent : c.value.text,
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  })
}
// Expanded badge: a small numeric pill, right-aligned.
const badgePill = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    padding: '3px 6px',
    borderRadius: 999,
    background: c.value.accent,
    color: c.value.onAccent,
    flexShrink: 0,
  }),
)
// Collapsed badge: a dot on the icon corner.
const badgeDot = computed(() =>
  pxify({
    position: 'absolute',
    top: -3,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: c.value.accent,
    boxShadow: '0 0 0 2px ' + c.value.glass,
  }),
)
// Collapsed hover tooltip, positioned right of the icon (CSS-delayed 400ms).
const tip = computed(() =>
  pxify({
    position: 'absolute',
    left: 'calc(100% + 10px)',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '5px 11px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    color: c.value.text,
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(20px) saturate(1.6)',
    border: B.value,
    boxShadow: c.value.shadow,
    zIndex: 30,
    pointerEvents: 'none',
  }),
)

// ---- bottom block ---------------------------------------------------------
const bottomWrap = pxify({ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 })
const orbBtn = computed(() =>
  pxify({
    position: 'relative',
    width: collapsed.value ? 40 : '100%',
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed.value ? 'center' : 'flex-start',
    gap: 12,
    padding: collapsed.value ? '0' : '0 12px',
    margin: collapsed.value ? '0 auto' : '0',
    borderRadius: 14,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  }),
)
const orb = computed(() =>
  pxify({
    position: 'relative',
    width: 26,
    height: 26,
    borderRadius: '50%',
    flexShrink: 0,
    background: isDayTime.value
      ? 'radial-gradient(circle at 35% 35%, ' + c.value.accent + ' 0%, transparent 75%)'
      : 'radial-gradient(circle at 35% 35%, #f0f0f8 0%, #c7c7d6 70%)',
    boxShadow: isDayTime.value ? '0 0 14px ' + c.value.accent : '0 0 14px rgba(230,230,245,0.55)',
    animation: isDayTime.value ? 'breathe 5s ease-in-out infinite' : 'none',
  }),
)
const orbLabel = computed(() => pxify({ fontSize: 12, color: c.value.dim, whiteSpace: 'nowrap' }))
const avatarBtn = computed(() =>
  pxify({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: collapsed.value ? 40 : '100%',
    padding: collapsed.value ? '0' : '6px 10px',
    margin: collapsed.value ? '0 auto' : '0',
    borderRadius: 14,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    cursor: 'pointer',
    justifyContent: collapsed.value ? 'center' : 'flex-start',
    textAlign: 'left',
  }),
)
const avatarDisc = computed(() =>
  pxify({
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: avatarColor.value,
    flexShrink: 0,
  }),
)
const avatarText = pxify({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  lineHeight: 1.25,
})
const avatarGreet = computed(() =>
  pxify({ fontSize: 10, color: c.value.dim, whiteSpace: 'nowrap' }),
)
const avatarNameStyle = computed(() =>
  pxify({
    fontSize: 12,
    fontWeight: 600,
    color: c.value.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 130,
  }),
)
const toggleBtn = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 36,
    marginTop: 2,
    borderRadius: 12,
    border: '1px dashed ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    fontSize: 12,
    cursor: 'pointer',
    width: '100%',
  }),
)

// Compact popovers reuse the store's shared open-state and actions.
const popover = computed(() =>
  pxify({
    position: 'absolute',
    bottom: 8,
    left: 'calc(100% + 10px)',
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
    zIndex: 40,
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
</script>

<template>
  <nav :style="rail" aria-label="Primary" class="left-rail">
    <!-- Brand -->
    <div :style="brandRow">
      <span :style="brandOrb" aria-hidden="true"></span>
      <span v-if="!collapsed" :style="brandWord">AUREON</span>
    </div>

    <!-- Tabs — every one visible, no scroll, no arrows -->
    <div :style="listWrap">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="rail-row"
        :style="rowStyle(tab === t.key)"
        v-hover-style="rowHover"
        :aria-current="tab === t.key ? 'page' : undefined"
        :aria-label="t.label"
        @click="activate(t.key)"
      >
        <span :style="indicator(tab === t.key)"></span>
        <span :style="iconBox">
          <TabGlyph
            :name="t.key"
            :filled="tab === t.key"
            :col="tab === t.key ? c.accent : c.dim"
            :ko="c.card"
          />
          <span v-if="collapsed && badges[t.key]" :style="badgeDot"></span>
        </span>
        <template v-if="!collapsed">
          <span :style="labelStyle(tab === t.key)">{{ t.label }}</span>
          <span v-if="badges[t.key]" :style="badgePill">{{ badges[t.key] }}</span>
        </template>
        <span v-if="collapsed" class="rail-tip" :style="tip">{{ t.label }}</span>
      </button>

      <div :style="divider"></div>

      <!-- Secondary -->
      <button
        class="rail-row"
        :style="rowStyle(false)"
        v-hover-style="rowHover"
        aria-label="Notes"
        @click="ui.toggleDrawer()"
      >
        <span :style="iconBox">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            :stroke="c.dim"
            stroke-width="1.9"
            stroke-linecap="round"
          >
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <line x1="7.5" y1="8" x2="16.5" y2="8" />
            <line x1="7.5" y1="12" x2="16.5" y2="12" />
            <line x1="7.5" y1="16" x2="13" y2="16" />
          </svg>
        </span>
        <span v-if="!collapsed" :style="labelStyle(false)">Notes</span>
        <span v-if="collapsed" class="rail-tip" :style="tip">Notes</span>
      </button>

      <button
        class="rail-row"
        :style="rowStyle(false)"
        v-hover-style="rowHover"
        aria-label="Settings"
        @click="auth.toggleAvatarMenu()"
      >
        <span :style="iconBox">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            :stroke="c.dim"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3.2" />
            <path
              d="M12 3v2.2M12 18.8V21M4.2 7l1.9 1.1M17.9 15.9 19.8 17M3 13.5l2.2-.6M18.8 11.1 21 10.5M4.2 17l1.9-1.1M17.9 8.1 19.8 7"
            />
          </svg>
        </span>
        <span v-if="!collapsed" :style="labelStyle(false)">Settings</span>
        <span v-if="collapsed" class="rail-tip" :style="tip">Settings</span>
      </button>
    </div>

    <!-- Bottom block: theme orb, account chip, collapse toggle -->
    <div :style="bottomWrap">
      <div style="position: relative">
        <button
          :style="orbBtn"
          aria-label="Theme"
          :aria-expanded="themePanelOpen"
          @click="ui.toggleThemePanel()"
        >
          <span :style="orb"></span>
          <span v-if="!collapsed" :style="orbLabel">Theme</span>
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

      <div style="position: relative">
        <button :style="avatarBtn" aria-label="Account" @click="auth.toggleAvatarMenu()">
          <span :style="avatarDisc">{{ avatarInitial }}</span>
          <span v-if="!collapsed" :style="avatarText">
            <span :style="avatarGreet">{{ greeting }}</span>
            <span :style="avatarNameStyle">{{ avatarName }}</span>
          </span>
        </button>
        <div v-if="avatarMenuOpen" :style="popover">
          <div style="padding: 6px 8px">
            <div :style="avatarNameStyle">{{ avatarName }}</div>
            <div :style="orbLabel">{{ avatarSub }}</div>
          </div>
          <label :style="menuToggle">
            <input type="checkbox" :checked="security.autoLockEnabled" @change="onAutoLockChange" />
            <span>Auto-lock after 50 min</span>
          </label>
          <button :style="menuItem" v-hover-style="rowHover" @click="onLockNow">Lock now</button>
          <button :style="menuItem" v-hover-style="rowHover" @click="auth.openGithubPanel()">
            {{ ghMenuLabel }}
          </button>
          <button :style="menuItem" v-hover-style="rowHover" @click="auth.signOut()">
            Sign out
          </button>
        </div>
      </div>

      <button
        v-if="!isTablet"
        :style="toggleBtn"
        v-hover-style="rowHover"
        :aria-label="collapsed ? 'Expand navigation' : 'Collapse navigation'"
        @click="ui.toggleRail()"
      >
        <span>{{ collapsed ? '»' : '«' }}</span>
        <span v-if="!collapsed">Collapse</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* Collapsed tooltips: hidden until a 400ms hover, per spec. */
.rail-tip {
  opacity: 0;
  transition: opacity 0.15s ease;
  transition-delay: 0s;
}
.rail-row:hover .rail-tip {
  opacity: 1;
  transition-delay: 0.4s;
}
</style>
