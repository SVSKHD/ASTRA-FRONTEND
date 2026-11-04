<script setup lang="ts">
// /images — the image studio on its own page, for any signed-in Aureon user
// (the images API is per user, not admin-only). The same studio is a module of
// the control center; this is the phone-first way in. It signs in to Aureon
// like /trading does.
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import TextInput from '@/components/ui/TextInput.vue'
import CcImages from '@/components/control/CcImages.vue'
import { checkSession, signIn, tradingSession } from '@/trading/session'
import '@/components/trading/trading.css'
import '@/components/control/control.css'

const router = useRouter()
const email = ref('')
const passcode = ref('')
onMounted(() => {
  if (!tradingSession.checked || !tradingSession.user) void checkSession()
})
</script>

<template>
  <div class="iv">
    <header class="iv__bar">
      <div class="iv__brand">
        <h1 class="iv__h1">Images</h1>
        <span class="tp-note">Generated on the Aureon server · nothing leaves it</span>
      </div>
      <Button variant="ghost" size="sm" @click="router.push('/')">Back to Aureon</Button>
    </header>

    <div v-if="!tradingSession.checked" class="tp-note iv__pad">Checking your Aureon session…</div>

    <Card v-else-if="!tradingSession.user" title="Sign in to Aureon" class="iv__gate">
      <p class="tp-note">
        Images are generated and kept on the Aureon server. Sign in to use them.
      </p>
      <form class="iv__form" @submit.prevent="signIn(email, passcode)">
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

    <CcImages v-else />
  </div>
</template>

<style scoped>
.iv {
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
.iv__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  min-width: 0;
}
.iv__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.iv__h1 {
  margin: 0;
  font-size: var(--text-xl);
  color: var(--text-primary);
}
.iv__gate {
  max-width: 440px;
  align-self: center;
}
.iv__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.iv__pad {
  padding: var(--sp-6) 0;
  text-align: center;
}
</style>
