<script setup lang="ts">
// Pick one of the visible accounts (optionally only one broker's).
import { computed, watch } from 'vue'
import Select from '@/components/ui/Select.vue'
import type { Account } from './types'

const props = defineProps<{ accounts: Account[]; broker?: string }>()
const model = defineModel<string>({ default: '' })

const list = computed(() =>
  props.accounts.filter((a) => !props.broker || a.broker === props.broker),
)
const options = computed(() =>
  list.value.map((a) => ({
    value: a.id,
    label: `${a.broker.toUpperCase()} · ${a.label || a.account_id} · ${a.mode}`,
  })),
)
watch(
  list,
  (l) => {
    if (!l.some((a) => a.id === model.value)) model.value = l[0]?.id ?? ''
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="options.length > 1" class="acct-pick">
    <Select v-model="model" :options="options" size="sm" aria-label="Account" />
  </div>
</template>

<style scoped>
.acct-pick {
  min-width: 0;
  max-width: 420px;
}
</style>
