<script setup lang="ts">
// The execution audit trail: the server's most recent audit events — who did what, when.
// Details are shown as the server recorded them (it redacts secrets before storing).
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { aureon } from '@/api/client'
import { must, useLoad } from '@/trading/useLoad'
import { ago } from '@/trading/format'

const props = withDefaults(defineProps<{ limit?: number; eventType?: string }>(), { limit: 20 })
const filter = ref(props.eventType ?? '')
const events = useLoad(async () =>
  must(
    await aureon.GET('/api/v1/audit/events', {
      params: {
        query: {
          limit: props.limit,
          ...(filter.value.trim() ? { event_type: filter.value.trim() } : {}),
        },
      },
    }),
  ),
)
const label = (t: string) => t.replaceAll('_', ' ')
function summary(d: unknown): string {
  if (!d || typeof d !== 'object') return ''
  return Object.entries(d as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ')
}
</script>

<template>
  <Card title="Audit history" data-testid="audit">
    <form class="ah__filter" @submit.prevent="events.reload()">
      <TextInput
        v-model="filter"
        size="sm"
        placeholder="Event type, e.g. code_task_approved"
        aria-label="Event type"
      />
      <Button type="submit" size="sm" variant="ghost" :loading="events.loading.value"
        >Filter</Button
      >
    </form>
    <p v-if="events.error.value" class="tp-note" role="alert">{{ events.error.value }}</p>
    <ul v-else-if="events.data.value?.items.length" class="tp-list">
      <li v-for="e in events.data.value.items" :key="e.id" class="tp-item">
        <div class="tp-main">
          <span class="tp-strong">{{ label(e.event_type) }}</span>
          <span class="tp-note">{{ e.actor_email ?? 'system' }} · {{ ago(e.created_at) }}</span>
          <span v-if="summary(e.details)" class="tp-note ah__details">{{
            summary(e.details)
          }}</span>
        </div>
      </li>
    </ul>
    <p v-else-if="!events.loading.value" class="tp-note">
      No audit events{{ filter ? ' of that type' : '' }}.
    </p>
  </Card>
</template>

<style scoped>
.ah__filter {
  display: flex;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
  min-width: 0;
}
.ah__filter > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}
.ah__details {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
