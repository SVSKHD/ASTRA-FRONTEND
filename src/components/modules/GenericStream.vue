<script setup lang="ts">
// A manifest "stream" view: a live list of the named events from the view's
// SSE endpoint (same origin, cookie session), newest first, the last 50.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { apiUrl } from '@/api/config'
import { openStream, type StreamHandle, type StreamStatus } from '@/api/sse'
import { cell, safeColumns } from '@/modules/schema'
import type { ManifestView } from '@/modules/manifest'

const props = defineProps<{ view: ManifestView }>()
const KEEP = 50

type Row = { at: string; event: string; data: Record<string, unknown> }
const rows = ref<Row[]>([])
const status = ref<StreamStatus>('connecting')
const columns = computed(() => safeColumns(props.view.columns))
let handle: StreamHandle | null = null

onMounted(() => {
  handle = openStream(apiUrl(props.view.path), {
    events: props.view.events?.length ? props.view.events : ['message'],
    onEvent: (e) => {
      let data: Record<string, unknown>
      try {
        data = JSON.parse(e.data) as Record<string, unknown>
      } catch {
        data = { value: e.data }
      }
      rows.value = [{ at: new Date().toISOString(), event: e.event, data }, ...rows.value].slice(
        0,
        KEEP,
      )
    },
    onStatus: (s) => (status.value = s),
  })
})
onBeforeUnmount(() => handle?.close())

const STATUS: Record<string, string> = {
  connecting: 'Connecting…',
  open: 'Live',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
}
</script>

<template>
  <section class="gstream" :aria-label="view.title">
    <p class="gstream__status" role="status">{{ STATUS[status] ?? status }}</p>
    <EmptyState
      v-if="!rows.length"
      title="Waiting for events"
      description="New events appear here as they happen."
    />
    <ul v-else class="gstream__rows" aria-live="polite">
      <li v-for="(r, i) in rows" :key="`${r.at}-${i}`" class="gstream__row">
        <span class="gstream__event">{{ r.event }}</span>
        <span v-if="columns.length" class="gstream__cells">
          <span v-for="c in columns" :key="c.key">{{ c.label }}: {{ cell(r.data[c.key], c) }}</span>
        </span>
        <code v-else class="gstream__raw">{{ JSON.stringify(r.data).slice(0, 160) }}</code>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.gstream {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.gstream__status {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--text-secondary, var(--theme-dim));
}
.gstream__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.gstream__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2);
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--theme-dim) 8%, transparent);
  font-size: var(--text-xs);
}
.gstream__event {
  font-weight: var(--weight-semibold);
}
.gstream__cells {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
}
.gstream__raw {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
