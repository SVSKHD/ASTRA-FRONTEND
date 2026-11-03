<script setup lang="ts">
// /dev — the control center (Phase 21). One admin-only page over Aureon's
// GitHub, Actions, agents, self-repair, review and approval APIs.
//
// It reuses the trading panel's Aureon sign-in gate (src/trading/session.ts):
// signed out it asks for the Aureon passcode, signed in as a non-admin it says
// the page is for admins, and only an admin sees the modules. Each module is a
// lazy chunk. On a phone the modules sit in a bottom bar (four plus "More");
// from 768 px up they are a tab strip under the header.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Alert from '@/components/ui/Alert.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TextInput from '@/components/ui/TextInput.vue'
import RepoPicker from '@/components/control/RepoPicker.vue'
import { checkSession, isAdmin, signIn, tradingSession } from '@/trading/session'
import { inbox as paperInbox, loadInbox as loadPaperInbox } from '@/trading/inbox'
import { approvals, startApprovals, stopApprovals } from '@/control/approvals'
import { loadRepos } from '@/control/repos'
import { MODULES, PHONE_NAV, type ModuleKey } from '@/control/modules'
import { useVoiceNav } from '@/control/voice'
import '@/components/trading/trading.css'
import '@/components/control/control.css'

// Modules land one PR at a time; the nav lists only the ones that have a page.
const PAGES: Partial<Record<ModuleKey, ReturnType<typeof defineAsyncComponent>>> = {
  github: defineAsyncComponent(() => import('@/components/control/CcGithub.vue')),
  repo: defineAsyncComponent(() => import('@/components/control/CcRepo.vue')),
  issues: defineAsyncComponent(() => import('@/components/control/CcIssues.vue')),
  pulls: defineAsyncComponent(() => import('@/components/control/CcPulls.vue')),
  reviews: defineAsyncComponent(() => import('@/components/control/CcReviews.vue')),
  actions: defineAsyncComponent(() => import('@/components/control/CcActions.vue')),
  agents: defineAsyncComponent(() => import('@/components/control/CcAgents.vue')),
  repairs: defineAsyncComponent(() => import('@/components/control/CcRepairs.vue')),
  inbox: defineAsyncComponent(() => import('@/components/control/CcInbox.vue')),
  audit: defineAsyncComponent(() => import('@/components/control/CcAudit.vue')),
}
const AVAILABLE = MODULES.filter((m) => PAGES[m.value])
const NAV = PHONE_NAV.filter((m) => PAGES[m])

const route = useRoute()
const router = useRouter()
const current = computed<ModuleKey>(() => {
  const m = String(route.params.module ?? '')
  return (AVAILABLE.some((x) => x.value === m) ? m : 'github') as ModuleKey
})
const meta = computed(() => MODULES.find((m) => m.value === current.value)!)
function go(m: string) {
  more.value = false
  void router.push(m === 'github' ? '/dev' : `/dev/${m}`)
}

// Paper intents count only when the engine does not already carry them.
const paperInEngine = computed(() => approvals.items.some((a) => a.kind.startsWith('trading')))
const pending = computed(
  () => approvals.items.length + (paperInEngine.value ? 0 : paperInbox.items.length),
)
const tabs = computed(() =>
  AVAILABLE.map((m) => ({
    value: m.value,
    label: m.value === 'inbox' && pending.value ? `${m.label} (${pending.value})` : m.label,
  })),
)
const more = ref(false)

const email = ref('')
const passcode = ref('')
const admin = computed(() => !!tradingSession.user && isAdmin())

watch(
  admin,
  (yes) => {
    if (yes) {
      void loadRepos()
      void startApprovals()
      void loadPaperInbox()
    } else stopApprovals()
  },
  { immediate: true },
)
// Voice: one tap, one phrase, then (at most) a navigation. See src/control/voice.ts.
const voiceMsg = ref('')
const voice = useVoiceNav({
  go: (r) => router.push(r),
  say: (m) => (voiceMsg.value = m),
})
function toggleVoice() {
  voiceMsg.value = ''
  voice.toggle()
}

onMounted(() => void checkSession())
onBeforeUnmount(stopApprovals)
</script>

