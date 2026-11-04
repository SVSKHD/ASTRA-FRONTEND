<script setup lang="ts">
// One manifest operation as a button (or a form, for kind "form").
//
//   danger "none"     — runs on the tap (a form: on submit).
//   danger "confirm"  — asks first, in the manifest's words.
//   danger "approval" — the server gates it with the approval engine: the tap
//                       files an approval request, the answer (202) is shown as
//                       "waiting for approval" with a link to the inbox, and it
//                       is never reported as done.
//   danger "hidden"   — never rendered (the server does not list it either).
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import ApprovalRequired from '@/components/control/ApprovalRequired.vue'
import GenericForm from './GenericForm.vue'
import { fieldsOf } from '@/modules/schema'
import { callView, type CallResult } from '@/modules/request'
import type { ManifestView } from '@/modules/manifest'

const props = withDefaults(
  defineProps<{
    view: ManifestView
    /** Path parameters (a row's id). */
    params?: Record<string, unknown>
    size?: 'sm' | 'md'
  }>(),
  { params: () => ({}), size: 'sm' },
)
const emit = defineEmits<{ done: [result: CallResult] }>()

const hasInput = computed(() => fieldsOf(props.view.request_schema).length > 0)
const needsDialog = computed(
  () => props.view.kind === 'form' || hasInput.value || props.view.danger !== 'none',
)
const open = ref(false)
const busy = ref(false)
const result = ref<CallResult | null>(null)

const label = computed(() =>
  props.view.danger === 'approval' ? `${props.view.title} (needs approval)` : props.view.title,
)
const warning = computed(() => {
  if (props.view.danger === 'approval') {
    return 'This files an approval request. Nothing runs until an admin approves it with their password in the approval inbox.'
  }
  if (props.view.danger === 'confirm') return props.view.confirm || 'Are you sure?'
  return ''
})

async function run(body?: Record<string, unknown>) {
  busy.value = true
  result.value = null
  try {
    const r = await callView(props.view, {
      params: props.params,
      body: props.view.method === 'GET' ? undefined : (body ?? (hasInput.value ? {} : undefined)),
    })
    result.value = r
    if (r.ok && !r.gated) {
      open.value = false
      emit('done', r)
    }
  } catch (e) {
    result.value = { ok: false, status: 0, data: null, error: (e as Error).message, gated: null }
  } finally {
    busy.value = false
  }
}

function tap() {
  result.value = null
  if (needsDialog.value) open.value = true
  else void run()
}
</script>

<template>
  <span v-if="view.danger !== 'hidden'" class="gact">
    <Button
      :size="size"
      :variant="view.danger === 'approval' ? 'tinted' : view.kind === 'form' ? 'primary' : 'ghost'"
      :loading="busy && !open"
      :data-testid="`action-${view.id}`"
      @click="tap"
      >{{ label }}</Button
    >
    <span v-if="result && !open && !result.ok" class="gact__err" role="alert">{{
      result.error
    }}</span>
    <Modal :open="open" :title="view.title" size="sm" @close="open = false">
      <div class="gact__body">
        <p v-if="warning" class="gact__warn" :class="`is-${view.danger}`">{{ warning }}</p>
        <ApprovalRequired v-if="result?.gated" :gated="result.gated" />
        <template v-else>
          <GenericForm
            v-if="hasInput || view.kind === 'form'"
            :schema="view.request_schema"
            :busy="busy"
            :submit-label="view.danger === 'approval' ? 'Request approval' : view.title"
            @submit="run"
          />
          <div v-else class="gact__row">
            <Button
              :variant="view.danger === 'approval' ? 'tinted' : 'danger'"
              size="sm"
              :loading="busy"
              data-testid="action-confirm"
              @click="run()"
              >{{ view.danger === 'approval' ? 'Request approval' : 'Yes, go ahead' }}</Button
            >
            <Button variant="ghost" size="sm" @click="open = false">Cancel</Button>
          </div>
        </template>
        <p v-if="result && !result.ok" class="gact__err" role="alert">{{ result.error }}</p>
      </div>
    </Modal>
  </span>
</template>

<style scoped>
.gact {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
.gact__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.gact__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.gact__warn {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.gact__warn.is-approval {
  font-weight: var(--weight-semibold);
}
.gact__err {
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-danger, inherit);
  overflow-wrap: anywhere;
}
</style>
