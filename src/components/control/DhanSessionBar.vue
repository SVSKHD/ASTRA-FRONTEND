<script setup lang="ts">
// The Dhan session banner (backend docs/11-dhan.md, "Log in with the API key"):
// "Dhan session expires at …", or "expired: trading data is stale", plus the
// "Log in to Dhan" button for admins. Used on /dev/settings and /trading.
//
// With `finish-callback` (the Settings page), it also completes a login when
// Dhan sent the browser back here with ?dhan_token_id=…, then removes it from
// the address bar. The session token itself never reaches the browser.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import {
  finishLogin,
  isSafeLoginUrl,
  loadStatus,
  loginRefusal,
  logout,
  readCallback,
  startLogin,
  summarize,
  type DhanStatus,
} from '@/control/dhanSession'

const props = withDefaults(defineProps<{ admin?: boolean; finishCallback?: boolean }>(), {
  admin: false,
  finishCallback: false,
})
const emit = defineEmits<{ changed: [] }>()

const route = useRoute()
const router = useRouter()
const status = ref<DhanStatus | null>(null)
const busy = ref<'' | 'start' | 'finish' | 'logout'>('')
const message = ref<{ tone: 'success' | 'danger'; text: string } | null>(null)

const summary = computed(() => (status.value ? summarize(status.value) : null))

async function refresh() {
  try {
    status.value = await loadStatus()
  } catch {
    status.value = null
  }
}

async function login() {
  busy.value = 'start'
  message.value = null
  try {
    const r = await startLogin()
    if ('url' in r && isSafeLoginUrl(r.url)) {
      globalThis.location.assign(r.url)
      return
    }
    message.value = {
      tone: 'danger',
      text: 'error' in r ? r.error : 'The server returned an unexpected login page.',
    }
  } catch {
    message.value = { tone: 'danger', text: 'The server could not be reached.' }
  }
  busy.value = ''
}

async function signOut() {
  busy.value = 'logout'
  try {
    const r = await logout()
    if ('error' in r) message.value = { tone: 'danger', text: r.error }
    else {
      status.value = r
      message.value = { tone: 'success', text: 'Logged out of Dhan.' }
      emit('changed')
    }
  } finally {
    busy.value = ''
  }
}

async function completeFromUrl() {
  const cb = readCallback(route.query)
  if (!cb.tokenId && !cb.error) return
  // Drop the one-time id from the address bar (and history) whatever happens next.
  const query = { ...route.query }
  delete query.dhan_token_id
  delete query.dhan_error
  void router.replace({ query })
  if (cb.error) {
    message.value = { tone: 'danger', text: loginRefusal(cb.error, 'The Dhan login failed.') }
    return
  }
  busy.value = 'finish'
  try {
    const r = await finishLogin(cb.tokenId!)
    if ('error' in r) message.value = { tone: 'danger', text: r.error }
    else {
      status.value = r
      message.value = { tone: 'success', text: 'Logged in to Dhan.' }
      emit('changed')
    }
  } catch {
    message.value = { tone: 'danger', text: 'The server could not be reached.' }
  } finally {
    busy.value = ''
  }
}

onMounted(async () => {
  if (props.finishCallback) await completeFromUrl()
  if (!status.value) await refresh()
})
</script>

<template>
  <div v-if="summary && status?.client_id_set" class="dhan-bar">
    <Alert :tone="summary.tone === 'neutral' ? 'info' : summary.tone">
      <div class="dhan-bar__row">
        <span role="status">{{
          busy === 'finish' ? 'Finishing the Dhan login…' : summary.text
        }}</span>
        <span v-if="admin" class="dhan-bar__actions">
          <Button
            size="sm"
            :variant="summary.needsLogin ? 'primary' : 'secondary'"
            :loading="busy === 'start'"
            :disabled="!status.api_key_configured"
            :title="status.api_key_configured ? '' : 'Set DHAN_API_KEY and DHAN_API_SECRET first'"
            @click="login"
            >Log in to Dhan</Button
          >
          <Button
            v-if="status.source === 'session'"
            size="sm"
            variant="ghost"
            :loading="busy === 'logout'"
            @click="signOut"
            >Log out</Button
          >
        </span>
      </div>
      <p v-if="admin && !status.api_key_configured" class="tp-note">
        Set DHAN_API_KEY and DHAN_API_SECRET (Settings → Dhan) to log in with the API key.
      </p>
    </Alert>
    <p
      v-if="message"
      class="tp-note"
      :role="message.tone === 'danger' ? 'alert' : 'status'"
      :class="`dhan-bar__msg--${message.tone}`"
    >
      {{ message.text }}
    </p>
  </div>
  <p v-else-if="message" class="tp-note" role="alert">{{ message.text }}</p>
</template>

<style scoped>
.dhan-bar {
  display: grid;
  gap: var(--sp-2);
}

.dhan-bar__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  justify-content: space-between;
}

.dhan-bar__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
</style>
