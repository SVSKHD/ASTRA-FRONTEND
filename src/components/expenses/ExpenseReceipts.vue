<script setup lang="ts">
// Receipts on one expense, kept on the Aureon server (migration stage 6).
//
// The files live on the server's data disk, attached to the expense row by its
// id, and are deleted with it. The same strip as the workspace transactions
// (AttachmentStrip), so a receipt looks the same wherever it is attached.
import { ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Alert from '@/components/ui/Alert.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import AttachmentStrip from '@/components/finance/AttachmentStrip.vue'
import {
  deleteFinanceAttachment,
  listFinanceAttachments,
  uploadFinanceAttachment,
} from '@/services/attachments'
import { amount2 } from '@/utils/format'
import type { Attachment } from '@/utils/attachments'
import type { Expense } from '@/types'

const props = defineProps<{ expense: Expense | null }>()
const emit = defineEmits<{ close: [] }>()

const files = ref<Attachment[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')

async function load(id: string): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    files.value = await listFinanceAttachments('expenses', id)
  } catch (err) {
    files.value = []
    error.value = err instanceof Error ? err.message : 'Could not load the receipts.'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.expense?.id,
  (id) => {
    files.value = []
    if (id) void load(id)
  },
  { immediate: true },
)

async function add(picked: File[]): Promise<void> {
  const id = props.expense?.id
  if (!id) return
  busy.value = true
  error.value = ''
  const problems: string[] = []
  for (const file of picked) {
    const { attachment, error: problem } = await uploadFinanceAttachment('expenses', id, file)
    if (attachment) files.value = [attachment, ...files.value]
    if (problem) problems.push(problem)
  }
  error.value = problems.join(' ')
  busy.value = false
}

async function remove(attachmentId: string): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await deleteFinanceAttachment(attachmentId)
    files.value = files.value.filter((f) => f.id !== attachmentId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not delete the receipt.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Modal :open="expense !== null" title="Receipts" size="sm" @close="emit('close')">
    <div v-if="expense" class="rcpt">
      <p class="rcpt__what">
        {{ expense.category }} · {{ expense.date }} · {{ amount2(expense.amount) }}
      </p>
      <Alert v-if="error" tone="danger">{{ error }}</Alert>
      <Skeleton v-if="loading" height="48px" />
      <template v-else>
        <p v-if="!files.length" class="rcpt__empty">No receipt is attached to this expense yet.</p>
        <AttachmentStrip :attachments="files" :busy="busy" @add="add" @remove="remove" />
      </template>
    </div>
  </Modal>
</template>

<style scoped>
.rcpt {
  display: grid;
  gap: var(--sp-3);
  min-width: 0;
}
.rcpt__what,
.rcpt__empty {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
}
</style>