<template>
  <div class="cc">
    <header class="cc__bar">
      <div class="cc__brand">
        <h1 class="cc__h1">Control center</h1>
        <span class="tp-note">Aureon · credentials stay on the server</span>
      </div>
      <div v-if="admin" class="tp-row">
        <RepoPicker v-if="meta.repo" />
        <Button
          v-if="voice.supported"
          size="sm"
          :variant="voice.state.value === 'listening' ? 'tinted' : 'ghost'"
          :loading="voice.state.value === 'resolving'"
          :aria-pressed="voice.state.value === 'listening'"
          title="Voice navigation: say “open approvals”, “open PR 42”, “show agents”. It only opens screens. Your browser recognises the speech (Google on Android Chrome, Apple on iPhone)."
          @click="toggleVoice"
          >{{ voice.state.value === 'listening' ? 'Listening…' : 'Voice' }}</Button
        >
        <Button variant="ghost" size="sm" @click="router.push('/')">Back to Aureon</Button>
      </div>
    </header>

    <div v-if="!tradingSession.checked" class="tp-note cc__pad">Checking your Aureon session…</div>

    <Card v-else-if="!tradingSession.user" title="Sign in to Aureon" class="cc__gate">
      <p class="tp-note">
        The control center reads from the self-hosted Aureon server. Sign in with your Aureon email
        and passcode.
      </p>
      <form class="cc__form" @submit.prevent="signIn(email, passcode)">
        <TextInput v-model="email" type="email" placeholder="Email" aria-label="Email" />
        <TextInput
          v-model="passcode"
          type="password"
          placeholder="Passcode"
          aria-label="Passcode"
        />
        <Button type="submit" variant="primary" :loading="tradingSession.busy">Sign in</Button>
      </form>
      <Alert v-if="tradingSession.error" tone="danger">{{ tradingSession.error }}</Alert>
    </Card>

    <Card v-else-if="!admin" title="Admins only" class="cc__gate">
      <p class="tp-note">
        The control center is for admins. You are signed in as {{ tradingSession.user.email }},
        whose role is {{ tradingSession.role || 'unknown' }}.
      </p>
      <Button variant="ghost" @click="router.push('/')">Back to Aureon</Button>
    </Card>

    <template v-else>
      <div class="cc__tabs">
        <Tabs
          :model-value="current"
          :tabs="tabs"
          aria-label="Control center modules"
          @update:model-value="go"
        />
      </div>
      <p v-if="voiceMsg" class="tp-note" role="status" aria-live="polite">{{ voiceMsg }}</p>
      <Alert v-if="tradingSession.error" tone="warning">{{ tradingSession.error }}</Alert>
      <main class="cc__main">
        <component :is="PAGES[current]" />
      </main>

      <nav class="cc__nav" aria-label="Control center">
        <Button
          v-for="m in NAV"
          :key="m"
          size="sm"
          :variant="current === m ? 'tinted' : 'ghost'"
          :count="m === 'inbox' ? pending : undefined"
          @click="go(m)"
          >{{ MODULES.find((x) => x.value === m)!.short }}</Button
        >
        <Button size="sm" variant="ghost" @click="more = true">More</Button>
      </nav>
      <BottomSheet :open="more" title="Modules" @close="more = false">
        <div class="cc__sheet">
          <Button
            v-for="m in AVAILABLE"
            :key="m.value"
            block
            :variant="current === m.value ? 'tinted' : 'ghost'"
            :count="m.value === 'inbox' ? pending : undefined"
            @click="go(m.value)"
            >{{ m.label }}</Button
          >
        </div>
      </BottomSheet>
    </template>
  </div>
</template>

<style scoped>
.cc {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--sp-4) 16px calc(var(--sp-6) + 64px);
  min-width: 0;
}
.cc__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  min-width: 0;
}
.cc__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cc__h1 {
  margin: 0;
  font-size: var(--text-xl);
  color: var(--text-primary);
  min-width: 0;
}
.cc__gate {
  max-width: 440px;
  align-self: center;
}
.cc__form,
.cc__sheet {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.cc__main {
  min-width: 0;
}
.cc__pad {
  padding: var(--sp-6) 0;
  text-align: center;
}
.cc__tabs {
  display: none;
  min-width: 0;
}
.cc__nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  justify-content: space-around;
  gap: var(--sp-1);
  padding: var(--sp-2) 8px calc(var(--sp-2) + env(safe-area-inset-bottom, 0px));
  background: var(--glass-raised, var(--glass-card));
  border-top: 1px solid var(--glass-border);
  min-width: 0;
}
@media (min-width: 768px) {
  .cc {
    padding-bottom: var(--sp-6);
  }
  .cc__tabs {
    display: block;
  }
  .cc__nav {
    display: none;
  }
}
</style>
