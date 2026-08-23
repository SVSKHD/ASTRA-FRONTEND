<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useLockStore } from '@/stores/lock'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import Icon from '@/components/ui/Icon.vue'

const auth = useAuthStore()
const lock = useLockStore()
const { c, s } = useStyles()
const { locked, lockBusy, lockError, pinSetupRequired } = storeToRefs(lock)

const pin = ref('')
const confirmation = ref('')
const neverLock = ref(false)

const visible = computed(() => locked.value || pinSetupRequired.value)
const title = computed(() => (pinSetupRequired.value ? 'Create your PIN' : 'Aureon is locked'))
const subtitle = computed(() =>
  pinSetupRequired.value
    ? 'Set a private 4–8 digit PIN before using your workspace.'
    : 'Enter your PIN to continue.',
)

const inputStyle = computed(() =>
  pxify({
    width: '100%',
    padding: '13px 15px',
    borderRadius: 'var(--radius-dialog)',
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    color: c.value.text,
    ...typeStep('md'),
    textAlign: 'center',
    letterSpacing: '0.35em',
  }),
)
const checkRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-dialog)',
    background: c.value.input,
    color: c.value.text,
    ...typeStep('xs'),
    textAlign: 'left',
  }),
)
const errorStyle = computed(() =>
  pxify({ ...typeStep('xs'), color: 'oklch(0.68 0.2 25)', lineHeight: 1.45 }),
)

watch(visible, () => {
  pin.value = ''
  confirmation.value = ''
  lock.clearError()
})

async function submit() {
  const success = pinSetupRequired.value
    ? await lock.setPin(pin.value, confirmation.value, neverLock.value)
    : await lock.unlock(pin.value)
  if (success) {
    pin.value = ''
    confirmation.value = ''
  }
}
</script>

<template>
  <template v-if="visible">
    <div :style="s.dialogOverlay"></div>
    <form :style="s.authCard" @submit.prevent="submit">
      <Icon name="lock" size="xl" />
      <span :style="s.authLogo">{{ title }}</span>
      <span :style="s.finMeta">{{ subtitle }}</span>

      <input
        v-model="pin"
        :style="inputStyle"
        type="password"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="8"
        autocomplete="current-password"
        aria-label="PIN"
        placeholder="••••"
        autofocus
      />
      <input
        v-if="pinSetupRequired"
        v-model="confirmation"
        :style="inputStyle"
        type="password"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="8"
        autocomplete="new-password"
        aria-label="Confirm PIN"
        placeholder="Confirm PIN"
      />

      <label v-if="pinSetupRequired" :style="checkRow">
        <input v-model="neverLock" type="checkbox" />
        <span>Do not auto-lock this app</span>
      </label>

      <span v-if="lockError" :style="errorStyle">{{ lockError }}</span>
      <button :style="s.addBtn2" type="submit" :disabled="lockBusy">
        {{ lockBusy ? 'Checking…' : pinSetupRequired ? 'Save PIN' : 'Unlock' }}
      </button>
      <button :style="s.authGuest" type="button" @click="auth.signOut()">Sign out</button>
    </form>
  </template>
</template>
