<script setup lang="ts">
// A manifest "list" view: the declared columns, as cards (one per row, so it
// reads on a phone without sideways scrolling), with pagination and the
// view's filters. Filters and the page live in the URL query, so a filtered
// list is a link. Row actions (views with `row: true`) sit on each card.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import GenericAction from './GenericAction.vue'
import { callView, pick } from '@/modules/request'
import { cell, safeColumns } from '@/modules/schema'
import type { ManifestView } from '@/modules/manifest'

const props = withDefaults(
  defineProps<{
    view: ManifestView
    rowActions?: ManifestView[]
    pageSize?: number
  }>(),
  { rowActions: () => [], pageSize: 20 },
)
const emit = defineEmits<{ open: [row: Record<string, unknown>] }>()

const route = useRoute()
const router = useRouter()

const columns = computed(() => safeColumns(props.view.columns))
const filters = computed(() => props.view.filters ?? [])
const q = (name: string) => {
  const v = route.query[name]
  return typeof v === 'string' ? v : ''
}
const page = computed(() => Math.max(1, Number(q('page')) || 1))
const draft = ref<Record<string, string>>(
  Object.fromEntries(filters.value.map((f) => [f.name, q(f.name)])),
)

const rows = ref<Record<string, unknown>[]>([])
const total = ref<number | null>(null)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  const query: Record<string, unknown> = {}
  for (const f of filters.value) if (q(f.name)) query[f.name] = q(f.name)
  const p = props.view.pagination
  if (p?.style === 'offset') {
    query[p.limit] = props.pageSize
    query[p.offset] = (page.value - 1) * props.pageSize
  } else if (p?.style === 'page') {
    query[p.page] = page.value
    query[p.per_page] = props.pageSize
  }
  try {
    const r = await callView(props.view, { query })
    if (!r.ok) {
      error.value = r.error
      rows.value = []
      return
    }
    const items = pick(r.data, props.view.items_path)
    rows.value = Array.isArray(items) ? (items as Record<string, unknown>[]) : []
    const t = pick(r.data, props.view.total_path ?? undefined)
    total.value = typeof t === 'number' ? t : null
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(() => [props.view.path, JSON.stringify(route.query)], load, { immediate: true })

function applyFilters() {
  const query: Record<string, string> = { ...(route.query as Record<string, string>) }
  for (const f of filters.value) {
    if (draft.value[f.name]) query[f.name] = draft.value[f.name]
    else delete query[f.name]
  }
  delete query.page
  void router.replace({ query })
}
function goPage(n: number) {
  void router.replace({ query: { ...route.query, page: n > 1 ? String(n) : undefined } })
}
const hasNext = computed(() =>
  total.value !== null
    ? page.value * props.pageSize < total.value
    : !!props.view.pagination && rows.value.length >= props.pageSize,
)

/** A row's path parameters for its actions: by name, else the row key / id. */
function paramsFor(row: Record<string, unknown>, action: ManifestView): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const name of action.path_params) {
    out[name] = row[name] ?? row[props.view.row_key ?? 'id'] ?? row.id
  }
  return out
}
const title = (row: Record<string, unknown>) =>
  columns.value[0] ? cell(row[columns.value[0].key], columns.value[0]) : ''
</script>

<template>
  <section class="glist" :aria-label="view.title">
    <form v-if="filters.length" class="glist__filters" @submit.prevent="applyFilters">
      <TextInput
        v-for="f in filters"
        :key="f.name"
        v-model="draft[f.name]"
        size="sm"
        :placeholder="f.name.replace(/_/g, ' ')"
        :aria-label="`Filter by ${f.name.replace(/_/g, ' ')}`"
      />
      <Button type="submit" size="sm" variant="ghost">Filter</Button>
    </form>

    <div v-if="loading && !rows.length" aria-hidden="true" class="glist__skel">
      <Skeleton v-for="n in 3" :key="n" height="64px" radius="var(--radius-card)" />
    </div>
    <div v-else-if="error" class="glist__error" role="alert">
      <p>{{ error }}</p>
      <Button size="sm" variant="ghost" @click="load">Retry</Button>
    </div>
    <EmptyState
      v-else-if="!rows.length"
      title="Nothing here"
      description="The server returned an empty list."
    />
    <ul v-else class="glist__rows">
      <li v-for="(row, i) in rows" :key="String(row[view.row_key ?? 'id'] ?? i)" class="glist__row">
        <div class="glist__head">
          <span class="glist__title">{{ title(row) }}</span>
          <Button v-if="view.detail" size="sm" variant="ghost" @click="emit('open', row)"
            >Details</Button
          >
        </div>
        <dl class="glist__fields">
          <template v-for="c in columns.slice(1)" :key="c.key">
            <dt>{{ c.label }}</dt>
            <dd>{{ cell(row[c.key], c) }}</dd>
          </template>
        </dl>
        <div v-if="rowActions.length" class="glist__actions">
          <GenericAction
            v-for="a in rowActions"
            :key="a.id"
            :view="a"
            :params="paramsFor(row, a)"
            @done="load"
          />
        </div>
      </li>
    </ul>

    <nav v-if="page > 1 || hasNext" class="glist__pager" aria-label="Pages">
      <Button size="sm" variant="ghost" :disabled="page <= 1" @click="goPage(page - 1)"
        >Previous</Button
      >
      <span class="glist__note"
        >Page {{ page
        }}{{ total !== null ? ` of ${Math.max(1, Math.ceil(total / pageSize))}` : '' }}</span
      >
      <Button size="sm" variant="ghost" :disabled="!hasNext" @click="goPage(page + 1)">Next</Button>
    </nav>
  </section>
</template>

<style scoped>
.glist {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.glist__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.glist__filters > :not(button) {
  flex: 1 1 160px;
  min-width: 0;
}
.glist__skel,
.glist__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.glist__row {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border, var(--glass-border));
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg, var(--glass-card));
}
.glist__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.glist__title {
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  overflow-wrap: anywhere;
}
.glist__fields {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px var(--sp-3);
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
}
.glist__fields dt {
  color: var(--text-secondary, var(--theme-dim));
}
.glist__fields dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.glist__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}
.glist__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-sm);
}
.glist__error p {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.glist__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
}
.glist__note {
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
