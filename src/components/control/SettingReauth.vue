<script setup lang="ts">
// The admin's password before a secret (or a credential URL) changes. The server
// checks it; it is sent once with the change and never stored here.
import Button from '@/components/ui/Button.vue'
import Modal from '@/components/ui/Modal.vue'
import TextInput from '@/components/ui/TextInput.vue'
import type { SettingWriter } from '@/control/useSettingWriter'

const props = defineProps<{ writer: SettingWriter }>()
const w = props.writer
</script>

<template>
  <Modal
    :open="!!w.pending.value"
    title="Confirm with your password"
    size="sm"
    @close="w.closeReauth"
  >
    <form v-if="w.pending.value" class="cc-form" @submit.prevent="w.confirmReauth">
      <p class="tp-note">
        {{ w.pending.value.action === 'save' ? 'Set' : 'Revert' }}
        <code>{{ w.pending.value.row.key }}</code
        >. The server checks your password before it changes a secret. It is sent once and never
        stored.
      </p>
      <TextInput
        v-model="w.password.value"
        type="password"
        placeholder="Password"
        aria-label="Password"
        autocomplete="current-password"
      />
      <p v-if="w.reauthError.value" class="tp-note" role="alert">{{ w.reauthError.value }}</p>
      <div class="tp-row">
        <Button type="submit" :loading="!!w.busy.value" :disabled="!w.password.value">{{
          w.pending.value.action === 'save' ? 'Save' : 'Revert'
        }}</Button>
        <Button variant="secondary" @click="w.closeReauth">Cancel</Button>
      </div>
    </form>
  </Modal>
</template>
