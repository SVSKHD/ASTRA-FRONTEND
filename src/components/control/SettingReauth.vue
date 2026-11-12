<script setup lang="ts">
// The admin's password before a secret (or a credential URL) changes. The server
// checks it; it is sent once with the change and never stored here.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { labelOf } from '@/control/settings'
import type { SettingWriter } from '@/control/useSettingWriter'

const props = defineProps<{ writer: SettingWriter }>()
const w = props.writer
const what = computed(() => {
  const p = w.pending.value
  if (!p) return ''
  return `${p.action === 'save' ? 'Save' : 'Revert'} ${labelOf(p.row.key)}`
})
</script>

<template>
  <Modal :open="!!w.pending.value" title="Confirm it’s you" size="sm" @close="w.closeReauth">
    <form v-if="w.pending.value" class="sr" @submit.prevent="w.confirmReauth">
      <div class="sr__what">
        <Icon name="shield-check" size="sm" />
        <span>
          <strong>{{ what }}</strong>
          <code class="sr__key">{{ w.pending.value.row.key }}</code>
        </span>
      </div>
      <p class="sr__note">
        The server checks your password before it changes a credential. It is sent once with this
        change and never stored.
      </p>
      <TextInput
        v-model="w.password.value"
        type="password"
        label="Your password"
        placeholder="Password"
        aria-label="Password"
        autocomplete="current-password"
      />
      <p v-if="w.reauthError.value" class="sr__error" role="alert">{{ w.reauthError.value }}</p>
      <div class="sr__actions">
        <Button variant="ghost" @click="w.closeReauth">Cancel</Button>
        <Button type="submit" :loading="!!w.busy.value" :disabled="!w.password.value">{{
          w.pending.value.action === 'save' ? 'Save' : 'Revert'
        }}</Button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.sr {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.sr__what {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  color: var(--text-primary);
}
.sr__what > span {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sr__key {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.sr__note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.sr__error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-danger);
}
.sr__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
</style>
