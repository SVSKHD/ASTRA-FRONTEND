<script setup lang="ts">
// The sign-in card: email + passcode (Supabase password sign-in).
//
// Google sign-in is off for now and will be wired back later, together with
// the Google Calendar connection that rides on it. There is no "create
// account" here on purpose — the owner's account is made once in the Supabase
// dashboard, and the allowlist decides who may use the app. With a single
// allowed email the address is filled in, so signing in is typing a passcode.
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ownerEmail, useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'

const auth = useAuthStore()
const { s } = useStyles()
const { authOpen, authReady, authBusy, authError, configurationReady } = storeToRefs(auth)

const email = ref(ownerEmail)
const passcode = ref('')

async function submit() {
  await auth.loginWithPasscode(email.value, passcode.value)
  // Cleared either way: a wrong passcode should not sit in the field, and a
  // right one has no business staying in memory after it worked.
  passcode.value = ''
}

const form = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  width: '100%',
  maxWidth: 300,
})
const orRow = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' })
</script>

<template>
  <template v-if="authOpen">
    <div :style="s.dialogOverlay"></div>
    <div :style="s.authCard">
      <span :style="s.authLogo">AUREON</span>
      <span :style="s.finMeta">Owner access only.</span>
      <span v-if="!authReady" :style="s.finMeta">Checking your session…</span>
      <template v-else>
        <form :style="form" @submit.prevent="submit">
          <TextInput
            v-model="email"
            type="email"
            aria-label="Email"
            placeholder="Email"
            autocomplete="username"
            :disabled="authBusy || !configurationReady"
          />
          <TextInput
            v-model="passcode"
            type="password"
            aria-label="Passcode"
            placeholder="Passcode"
            autocomplete="current-password"
            :disabled="authBusy || !configurationReady"
          />
          <Button
            type="submit"
            block
            :loading="authBusy"
            :disabled="!passcode || !email || !configurationReady"
          >
            Sign in
          </Button>
        </form>
        <div :style="orRow">
          <span :style="s.finMeta">or</span>
          <button
            :style="s.authBtn"
            v-hover-style="s.addBtnHover"
            :disabled="authBusy || !configurationReady"
            aria-label="Continue with GitHub"
            @click="auth.loginGithub()"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 .5C5.4.5 0 5.9 0 12.6c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0C17.3 5 18.3 5.3 18.3 5.3c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0024 12.6C24 5.9 18.6.5 12 .5z"
              />
            </svg>
          </button>
        </div>
      </template>
      <span v-if="authBusy" :style="s.finMeta">Signing in…</span>
      <Alert v-if="!configurationReady" tone="warning" title="Sign-in setup incomplete" dismissible>
        Add the Supabase and owner allowlist keys from .env.example.
      </Alert>
      <Alert v-else-if="authError" tone="danger" title="Sign-in unavailable" dismissible>
        {{ authError }}
      </Alert>
    </div>
  </template>
</template>
