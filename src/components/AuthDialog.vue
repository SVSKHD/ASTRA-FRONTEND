<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import Alert from '@/components/ui/Alert.vue'

const auth = useAuthStore()
const { s } = useStyles()
const { authOpen, authReady, authBusy, authError, configurationReady } = storeToRefs(auth)
</script>

<template>
  <template v-if="authOpen">
    <div :style="s.dialogOverlay"></div>
    <div :style="s.authCard">
      <span :style="s.authLogo">AUREON</span>
      <span :style="s.finMeta">Authorized Firebase access only.</span>
      <span v-if="!authReady" :style="s.finMeta">Checking your session…</span>
      <div v-else :style="s.authRow">
        <button
          :style="s.authBtn"
          v-hover-style="s.addBtnHover"
          :disabled="authBusy || !configurationReady"
          aria-label="Continue with Google"
          @click="auth.loginGoogle()"
        >
          <svg width="22" height="22" viewBox="0 0 48 48">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.4 36.6 44 30.9 44 24c0-1.3-.1-2.3-.4-3.5z"
            />
          </svg>
        </button>
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
      <span v-if="authBusy" :style="s.finMeta">Opening secure sign-in…</span>
      <Alert v-if="!configurationReady" tone="warning" title="Firebase setup incomplete" dismissible>
        Add the Firebase and owner allowlist keys from .env.example.
      </Alert>
      <Alert v-else-if="authError" tone="danger" title="Sign-in unavailable" dismissible>
        {{ authError }}
      </Alert>
    </div>
  </template>
</template>
