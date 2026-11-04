<script setup lang="ts">
// A phone-first page on the Aureon server (/images, /ai/costs, /github-ai, /agents-hub):
// a title bar with the way back, the Aureon sign-in when there is no session (the same
// session /trading uses — one sign-in, not a second auth system), and the page itself
// once signed in. `admin` pages say so to non-admins instead of failing call by call.
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { checkSession, isAdmin, signIn, tradingSession } from '@/trading/session'
import '@/components/trading/trading.css'
import '@/components/control/control.css'

defineProps<{
  title: string
  subtitle?: string
  /** What signing in gives access to, for the sign-in card. */
  gateText?: string
  admin?: boolean
}>()

const router = useRouter()
const email = ref('')
const passcode = ref('')
onMounted(() => {
  if (!tradingSession.checked || !tradingSession.user) void checkSession()
})
</script>

<template>
  <div class="ap">
    <header class="ap__bar">
      <div class="ap__brand">
        <h1 class="ap__h1">{{ title }}</h1>
        <span v-if="subtitle" class="tp-note">{{ subtitle }}</span>
      </div>
      <div class="ap__actions">
        <slot name="actions" />
        <Button variant="ghost" size="sm" @click="router.push('/')">Back to Aureon</Button>
      </div>
    </header>

    <div v-if="!tradingSession.checked" class="tp-note ap__pad">Checking your Aureon session…</div>

    <Card v-else-if="!tradingSession.user" title="Sign in to Aureon" class="ap__gate">
      <p class="tp-note">
        {{ gateText ?? 'This page reads from the Aureon server. Sign in to use it.' }}
      </p>
      <form class="ap__form" @submit.prevent="signIn(email, passcode)">
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

    <EmptyState
      v-else-if="admin && !isAdmin()"
      title="Admins only"
      description="This page shows server-wide data. Sign in with an admin account to open it."
    />

    <slot v-else />
  </div>
</template>

<style scoped>
.ap {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--sp-4) 16px calc(var(--sp-6) + 96px);
  min-width: 0;
}
.ap__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  min-width: 0;
}
.ap__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ap__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.ap__h1 {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xl);
  color: var(--text-primary);
}
.ap__gate {
  max-width: 440px;
  align-self: center;
}
.ap__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.ap__pad {
  padding: var(--sp-6) 0;
  text-align: center;
}
</style>
