<script setup lang="ts">
// "Approve paper fill" through the approval engine (backend Phase 20).
//
// Approving needs the admin's password, which the server checks (re-auth): with
// it, and a policy that needs one approval, the simulated fill happens at once.
// "Send to the inbox" files the request without a password, to be approved on
// /dev/inbox (where a second admin can approve when the policy asks for two).
// Either way a 202 shows where the request waits.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { approveIntent, type ApprovalFiled, type IntentDetail } from '@/trading/paper'

const props = defineProps<{ intentId: string; loading?: boolean }>()
const emit = defineEmits<{ filled: [IntentDetail]; filed: [ApprovalFiled] }>()
const router = useRouter()

const open = ref(false)
const password = ref('')
const busy = ref(false)
const error = ref('')
const filed = ref<ApprovalFiled | null>(null)

async function run(withPassword: boolean) {
  if (withPassword && !password.value) return
  busy.value = true
  error.value = ''
  try {
    const r = await approveIntent(props.intentId, withPassword ? password.value : undefined)
    open.value = false
    if (r.kind === 'filled') emit('filled', r.intent)
    else {
      filed.value = r.approval
      emit('filed', r.approval)
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    password.value = ''
    busy.value = false
  }
}
</script>

<template>
  <div class="papr">
    <Button
      v-if="!filed"
      size="sm"
      variant="primary"
      :loading="loading || busy"
      @click="((open = true), (error = ''))"
    >
      Approve paper fill
    </Button>
    <template v-else>
      <span class="papr__note" role="status"
        >Waiting in the approval inbox ({{ filed.received_approvals }} of
        {{ filed.required_approvals }} approvals).</span
      >
      <Button
        size="sm"
        variant="secondary"
        @click="router.push({ path: '/dev/inbox', query: { id: filed.approval_id } })"
        >Open in the approval inbox</Button
      >
    </template>
    <span v-if="error && !open" class="papr__note" role="alert">{{ error }}</span>

    <Modal :open="open" title="Approve the paper fill" size="sm" @close="open = false">
      <form class="papr__form" @submit.prevent="run(true)">
        <p class="papr__note">
          Simulated only. The server checks your password, re-runs risk, then fills on paper. The
          password is sent once and never stored.
        </p>
        <TextInput
          v-model="password"
          type="password"
          placeholder="Password"
          aria-label="Password"
        />
        <p v-if="error" class="papr__note" role="alert">{{ error }}</p>
        <div class="papr__row">
          <Button type="submit" variant="primary" :loading="busy" :disabled="!password"
            >Approve and fill</Button
          >
          <Button variant="ghost" :disabled="busy" @click="run(false)">Send to the inbox</Button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<style scoped>
.papr,
.papr__form {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-1);
  min-width: 0;
}
.papr__form {
  align-items: stretch;
  gap: var(--sp-2);
}
.papr__row {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.papr__note {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  min-width: 0;
}
</style>
