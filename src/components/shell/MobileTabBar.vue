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
import { computed, ref } from 'vue'
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
import type { TabKey } from '@/types'

const ui = useUiStore()
const app = useAppStore()
const auth = useAuthStore()
const { tab, moreSheetOpen, sheetTodoId, now } = storeToRefs(ui)
const { avatarMenuOpen, avatarInitial, avatarColor } = storeToRefs(auth)
const { c } = useStyles()

const SHORT: Partial<Record<TabKey, string>> = { reminders: 'Remind', finances: 'Finance' }
const moreActive = computed(() => SECONDARY_TABS.some((t) => t.key === tab.value))
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
function openPanel(name: 'appearance' | 'account') {
  ui.setMoreSheet(false)
  panel.value = name
}
function openGithub() {
  ui.setMoreSheet(false)
  auth.openGithubPanel()
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
  <nav class="mtb" :class="{ 'is-hidden': hidden }" aria-label="Sections">
    <button
      v-for="t in PRIMARY_TABS"
      :key="t.key"
      type="button"
      class="mtb__item"
      :class="{ 'is-on': tab === t.key }"
      :aria-current="tab === t.key ? 'page' : undefined"
      @click="go(t.key)"
    >
      <span class="mtb__cap">
        <TabGlyph
          :name="t.key"
          :filled="tab === t.key"
          :size="21"
          :col="tab === t.key ? c.accent : c.dim"
          :ko="c.card"
        />
        <span v-if="badges[t.key]" class="mtb__dot"></span>
      </span>
      <span class="mtb__label">{{ SHORT[t.key] ?? t.label }}</span>
    </button>
    <button
      type="button"
      class="mtb__item"
      :class="{ 'is-on': moreActive || moreSheetOpen }"
      :aria-expanded="moreSheetOpen"
      @click="ui.setMoreSheet(!moreSheetOpen)"
    >
      <span class="mtb__cap"><Icon name="more-horizontal" size="md" /></span>
      <span class="mtb__label">More</span>
    </button>
  </nav>

  <BottomSheet :open="moreSheetOpen" title="More" @close="ui.setMoreSheet(false)">
    <!-- What the desktop's bottom pill holds, first: four controls and the
         sync status, above the fold of a 360px sheet. -->
    <div class="mtb-more mtb-more--utils" role="group" aria-label="Workspace">
      <button type="button" class="mtb-more__item" @click="openNotes">
        <Icon name="notebook" size="md" class="mtb-more__icon" />
        <span>Notes</span>
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
  height: 64px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 32px;
  background: var(--glass-bg, var(--theme-card));
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border: 1px solid var(--theme-border);
  transition: transform var(--dur-slide) var(--ease-sheet);
}
.mtb.is-hidden {
  transform: translateY(120px);
}
.mtb__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  min-width: 0;
}
.mtb__cap {
  position: relative;
  width: 44px;
  height: 32px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  transition: background 0.2s ease;
}
.mtb__item.is-on {
  color: var(--theme-accent);
}
.mtb__item.is-on .mtb__cap {
  background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
}
.mtb__label {
  font-size: var(--text-2xs);
  line-height: 1;
  white-space: nowrap;
}
.mtb__dot {
  position: absolute;
  top: 2px;
  right: 8px;
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
  grid-template-columns: repeat(4, 1fr);
}
.mtb-more--utils .mtb-more__item {
  padding: 8px 4px;
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
  .mtb {
    transition: none;
  }
}
</style>
