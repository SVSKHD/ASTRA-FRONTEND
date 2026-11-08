<script setup lang="ts">
// "Register Dhan account" on the Dhan operations page (src/control/dhanAccount.ts).
//
// Shown while no active Dhan account is registered. The admin types their own
// Dhan Client ID; nothing is read from the server's settings and no token, key
// or secret is asked for. The account list is re-read before posting, so a
// second registration is never sent. The server creates the account in OBSERVE
// mode (read-only, no orders); the confirmation shows the mode the server
// returned. Login, feed, reconciliation and approvals are untouched.
import { reactive, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import FormField from '@/components/ui/FormField.vue'
import Modal from '@/components/ui/Modal.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { aureon } from '@/api/client'
import {
  BASE_CURRENCY,
  CLIENT_ID_MAX,
  DEFAULT_LABEL,
  LABEL_MAX,
  register,
  type Account,
  type FieldErrors,
} from '@/control/dhanAccount'
import { maskId } from '@/control/dhanSession'

const emit = defineEmits<{ registered: [account: Account]; exists: [] }>()

const open = ref(false)
const busy = ref(false)
const draft = reactive({ clientId: '', label: DEFAULT_LABEL })
const errors = ref<FieldErrors>({})
const message = ref<{ tone: 'danger' | 'warning'; text: string } | null>(null)
const done = ref<Account | null>(null)

function start() {
  draft.clientId = ''
  draft.label = DEFAULT_LABEL
  errors.value = {}
  message.value = null
  open.value = true
}

async function submit() {
  busy.value = true
  message.value = null
  errors.value = {}
  try {
    const r = await register(
      {
        list: () => aureon.GET('/api/trading/accounts', { params: { query: { limit: 500 } } }),
        create: (body) => aureon.POST('/api/trading/accounts', { body }),
      },
      draft,
    )
    if (r.kind === 'registered') {
      done.value = r.account
      open.value = false
      draft.clientId = ''
      emit('registered', r.account)
    } else if (r.kind === 'invalid') {
      errors.value = r.errors
      message.value = { tone: 'danger', text: r.text }
    } else if (r.kind === 'exists') {
      message.value = { tone: 'warning', text: r.text }
      emit('exists')
    } else {
      message.value = { tone: 'danger', text: r.text }
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Card title="Dhan account" data-testid="dhan-account-register">
    <template v-if="done">
      <p class="tp-note" role="status" data-testid="dhan-account-done">
        Registered {{ done.label || 'Dhan account' }} ({{ maskId(done.account_id) }}).
      </p>
      <div class="tp-row">
        <span class="tp-note">Execution mode</span>
        <Badge tone="info" :label="done.mode" data-testid="dhan-account-mode" />
      </div>
      <p class="tp-note">
        OBSERVE is read-only: Aureon reads data and signals for this account and places no order.
        Live trading stays off.
      </p>
    </template>
    <template v-else>
      <p class="tp-note">
        No active Dhan account is registered, so the session and feed cannot be checked against an
        account. Register the account with your Dhan Client ID. It starts in OBSERVE mode
        (read-only, no orders).
      </p>
      <p
        v-if="message && !open"
        class="tp-note"
        :role="message.tone === 'danger' ? 'alert' : 'status'"
      >
        {{ message.text }}
      </p>
      <div class="tp-row">
        <Button size="sm" variant="primary" data-testid="dhan-account-open" @click="start"
          >Register Dhan account</Button
        >
      </div>
    </template>

    <Modal :open="open" title="Register Dhan account" size="sm" @close="open = false">
      <form class="cc-form" novalidate data-testid="dhan-account-form" @submit.prevent="submit">
        <FormField
          v-slot="f"
          label="Dhan Client ID"
          required
          :error="errors.clientId"
          hint="From your Dhan profile. No password, token or API key is needed here."
        >
          <TextInput
            v-bind="f"
            v-model="draft.clientId"
            :maxlength="CLIENT_ID_MAX"
            autocomplete="off"
            inputmode="text"
            data-testid="dhan-client-id"
          />
        </FormField>
        <FormField v-slot="f" label="Label" :error="errors.label">
          <TextInput
            v-bind="f"
            v-model="draft.label"
            :maxlength="LABEL_MAX"
            autocomplete="off"
            data-testid="dhan-label"
          />
        </FormField>
        <dl class="cc-dhan-acct__facts">
          <div>
            <dt>Broker</dt>
            <dd>Dhan</dd>
          </div>
          <div>
            <dt>Base currency</dt>
            <dd>{{ BASE_CURRENCY }}</dd>
          </div>
          <div>
            <dt>Execution mode</dt>
            <dd>OBSERVE (read-only, set by the server)</dd>
          </div>
        </dl>
        <p class="tp-note">
          Use the Client ID the server's Dhan settings are set up with: Dhan logins and account
          checks are verified against it on the server, which this page never reads.
        </p>
        <p
          v-if="message"
          class="tp-note"
          :role="message.tone === 'danger' ? 'alert' : 'status'"
          data-testid="dhan-account-message"
        >
          {{ message.text }}
        </p>
        <div class="tp-row">
          <Button type="submit" variant="primary" :loading="busy" data-testid="dhan-account-submit"
            >Register</Button
          >
          <Button variant="secondary" :disabled="busy" @click="open = false">Cancel</Button>
        </div>
      </form>
    </Modal>
  </Card>
</template>

<style scoped>
.cc-dhan-acct__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
  gap: var(--sp-2);
  margin: 0;
}

.cc-dhan-acct__facts dt {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.cc-dhan-acct__facts dd {
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
</style>
