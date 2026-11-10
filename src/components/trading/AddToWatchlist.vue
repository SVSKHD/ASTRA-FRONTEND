<script setup lang="ts">
// Add one instrument to a named watchlist (src/trading/watchlists.ts): pick a
// list, or name a new one. The lists live on this device until the backend
// watchlist API exists, and this says so.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { STORAGE_NOTE, watchlistStore } from '@/trading/watchlists'
import type { Instrument } from '@/trading/instruments'

const props = defineProps<{ instrument: Instrument }>()

const store = watchlistStore()
const NEW = '__new__'
const listId = ref(store.lists[0]?.id ?? NEW)
const newName = ref('')
const message = ref('')
const error = ref('')

const options = computed(() => [
  ...store.lists.map((l) => ({
    value: l.id,
    label: `${l.name} (${l.items.length})`,
  })),
  { value: NEW, label: 'New list…' },
])
const onLists = computed(() =>
  store.lists.filter((l) => l.items.some((i) => i.id === props.instrument.id)).map((l) => l.name),
)

function add() {
  message.value = ''
  error.value = ''
  try {
    const list =
      listId.value === NEW
        ? store.create(newName.value)
        : store.lists.find((l) => l.id === listId.value)
    if (!list) throw new Error('That watchlist no longer exists.')
    const already = list.items.some((i) => i.id === props.instrument.id)
    store.add(list.id, {
      id: props.instrument.id,
      symbol: props.instrument.symbol,
      broker: props.instrument.broker,
    })
    listId.value = list.id
    newName.value = ''
    message.value = already ? `Already on ${list.name}.` : `Added to ${list.name}.`
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <form class="atw" aria-label="Add to watchlist" @submit.prevent="add">
    <div class="atw__row">
      <Select
        v-model="listId"
        :options="options"
        size="sm"
        class="atw__select"
        aria-label="Watchlist"
      />
      <TextInput
        v-if="listId === NEW"
        v-model="newName"
        size="sm"
        placeholder="New list name"
        aria-label="New list name"
        class="atw__name"
      />
      <Button type="submit" size="sm" variant="secondary">Add to watchlist</Button>
    </div>
    <p v-if="message" class="tp-note" role="status">{{ message }}</p>
    <p v-if="error" class="tp-note atw__error" role="alert">{{ error }}</p>
    <p v-if="onLists.length" class="tp-note">On: {{ onLists.join(', ') }}</p>
    <p class="tp-note">{{ STORAGE_NOTE[store.storage] }}</p>
  </form>
</template>

<style scoped>
.atw {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.atw__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  min-width: 0;
}
.atw__select,
.atw__name {
  flex: 1 1 140px;
  min-width: 0;
}
.atw__error {
  color: var(--theme-danger);
}
</style>
