<script setup lang="ts">
// "Send to paper" for one signal (Trading Phase F). It creates a PAPER order
// intent on the server, which runs the risk checks at once. The intent then
// waits for an admin's approval; approval re-runs risk and makes a SIMULATED
// fill. No broker order exists behind any of this. "Approve live" stays off:
// LIVE needs Phase G and written approval.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { isAdmin } from '@/trading/session'
import {
  STATUS_TEXT,
  STATUS_TONE,
  approveIntent,
  createIntent,
  fillLine,
  paperAccounts,
  riskLine,
  signalCorrelationId,
  validQuantity,
  type IntentDetail,
} from '@/trading/paper'
import type { Account, Signal } from './types'

const props = defineProps<{
  signal: Pick<Signal, 'id' | 'instrument_id' | 'side'>
  accounts: Account[]
}>()

const paper = computed(() => paperAccounts(props.accounts))
const accountId = ref('')
const chosen = computed(
  () => paper.value.find((a) => a.id === accountId.value) ?? paper.value[0] ?? null,
)
const side = computed(() => (props.signal.side === 'SELL' ? 'SELL' : 'BUY'))
const options = computed(() =>
  paper.value.map((a) => ({
    value: a.id,
    label: `${a.broker.toUpperCase()} · ${a.label || a.account_id}`,
  })),
)

const open = ref(false)
const quantity = ref('1')
const busy = ref(false)
const error = ref('')
const intent = ref<IntentDetail | null>(null)

async function send() {
  const acct = chosen.value
  if (!acct || !validQuantity(quantity.value)) return
  busy.value = true
  error.value = ''
  try {
    intent.value = await createIntent({
      account_id: acct.id,
      instrument_id: props.signal.instrument_id,
      side: side.value,
      order_type: 'MARKET',
      quantity: quantity.value.trim(),
      signal_id: props.signal.id,
      correlation_id: signalCorrelationId(props.signal.id, acct.id),
    })
    open.value = false
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function approve() {
  if (!intent.value) return
  busy.value = true
  error.value = ''
  try {
    intent.value = await approveIntent(intent.value.id)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="appr" role="group" aria-label="Paper order">
    <div class="appr__row">
      <Button
        v-if="!open && !intent"
        size="sm"
        variant="secondary"
        :disabled="!paper.length"
        :title="
          paper.length
            ? 'Create a PAPER order intent (simulated; risk-checked, then admin approval)'
            : 'No account is in PAPER mode. An admin can switch one under Risk.'
        "
        @click="open = true"
      >
        Send to paper
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled
        title="Live orders need Phase G and written approval"
      >
        Approve live
      </Button>
    </div>

    <form v-if="open" class="appr__form" @submit.prevent="send">
      <Select
        v-if="options.length > 1"
        v-model="accountId"
        :options="options"
        size="sm"
        aria-label="Paper account"
      />
      <TextInput
        v-model="quantity"
        size="sm"
        aria-label="Quantity"
        placeholder="Quantity (units or lots)"
        :error="validQuantity(quantity) ? '' : 'A positive number, e.g. 1 or 0.01'"
      />
      <div class="appr__row">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          :loading="busy"
          :disabled="!validQuantity(quantity)"
        >
          Paper {{ side }} {{ quantity }}
        </Button>
        <Button size="sm" variant="ghost" @click="open = false">Cancel</Button>
      </div>
      <span class="appr__note">
        Simulated only. The server checks risk now and again when an admin approves it.
      </span>
    </form>

    <div v-if="intent" class="appr__result" role="status">
      <Badge :tone="STATUS_TONE[intent.status] ?? 'neutral'" :label="intent.status" />
      <span class="appr__note">{{ STATUS_TEXT[intent.status] ?? intent.status }}</span>
      <span v-if="riskLine(intent)" class="appr__note">{{ riskLine(intent) }}</span>
      <span v-if="fillLine(intent)" class="appr__note">{{ fillLine(intent) }}</span>
      <Button
        v-if="intent.status === 'PENDING_RISK' && isAdmin()"
        size="sm"
        variant="primary"
        :loading="busy"
        @click="approve"
      >
        Approve paper fill
      </Button>
    </div>
    <span v-if="error" class="appr__error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.appr {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-1);
  min-width: 0;
}
.appr__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.appr__form,
.appr__result {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-1);
  min-width: 0;
  max-width: 320px;
}
.appr__note {
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  text-align: right;
  overflow-wrap: anywhere;
  min-width: 0;
}
.appr__error {
  font-size: var(--text-2xs);
  color: var(--theme-danger);
  text-align: right;
  overflow-wrap: anywhere;
  min-width: 0;
}
</style>
