<script setup lang="ts">
// "What is this symbol worth per point?", asked once (section 28).
//
// Its own component because it is its own decision: the form is about a trade
// and this is about an instrument, it is asked at most once per symbol in the
// account's lifetime, and it is the difference between a P/L and a number that
// merely looks like one. Folded into the form it was forty lines of a
// five-hundred-line file that only ran on a first sighting.
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'

const props = defineProps<{ symbol: string }>()
const emit = defineEmits<{ confirm: [{ symbol: string; size: number }]; dismiss: [] }>()

const size = ref<number | null>(null)
const error = ref('')

watch(
  () => props.symbol,
  () => {
    size.value = null
    error.value = ''
  },
)

function confirm() {
  // Zero is refused rather than accepted and normalised: a contract size of
  // zero reports every trade on the symbol as break-even, which is a silent
  // wrong answer where an error message is a loud right one.
  if (size.value == null || size.value <= 0) {
    error.value = 'Enter the contract size — how much one point is worth per lot.'
    return
  }
  emit('confirm', { symbol: props.symbol, size: size.value })
}
</script>

<template>
  <Modal
    :open="!!symbol"
    :title="`Contract size for ${symbol}`"
    size="sm"
    @close="$emit('dismiss')"
  >
    <p class="ssp__ask">
      How much is one point of {{ symbol }} worth, per lot? Gold is 100, silver 5000, an index 1. It
      is asked once and then remembered.
    </p>
    <FormField label="Contract size" :error="error" v-slot="f">
      <NumberInput v-bind="f" v-model="size" :min="0" :step="1" />
    </FormField>
    <template #footer>
      <Button variant="ghost" @click="$emit('dismiss')">Not now</Button>
      <Button @click="confirm">Save</Button>
    </template>
  </Modal>
</template>

<style scoped>
.ssp__ask {
  margin: 0 0 var(--sp-3);
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
