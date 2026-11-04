<script setup lang="ts">
// The account menu: who is signed in, the four workspace switches, and the
// actions that leave this screen (lock, security, GitHub, sign out). Drawn in
// the bottom pill's popover on a desktop and in a bottom sheet on a phone.
//
// `done` fires after any action that navigates away, so the host can close
// whatever it drew the menu in.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useLockStore } from '@/stores/lock'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import Checkbox from '@/components/ui/Checkbox.vue'
import { isNew, markSeen, moduleState, usable } from '@/modules/manifest'
import { moduleTarget } from '@/modules/overrides'
import { tradingSession } from '@/trading/session'

const emit = defineEmits<{ done: [] }>()

const auth = useAuthStore()
const app = useAppStore()
const lock = useLockStore()
const { c } = useStyles()
const { avatarName, avatarSub, ghMenuLabel } = storeToRefs(auth)
const { security, autoRollover, hideCompleted, reminderSound } = storeToRefs(app)

function onLockNow() {
  auth.avatarMenuOpen = false
  lock.lockNow()
  emit('done')
}
function openSecurity() {
  auth.openSecurityPanel()
  emit('done')
}
function openGithub() {
  auth.openGithubPanel()
  emit('done')
}
// "Modules": what the Aureon server publishes (src/modules/manifest.ts). A
// module new since this browser last looked carries a "New" badge.
const router = useRouter()
const modules = computed(() => usable(moduleState.manifest, tradingSession.role))
const MAX_MODULES = 6
function openModule(key: string) {
  markSeen(key)
  void router.push(moduleTarget(key, (p) => router.resolve(p).name !== 'not-found').to)
  emit('done')
}
function allModules() {
  void router.push('/modules')
  emit('done')
}

function signOut() {
  void auth.signOut()
  emit('done')
}

// --- styles -------------------------------------------------------------------
const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 2 })
const who = pxify({ padding: '6px 8px' })
const nameStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    whiteSpace: 'nowrap',
  }),
)
const subStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
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
</script>

<template>
  <div :style="wrap" class="account-menu">
    <div :style="who">
      <div :style="nameStyle">{{ avatarName }}</div>
      <div :style="subStyle">{{ avatarSub }}</div>
    </div>
    <label :style="menuToggle">
      <Checkbox
        :model-value="security.autoLockEnabled"
        @update:model-value="lock.setAutoLock($event)"
      />
      <span>Auto-lock after 50 min</span>
    </label>
    <label :style="menuToggle">
      <Checkbox :model-value="autoRollover" @update:model-value="app.setAutoRollover($event)" />
      <span>Auto-roll overdue to today</span>
    </label>
    <label :style="menuToggle">
      <Checkbox :model-value="hideCompleted" @update:model-value="app.setHideCompleted($event)" />
      <span>Hide completed items</span>
    </label>
    <label :style="menuToggle">
      <Checkbox :model-value="reminderSound" @update:model-value="app.setReminderSound($event)" />
      <span>Reminder sound</span>
    </label>
    <template v-if="modules.length">
      <div class="menu-heading">Modules</div>
      <button
        v-for="m in modules.slice(0, MAX_MODULES)"
        :key="m.key"
        type="button"
        class="menu-item"
        :data-testid="`menu-module-${m.key}`"
        @click="openModule(m.key)"
      >
        {{ m.title }}
        <span v-if="isNew(m.key)" class="menu-new">New: {{ m.title }}</span>
      </button>
      <button type="button" class="menu-item" @click="allModules">All modules…</button>
    </template>
    <button type="button" class="menu-item" @click="onLockNow">Lock now</button>
    <button type="button" class="menu-item" @click="openSecurity">Security &amp; devices</button>
    <button type="button" class="menu-item" @click="openGithub">{{ ghMenuLabel }}</button>
    <button type="button" class="menu-item" @click="signOut">Sign out</button>
  </div>
</template>

<style scoped>
.menu-item {
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: var(--radius-card);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  text-align: left;
  cursor: pointer;
}
.menu-item:hover {
  background: var(--theme-card);
}
.menu-heading {
  padding: 8px 10px 2px;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.menu-new {
  margin-left: var(--sp-2);
  padding: 1px 8px;
  border-radius: var(--radius-pill, 999px);
  background: var(--theme-accent);
  color: var(--theme-on-accent, #fff);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
</style>
