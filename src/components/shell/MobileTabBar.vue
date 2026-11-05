<script setup lang="ts">
// The phone's navigation (Todo v2, 3a): the five PRIMARY_TABS plus More, as a
// labelled tab bar in the rail region. It replaces the carousel dock on phones —
// a carousel that shows five icons at a time and hides which five is a puzzle on
// a screen you hold in one hand, and tabs.config already names the five that
// matter most. The other fifteen are one tap away in the More sheet.
//
// The More sheet also carries what the desktop's bottom pill carries — Notes,
// Appearance, Account, GitHub and the sync status — because a phone has room
// for one bar at the bottom edge, and this is it. Appearance and Account open
// as sheets of their own rather than as popovers over a bar that is not there.
//
// While a bottom sheet is open over the page the bar slides out of the way,
// because two things anchored to the bottom edge is one too many.
//
// Icons only, and it behaves like Instagram's: scrolling the content down
// slides the bar away, any scroll up brings it back, and it is always shown at
// the top of the page and after switching tabs.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { PRIMARY_TABS, SECONDARY_TABS } from '@/tabs.config'
import TabGlyph from '@/components/TabGlyph.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import Icon from '@/components/ui/Icon.vue'
import ShellSync from '@/components/shell/ShellSync.vue'
import AppearancePanel from '@/components/shell/AppearancePanel.vue'
import AccountMenu from '@/components/shell/AccountMenu.vue'
import { shellScroller } from '@/components/shell/shellKeys'
import type { TabKey } from '@/types'

const ui = useUiStore()
const app = useAppStore()
const auth = useAuthStore()
const { tab, moreSheetOpen, sheetTodoId, now } = storeToRefs(ui)
const { avatarMenuOpen, avatarInitial, avatarColor } = storeToRefs(auth)
const { c } = useStyles()

const moreActive = computed(() => SECONDARY_TABS.some((t) => t.key === tab.value))

// --- hide on scroll down, show on scroll up ------------------------------------
// A small dead zone so a finger resting on the glass does not flicker the bar,
// and the top of the page always shows it (the iOS rubber band scrolls < 0).
const SCROLL_SLOP = 6
const SHOW_NEAR_TOP = 48
const scrolledAway = ref(false)
let lastTop = 0
function onScroll(e: Event) {
  const top = (e.target as HTMLElement).scrollTop
  const delta = top - lastTop
  if (top <= SHOW_NEAR_TOP) scrolledAway.value = false
  else if (delta > SCROLL_SLOP) scrolledAway.value = true
  else if (delta < -SCROLL_SLOP) scrolledAway.value = false
  else return
  lastTop = top
}
watch(
  shellScroller,
  (el, prev) => {
    prev?.removeEventListener('scroll', onScroll)
    el?.addEventListener('scroll', onScroll, { passive: true })
    lastTop = el?.scrollTop ?? 0
    scrolledAway.value = false
  },
  { immediate: true },
)
onBeforeUnmount(() => shellScroller.value?.removeEventListener('scroll', onScroll))
watch([tab, moreSheetOpen], () => (scrolledAway.value = false))

const hidden = computed(() => sheetTodoId.value != null)
const badges = computed<Partial<Record<TabKey, number>>>(() => {
  void now.value
  return { todo: app.pendingOverdue('todos').length, tasks: app.pendingOverdue('tasks').length }
})

function go(key: TabKey) {
  ui.setMoreSheet(false)
  if (tab.value !== key) ui.setTab(key)
}

// --- the utilities, from the More sheet ---------------------------------------
const panel = ref<'appearance' | 'account' | null>(null)
function openNotes() {
  ui.setMoreSheet(false)
  ui.openShellPanel('notes', avatarMenuOpen)
}
function openTradeRules() {
  ui.setMoreSheet(false)
  ui.openShellPanel('trade-rules', avatarMenuOpen)
}
function openTimeline() {
  ui.setMoreSheet(false)
  ui.openShellPanel('timeline', avatarMenuOpen)
}
function openPanel(name: 'appearance' | 'account') {
  ui.setMoreSheet(false)
  panel.value = name
}
function openGithub() {
  ui.setMoreSheet(false)
  auth.openGithubPanel()
}
// Settings live in the control center (/settings → /dev/settings).
const router = useRouter()
function openSettings() {
  ui.setMoreSheet(false)
  void router.push('/settings')
}
const avatarDisc = computed(() => ({
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: 'var(--text-2xs)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--theme-on-accent)',
  background: avatarColor.value,
}))
</script>

