<script setup lang="ts">
// The Dhan connection (backend docs/11-dhan.md, "Log in with the API key").
//
// Compact (the /trading banner): one line with the state and, for admins,
// Connect / Reconnect. Detailed (Settings, Dhan ops): also the verified
// account identity, Refresh and Disconnect with a confirmation.
//
// States come from connectionState() (src/control/dhanSession.ts):
// connected, expires soon, disconnected, expired, invalid (Dhan refused the
// session) and unavailable (the status could not be read). The session token
// never reaches the browser: the server keeps it and only reports whether it is
// valid and until when. The account identity is the registered account's label
// and a masked client id, never a credential.
//
// With `finish-callback` (the Settings page), it also completes a login when
// Dhan sent the browser back here with ?dhan_login=ready (or, from an older server,
// ?dhan_token_id=…), or a login is still waiting after an Aureon sign-in; then removes it from
// the address bar.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import { aureon } from '@/api/client'
import {
  connectionState,
  clearDhanReturn,
  finishLogin,
  formatTime,
  isSafeLoginUrl,
  loadStatus,
  loginRefusal,
  logout,
  maskId,
  pendingDhanReturn,
  readCallback,
  startLogin,
  type AccountCheck,
  type DhanStatus,
} from '@/control/dhanSession'

const props = withDefaults(
  defineProps<{ admin?: boolean; finishCallback?: boolean; detailed?: boolean }>(),
  { admin: false, finishCallback: false, detailed: false },
)
const emit = defineEmits<{ changed: [] }>()

const route = useRoute()
const router = useRouter()
const status = ref<DhanStatus | null>(null)
const readFailed = ref(false)
const loading = ref(false)
const busy = ref<'' | 'start' | 'finish' | 'logout'>('')
const message = ref<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null)
const confirmOut = ref(false)

interface Identity {
  id: string
  label: string | null
  accountId: string
  mode: string
}
const account = ref<Identity | null>(null)
const check = ref<AccountCheck | null>(null)

const conn = computed(() =>
  readFailed.value || status.value ? connectionState(status.value, check.value) : null,
)

/** The registered Dhan account and whether Dhan accepts the session for it (detailed only). */
async function readAccount() {
  account.value = null
  check.value = null
  try {
    const r = await aureon.GET('/api/trading/accounts')
    const a = r.data?.items.find((x) => x.broker === 'dhan' && x.is_active)
    if (!a) return
    account.value = { id: a.id, label: a.label ?? null, accountId: a.account_id, mode: a.mode }
    // Only worth asking Dhan when the server holds a session or token.
    if (status.value && status.value.source !== 'none') {
      const h = await aureon.GET('/api/trading/accounts/{account_id}/health', {
        params: { path: { account_id: a.id } },
      })
      if (h.data) check.value = h.data
    }
  } catch {
    /* identity is optional: the state line still reads from /auth/status */
  }
}

async function refresh() {
  loading.value = true
  try {
    const s = await loadStatus()
    status.value = s
    readFailed.value = !s
  } catch {
    status.value = null
    readFailed.value = true
  }
  if (props.detailed && status.value) await readAccount()
  loading.value = false
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
      // The server's answer is the new state; nothing is assumed.
      status.value = r
      check.value = null
      message.value = {
        tone: 'success',
        text:
          r.source === 'none'
            ? 'Disconnected: the server forgot the Dhan session.'
            : 'The session was forgotten; the server still has a manual access token.',
      }
      emit('changed')
    }
  } catch {
    message.value = { tone: 'danger', text: 'The server could not be reached.' }
  } finally {
    busy.value = ''
    confirmOut.value = false
  }
}

async function completeFromUrl() {
  const cb = readCallback(route.query)
  const resume = pendingDhanReturn()
  if (!cb.ready && !cb.tokenId && !cb.error && !resume) return
  // Drop Dhan's return from the address bar (and history) whatever happens next.
  if (cb.ready || cb.tokenId || cb.error || route.query.dhan_token_id !== undefined) {
    const query = { ...route.query }
    delete query.dhan_token_id
    delete query.dhan_error
    delete query.dhan_login
    void router.replace({ query })
  }
  if (cb.error) {
    clearDhanReturn()
    message.value = { tone: 'danger', text: loginRefusal(cb.error, 'The Dhan login failed.') }
    return
  }
  busy.value = 'finish'
  try {
    const r = await finishLogin(cb.tokenId)
    if ('error' in r) {
      // Keep the marker only while the server still holds the login (e.g. Dhan was briefly
      // unreachable, or the Aureon session ended and the admin signs in again).
      if (!r.retry) clearDhanReturn()
      message.value = { tone: r.retry ? 'warning' : 'danger', text: r.error }
    } else {
      clearDhanReturn()
      status.value = r
      readFailed.value = false
      message.value = { tone: 'success', text: 'Logged in to Dhan.' }
      emit('changed')
    }
  } catch {
    message.value = { tone: 'danger', text: 'The server could not be reached. Try again.' }
  } finally {
    busy.value = ''
  }
}

