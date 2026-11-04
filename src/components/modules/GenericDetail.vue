<script setup lang="ts">
// A manifest "detail" view: one record's fields, read with the row's path
// parameters. Secret-looking fields are never shown (src/modules/schema.ts).
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { callView } from '@/modules/request'
import { cell, safeColumns } from '@/modules/schema'
import type { ManifestView } from '@/modules/manifest'

const props = defineProps<{ view: ManifestView; params: Record<string, unknown> }>()

const data = ref<Record<string, unknown> | null>(null)
const loading = ref(false)
const error = ref('')
async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await callView(props.view, { params: props.params })
    if (!r.ok) error.value = r.error
    else data.value = (r.data as Record<string, unknown>) ?? null
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(() => JSON.stringify(props.params), load, { immediate: true })
const fields = computed(() => safeColumns(props.view.fields))
</script>

<template>
  <section class="gdetail" :aria-label="view.title">
    <Skeleton v-if="loading && !data" :lines="4" />
    <div v-else-if="error" class="gdetail__error" role="alert">
      <p>{{ error }}</p>
      <Button size="sm" variant="ghost" @click="load">Retry</Button>
    </div>
    <dl v-else-if="data" class="gdetail__fields">
      <template v-for="f in fields" :key="f.key">
        <dt>{{ f.label }}</dt>
        <dd>{{ cell(data[f.key], f) }}</dd>
      </template>
    </dl>
  </section>
</template>

<style scoped>
.gdetail__fields {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: var(--sp-1) var(--sp-3);
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.gdetail__fields dt {
  min-width: 0;
  color: var(--text-secondary, var(--theme-dim));
}
.gdetail__fields dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.gdetail__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.gdetail__error p {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
