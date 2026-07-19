<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { THEMES, LIGHT_THEME_KEYS, DARK_THEME_KEYS, type ThemeKey } from '@/themes'

const ui = useUiStore()
const auth = useAuthStore()
const { c, s } = useStyles()
const { themeSetting, themePanelOpen, isDayTime, now } = storeToRefs(ui)
const { avatarMenuOpen, avatarColor, avatarInitial, avatarName, avatarSub, ghMenuLabel, isSignedIn } =
  storeToRefs(auth)

const greetingText = computed(() => {
  const h = new Date(now.value).getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Late night'
})

const autoActive = computed(() => themeSetting.value === 'auto')

function rowStyle(active: boolean) {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid ' + (active ? c.value.border : 'transparent'),
    background: active ? c.value.card : 'transparent',
    boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(0,0,0,0.06)' : 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  })
}
const autoDotStyle = computed(() =>
  pxify({
    width: 20,
    height: 20,
    borderRadius: '50%',
    flexShrink: 0,
    background:
      'conic-gradient(from 0deg, oklch(0.85 0.15 85), oklch(0.74 0.13 250), oklch(0.78 0.15 340), oklch(0.83 0.13 88), oklch(0.85 0.15 85))',
    border: '2px solid ' + (autoActive.value ? c.value.accent : 'transparent'),
    boxShadow: autoActive.value ? '0 0 10px ' + c.value.accent : 'none',
  }),
)
function themeDotStyle(key: ThemeKey, active: boolean) {
  return pxify({
    width: 20,
    height: 20,
    borderRadius: '50%',
    flexShrink: 0,
    background: THEMES[key].pageBg,
    border: '2px solid ' + (active ? c.value.accent : 'transparent'),
  })
}
const autoLabelStyle = computed(() => pxify({ fontSize: 12, color: c.value.text, fontWeight: 600 }))
const themeLabelStyle = computed(() => pxify({ fontSize: 12, color: c.value.text }))

const lightThemes = LIGHT_THEME_KEYS
const darkThemes = DARK_THEME_KEYS
function isThemeActive(key: ThemeKey) {
  return !autoActive.value && themeSetting.value === key
}

const userPillPhoto = computed(() =>
  pxify({
    width: 26,
    height: 26,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: avatarColor.value,
    border: '1px solid ' + c.value.border,
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)',
    flexShrink: 0,
  }),
)

const greetingIconWrap = pxify({ position: 'relative', width: 32, height: 32 })
const sunIcon = computed(() =>
  pxify({
    position: 'absolute',
    inset: 2,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%,' + c.value.accent + ' 0%, transparent 75%)',
    boxShadow: '0 0 22px 6px ' + c.value.accent,
    animation: 'breathe 5s ease-in-out infinite',
  }),
)
const moonIcon = pxify({
  position: 'absolute',
  top: 3,
  left: 3,
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: 'radial-gradient(circle at 35% 35%,#f0f0f8 0%,#c7c7d6 70%)',
  boxShadow: '0 0 14px rgba(230,230,245,0.5)',
})
const moonStars = [0, 1, 2]
function moonStarStyle(i: number) {
  return pxify({
    position: 'absolute',
    top: [0, 26, 10][i],
    left: [26, 2, 28][i],
    width: 2,
    height: 2,
    borderRadius: '50%',
    background: '#fff',
    opacity: 0.85,
    animation: 'twinkle 3s ease-in-out infinite',
    animationDelay: i * 0.5 + 's',
  })
}

function onSignOut() {
  auth.signOut()
}
</script>

<template>
  <div :style="s.topRow">
    <div :style="s.themeWrap">
      <button :style="s.themeTrigger" aria-label="Theme" @click="ui.toggleThemePanel()"></button>
      <div v-if="themePanelOpen" :style="s.themePanel">
        <button :style="rowStyle(autoActive)" v-hover-style="s.themeRowHover" @click="ui.setTheme('auto')">
          <span :style="autoDotStyle"></span>
          <span :style="autoLabelStyle">Auto (follows time)</span>
        </button>
        <span :style="s.themeGroupLabel">Light</span>
        <button
          v-for="key in lightThemes"
          :key="key"
          :style="rowStyle(isThemeActive(key))"
          v-hover-style="s.themeRowHover"
          @click="ui.setTheme(key)"
        >
          <span :style="themeDotStyle(key, isThemeActive(key))"></span>
          <span :style="themeLabelStyle">{{ THEMES[key].label }}</span>
        </button>
        <span :style="s.themeGroupLabel">Dark</span>
        <button
          v-for="key in darkThemes"
          :key="key"
          :style="rowStyle(isThemeActive(key))"
          v-hover-style="s.themeRowHover"
          @click="ui.setTheme(key)"
        >
          <span :style="themeDotStyle(key, isThemeActive(key))"></span>
          <span :style="themeLabelStyle">{{ THEMES[key].label }}</span>
        </button>
      </div>
    </div>
  </div>

  <div :style="s.greetingRow">
    <div :style="s.greetingLeft">
      <div :style="greetingIconWrap">
        <template v-if="isDayTime">
          <div :style="sunIcon"></div>
        </template>
        <template v-else>
          <div :style="moonIcon"></div>
          <span v-for="i in moonStars" :key="i" :style="moonStarStyle(i)"></span>
        </template>
      </div>
      <span :style="s.greetingText">{{ greetingText }}</span>
    </div>
    <div :style="s.userMenuWrap">
      <button :style="s.userPill" v-hover-style="s.userPillHover" aria-label="Account" @click="auth.toggleAvatarMenu()">
        <span :style="userPillPhoto">{{ avatarInitial }}</span>
        <span :style="s.userPillName">{{ avatarName }}</span>
        <span :style="s.userPillChevron">▾</span>
      </button>
      <div v-if="avatarMenuOpen" :style="s.avatarMenu">
        <div :style="s.menuHead">
          <span :style="s.drawerTitle">{{ avatarName }}</span>
          <span :style="s.finMeta">{{ avatarSub }}</span>
        </div>
        <button :style="s.menuItem" v-hover-style="s.themeRowHover" @click="auth.openGithubPanel()">
          {{ ghMenuLabel }}
        </button>
        <button :style="s.menuItem" v-hover-style="s.themeRowHover" @click="ui.toggleDrawer(); auth.toggleAvatarMenu()">
          Notes
        </button>
        <button v-if="isSignedIn" :style="s.menuItem" v-hover-style="s.themeRowHover" @click="onSignOut">
          Sign out
        </button>
        <button v-else :style="s.menuItem" v-hover-style="s.themeRowHover" @click="auth.openAuth()">Sign in</button>
      </div>
    </div>
  </div>
</template>
