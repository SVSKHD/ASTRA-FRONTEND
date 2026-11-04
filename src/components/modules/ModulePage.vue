<script setup lang="ts">
// One manifest module, generically: its forms and actions up top, its lists
// (with row actions and a detail panel), any detail view that needs an id,
// and live streams. Every piece has its own loading / empty / error state.
import { computed, ref } from 'vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import GenericAction from './GenericAction.vue'
import GenericDetail from './GenericDetail.vue'
import GenericList from './GenericList.vue'
import GenericStream from './GenericStream.vue'
import type { ManifestModule, ManifestView } from '@/modules/manifest'

const props = defineProps<{ module: ManifestModule }>()

const views = computed(() => props.module.views.filter((v) => v.danger !== 'hidden'))
const lists = computed(() => views.value.filter((v) => v.kind === 'list'))
const details = computed(() => views.value.filter((v) => v.kind === 'detail'))
const streams = computed(() => views.value.filter((v) => v.kind === 'stream'))
const rowActions = computed(() =>
  views.value.filter((v) => (v.kind === 'action' || v.kind === 'form') && v.row),
)
const topActions = computed(() =>
  views.value.filter(
    (v) => (v.kind === 'action' || v.kind === 'form') && !v.row && v.path_params.length === 0,
  ),
)

const listKey = ref(0)
function refresh() {
  listKey.value++
}

// The detail panel: opened from a list row, or by typing the id.
const detailOpen = ref<{ view: ManifestView; params: Record<string, unknown> } | null>(null)
function openRow(list: ManifestView, row: Record<string, unknown>) {
  const view = details.value.find((d) => d.id === list.detail) ?? details.value[0]
  if (!view) return
  const params: Record<string, unknown> = {}
  for (const name of view.path_params)
    params[name] = row[name] ?? row[list.row_key ?? 'id'] ?? row.id
  detailOpen.value = { view, params }
}
const typed = ref<Record<string, string>>({})
function openTyped(view: ManifestView) {
  detailOpen.value = { view, params: { ...typed.value } }
}
const standaloneDetails = computed(() =>
  details.value.filter((d) => !lists.value.some((l) => l.detail === d.id)),
)
</script>

<template>
  <div class="mpage">
    <div v-if="topActions.length" class="mpage__actions">
      <GenericAction v-for="a in topActions" :key="a.id" :view="a" size="md" @done="refresh" />
    </div>

    <Card v-for="l in lists" :key="`${l.id}-${listKey}`" :title="l.title">
      <GenericList :view="l" :row-actions="rowActions" @open="openRow(l, $event)" />
    </Card>

    <Card v-if="detailOpen" :title="detailOpen.view.title">
      <GenericDetail :view="detailOpen.view" :params="detailOpen.params" />
      <Button size="sm" variant="ghost" @click="detailOpen = null">Close</Button>
    </Card>

    <Card v-for="d in standaloneDetails" :key="d.id" :title="d.title">
      <form class="mpage__lookup" @submit.prevent="openTyped(d)">
        <TextInput
          v-for="p in d.path_params"
          :key="p"
          v-model="typed[p]"
          size="sm"
          :placeholder="p.replace(/_/g, ' ')"
          :aria-label="p.replace(/_/g, ' ')"
        />
        <Button type="submit" size="sm" variant="ghost">Open</Button>
      </form>
    </Card>

    <Card v-for="s in streams" :key="s.id" :title="s.title">
      <GenericStream :view="s" />
    </Card>
  </div>
</template>

<style scoped>
.mpage {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.mpage__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.mpage__lookup {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.mpage__lookup > :not(button) {
  flex: 1 1 160px;
  min-width: 0;
}
</style>