onMounted(async () => {
  if (props.finishCallback) await completeFromUrl()
  await refresh()
})

defineExpose({ refresh })
</script>

<template>
  <div
    v-if="conn && (detailed || conn.state !== 'not_configured')"
    class="dhan-bar"
    data-testid="dhan-connection"
    :data-state="conn.state"
  >
    <!-- Inline, not <Alert>: Alert lifts only its text into the global warnings strip,
         and the actions here have to stay next to the state. -->
    <section class="dhan-bar__panel" :class="`is-${conn.tone}`" aria-label="Dhan connection">
      <div class="dhan-bar__row">
        <span class="dhan-bar__state">
          <Badge :tone="conn.tone" :label="`Dhan · ${conn.label}`" />
          <span role="status">{{
            busy === 'finish' ? 'Finishing the Dhan login…' : conn.text
          }}</span>
        </span>
        <span class="dhan-bar__actions">
          <Button
            v-if="detailed || conn.state === 'unavailable'"
            size="sm"
            variant="ghost"
            :loading="loading"
            @click="refresh"
            >{{ conn.state === 'unavailable' ? 'Retry' : 'Refresh' }}</Button
          >
          <template v-if="admin">
            <Button
              v-if="conn.canConnect"
              size="sm"
              variant="primary"
              :loading="busy === 'start'"
              @click="login"
              >Connect</Button
            >
            <Button
              v-if="conn.canReconnect"
              size="sm"
              :variant="conn.tone === 'success' ? 'secondary' : 'primary'"
              :loading="busy === 'start'"
              @click="login"
              >Reconnect</Button
            >
            <Button
              v-if="detailed && conn.canDisconnect"
              size="sm"
              variant="ghost"
              :loading="busy === 'logout'"
              @click="confirmOut = true"
              >Disconnect</Button
            >
          </template>
        </span>
      </div>
      <dl v-if="detailed && account" class="dhan-bar__id" data-testid="dhan-identity">
        <div>
          <dt>Account</dt>
          <dd>{{ account.label || 'Dhan account' }}</dd>
        </div>
        <div>
          <dt>Client id</dt>
          <dd>{{ maskId(account.accountId) }}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{{ account.mode }}</dd>
        </div>
        <div>
          <dt>Verified</dt>
          <dd>
            {{
              check?.supported
                ? check.ok
                  ? `by Dhan ${formatTime(check.checked_at) || 'just now'}`
                  : 'refused by Dhan'
                : status?.source === 'none'
                  ? 'no session to check'
                  : 'not checked'
            }}
          </dd>
        </div>
      </dl>
      <p v-else-if="detailed && status?.client_id_set" class="tp-note">
        No Dhan account is registered, so the session cannot be verified against an account.
      </p>
      <p v-if="admin && status?.client_id_set && !status.api_key_configured" class="tp-note">
        Set DHAN_API_KEY and DHAN_API_SECRET (Settings → Dhan) to log in with the API key.
      </p>
    </section>
    <p
      v-if="message"
      class="tp-note"
      :role="message.tone === 'danger' ? 'alert' : 'status'"
      :class="`dhan-bar__msg--${message.tone}`"
    >
      {{ message.text }}
    </p>

    <Modal :open="confirmOut" title="Disconnect Dhan?" size="sm" @close="confirmOut = false">
      <div class="dhan-bar__confirm">
        <p class="tp-note">
          The server forgets the stored Dhan login session. Dhan has no revoke call for API-key
          sessions, so the token itself lapses at its own expiry. Trading data stops refreshing
          until you connect again.
        </p>
        <div class="tp-row">
          <Button variant="danger" :loading="busy === 'logout'" @click="signOut">Disconnect</Button>
          <Button variant="secondary" @click="confirmOut = false">Cancel</Button>
        </div>
      </div>
    </Modal>
  </div>
  <p v-else-if="message" class="tp-note" role="alert">{{ message.text }}</p>
</template>

<style scoped>
.dhan-bar__panel {
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--dhan-tone, var(--theme-accent));
  background: var(--glass-card);
  min-width: 0;
}

.dhan-bar__panel.is-success {
  --dhan-tone: var(--theme-success);
}

.dhan-bar__panel.is-warning {
  --dhan-tone: var(--theme-warning);
}

.dhan-bar__panel.is-danger {
  --dhan-tone: var(--theme-danger);
}

.dhan-bar__panel.is-neutral {
  --dhan-tone: var(--glass-border);
}

.dhan-bar__confirm {
  display: grid;
  gap: var(--sp-2);
}

.dhan-bar {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
}

.dhan-bar__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  justify-content: space-between;
}

.dhan-bar__state {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  min-width: 0;
  overflow-wrap: anywhere;
}

.dhan-bar__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.dhan-bar__id {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
  gap: var(--sp-2);
  margin: var(--sp-2) 0 0;
}

.dhan-bar__id dt {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.dhan-bar__id dd {
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
</style>
