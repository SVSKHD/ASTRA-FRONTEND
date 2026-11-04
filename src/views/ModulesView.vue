<script setup lang="ts">
// /modules and /modules/:key — the server's modules (GET /api/v1/ui/manifest).
//
// A module with a page of its own (src/modules/overrides.ts) opens that page;
// `?generic=1` shows the generic view anyway. Anything else renders
// generically from the manifest. Signed in like /trading.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import ModulePage from '@/components/modules/ModulePage.vue'
import { isNew, loadManifest, markSeen, moduleState, usable } from '@/modules/manifest'
import { moduleTarget } from '@/modules/overrides'
import { checkSession, signIn, tradingSession } from '@/trading/session'
import '@/components/trading/trading.css'
import '@/components/control/control.css'

const route = useRoute()
const router = useRouter()
const email = ref('')
const passcode = ref('')

onMounted(() => {
  if (!tradingSession.checked || !tradingSession.user) void checkSession()
})

const mods = computed(() => usable(moduleState.manifest, tradingSession.role))
const key = computed(() => String(route.params.key ?? ''))
const current = computed(() => mods.value.find((m) => m.key === key.value) ?? null)
const exists = (path: string) => router.resolve(path).name !== 'not-found'
function target(k: string) {
  return moduleTarget(k, exists)
}

// Opening a module: the custom page wins over the generic view.
watch(
  [current, () => route.query.generic],
  ([m, generic]) => {
    if (!m) return
    markSeen(m.key)
    const t = target(m.key)
    if (t.custom && generic !== '1') void router.replace(t.to)
  },
  { immediate: true },
)
</script>

<template>
  <div class="mv">
    <header class="mv__bar">
      <div class="mv__brand">
        <h1 class="mv__h1">{{ current ? current.title : 'Modules' }}</h1>
        <span class="tp-note">{{
          current?.description || 'Screens the Aureon server offers, built from its API'
        }}</span>
      </div>
      <div class="tp-row">
        <Button v-if="current" variant="ghost" size="sm" @click="router.push('/modules')"
          >All modules</Button
        >
        <Button variant="ghost" size="sm" @click="router.push('/')">Back to Aureon</Button>
      </div>
    </header>

    <div v-if="!tradingSession.checked" class="tp-note mv__pad">Checking your Aureon session…</div>

    <Card v-else-if="!tradingSession.user" title="Sign in to Aureon" class="mv__gate">
      <form class="mv__form" @submit.prevent="signIn(email, passcode)">
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

    <template v-else>
      <Skeleton v-if="moduleState.loading && !moduleState.manifest" :lines="4" />
      <div v-else-if="moduleState.error && !moduleState.manifest" class="mv__error" role="alert">
        <p>{{ moduleState.error }}</p>
        <Button size="sm" variant="ghost" @click="loadManifest()">Retry</Button>
      </div>
      <EmptyState
        v-else-if="!moduleState.available"
        title="This server has no modules yet"
        description="It does not publish a module manifest (GET /api/v1/ui/manifest). Once it does, its modules appear here without an app update."
      />
      <template v-else-if="key && current">
        <ModulePage :module="current" />
      </template>
      <EmptyState
        v-else-if="key"
        title="No such module"
        description="It is not in the server's manifest for your account."
      />
      <EmptyState
        v-else-if="!mods.length"
        title="No modules for your account"
        description="The server publishes none that your role can open."
      />
      <ul v-else class="mv__list" aria-label="Modules">
        <li v-for="m in mods" :key="m.key">
          <RouterLink
            :to="target(m.key).to"
            class="mv__item"
            :data-testid="`module-${m.key}`"
            @click="markSeen(m.key)"
          >
            <span class="mv__name"
              >{{ m.title }}
              <span v-if="isNew(m.key)" class="mv__new">New</span>
            </span>
            <span class="tp-note">{{
              m.description ||
              `${m.views.length} view${m.views.length === 1 ? '' : 's'}${target(m.key).custom ? ' · its own page' : ''}`
            }}</span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.mv {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--sp-4) 16px calc(var(--sp-6) + 96px);
  min-width: 0;
}
.mv__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.mv__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.mv__h1 {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xl);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.mv__gate {
  max-width: 440px;
  align-self: center;
}
.mv__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.mv__pad {
  padding: var(--sp-6) 0;
  text-align: center;
}
.mv__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.mv__error p {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.mv__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.mv__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border, var(--glass-border));
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg, var(--glass-card));
  color: inherit;
  text-decoration: none;
}
.mv__item:hover,
.mv__item:focus-visible {
  border-color: var(--theme-accent);
}
.mv__name {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-weight: var(--weight-semibold);
  overflow-wrap: anywhere;
}
.mv__new {
  padding: 1px 8px;
  border-radius: var(--radius-pill, 999px);
  background: var(--theme-accent);
  color: var(--theme-on-accent, #fff);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
</style>