<template>
  <nav
    class="mtb"
    :class="{ 'is-hidden': hidden, 'is-away': scrolledAway && !hidden }"
    aria-label="Sections"
  >
    <button
      v-for="t in PRIMARY_TABS"
      :key="t.key"
      type="button"
      class="mtb__item"
      :class="{ 'is-on': tab === t.key }"
      :aria-current="tab === t.key ? 'page' : undefined"
      :aria-label="t.label"
      :title="t.label"
      @click="go(t.key)"
    >
      <span class="mtb__cap">
        <TabGlyph
          :name="t.key"
          :filled="tab === t.key"
          :size="24"
          :col="tab === t.key ? c.accent : c.dim"
          :ko="c.card"
        />
        <span v-if="badges[t.key]" class="mtb__dot"></span>
      </span>
    </button>
    <button
      type="button"
      class="mtb__item"
      :class="{ 'is-on': moreActive || moreSheetOpen }"
      :aria-expanded="moreSheetOpen"
      aria-label="More"
      title="More"
      @click="ui.setMoreSheet(!moreSheetOpen)"
    >
      <span class="mtb__cap"><Icon name="more-horizontal" size="lg" /></span>
    </button>
  </nav>

  <BottomSheet :open="moreSheetOpen" title="More" @close="ui.setMoreSheet(false)">
    <!-- What the desktop's bottom pill holds, first: five controls and the
         sync status, above the fold of a 360px sheet. -->
    <div class="mtb-more mtb-more--utils" role="group" aria-label="Workspace">
      <button type="button" class="mtb-more__item" @click="openNotes">
        <Icon name="notebook" size="md" class="mtb-more__icon" />
        <span>Notes</span>
      </button>
      <button type="button" class="mtb-more__item" @click="openTradeRules">
        <Icon name="book-open" size="md" class="mtb-more__icon" /><span>Trade book rules</span>
      </button>

      <button type="button" class="mtb-more__item" @click="openTimeline">
        <Icon name="clock" size="md" class="mtb-more__icon" />
        <span>Timeline</span>
      </button>
      <button type="button" class="mtb-more__item" @click="openPanel('appearance')">
        <Icon name="palette" size="md" class="mtb-more__icon" />
        <span>Appearance</span>
      </button>
      <button type="button" class="mtb-more__item" @click="openPanel('account')">
        <span :style="avatarDisc">{{ avatarInitial }}</span>
        <span>Account</span>
      </button>
      <button type="button" class="mtb-more__item" @click="openGithub">
        <Icon name="github" size="md" class="mtb-more__icon" />
        <span>GitHub</span>
      </button>
      <button
        type="button"
        class="mtb-more__item"
        data-testid="more-settings"
        @click="openSettings"
      >
        <Icon name="settings" size="md" class="mtb-more__icon" />
        <span>Settings</span>
      </button>
    </div>
    <div class="mtb-more__sync"><ShellSync inline /></div>
    <div class="mtb-more mtb-more--sections">
      <button
        v-for="t in SECONDARY_TABS"
        :key="t.key"
        type="button"
        class="mtb-more__item"
        :class="{ 'is-on': tab === t.key }"
        @click="go(t.key)"
      >
        <TabGlyph
          :name="t.key"
          :filled="tab === t.key"
          :size="22"
          :col="tab === t.key ? c.accent : c.dim"
          :ko="c.card"
        />
        <span>{{ t.label }}</span>
      </button>
    </div>
  </BottomSheet>

  <BottomSheet :open="panel === 'appearance'" title="Appearance" @close="panel = null">
    <AppearancePanel @pick="panel = null" />
  </BottomSheet>
  <BottomSheet :open="panel === 'account'" title="Account" @close="panel = null">
    <AccountMenu @done="panel = null" />
  </BottomSheet>
</template>

<style scoped>
.mtb {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  align-items: center;
  width: calc(100% - 24px);
  height: 52px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 26px;
  background: var(--glass-bg, var(--theme-card));
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border: 1px solid var(--theme-border);
  /* The rail around it lets taps through to the content; the bar takes them. */
  pointer-events: auto;
  transition:
    transform var(--dur-slide) var(--ease-sheet),
    opacity var(--dur-slide) var(--ease-sheet);
}
.mtb.is-hidden,
.mtb.is-away {
  transform: translateY(calc(100% + 24px + env(safe-area-inset-bottom, 0px)));
  opacity: 0;
  pointer-events: none;
}
.mtb__item {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  min-width: 0;
  -webkit-tap-highlight-color: transparent;
}
.mtb__cap {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  transition: transform 0.15s ease;
}
.mtb__item:active .mtb__cap {
  transform: scale(0.88);
}
.mtb__item.is-on {
  color: var(--theme-accent);
}
.mtb__dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-accent);
}
.mtb-more {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-2);
}
.mtb-more--utils {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.mtb-more--utils .mtb-more__item {
  min-width: 0;
  padding: 8px 2px;
}
.mtb-more--utils .mtb-more__item > span:last-child {
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mtb-more--sections {
  margin-top: var(--sp-2);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--theme-border);
}
.mtb-more__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px;
  border-radius: var(--radius-card);
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  cursor: pointer;
}
.mtb-more__item.is-on {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}
.mtb-more__icon {
  color: var(--theme-accent);
}
.mtb-more__sync {
  display: flex;
  justify-content: center;
}
@media (prefers-reduced-motion: reduce) {
  .mtb,
  .mtb__cap {
    transition: none;
  }
}
</style>
