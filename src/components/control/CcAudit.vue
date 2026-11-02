<script setup lang="ts">
// The audit log (backend Phase 20, GET /api/v1/audit/events): newest first,
// paged, filtered by an event-type prefix and an actor id. An older server
// answers 404, and this page then says what it is waiting for (D-21-9).
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { aureon } from '@/api/client'
import { must, type Schemas } from '@/control/api'
import { when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

type AuditEvent = Schemas['AuditEventOut']

const PAGE = 50
const eventType = ref('')
const actor = ref('')
const offset = ref(0)
const missing = ref(false)

const events = useLoad(async () => {
  const r = await aureon.GET('/api/v1/audit/events', {
    params: {
      query: {
        limit: PAGE,
        offset: offset.value,
        ...(eventType.value.trim() ? { event_type: eventType.value.trim() } : {}),
        ...(actor.value.trim() ? { actor_user_id: actor.value.trim() } : {}),
      },
    },
  })
  missing.value = r.response.status === 404
  return missing.value ? null : must(r)
})
watch(offset, () => void events.reload())
function apply() {
  if (offset.value) offset.value = 0
  else void events.reload()
}
const total = computed(() => events.data.value?.total ?? 0)
const hasNext = computed(() => offset.value + PAGE < total.value)
function details(e: AuditEvent): string {
  return Object.entries(e.details ?? {})
    .slice(0, 6)
    .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}
</script>

<template>
  <div class="tp-page">
    <EmptyState
      v-if="missing"
      title="The audit log needs backend Phase 20"
      description="This server has no /api/v1/audit/events. Deploy the approval engine (Phase 20) and this page fills in."
    />
    <template v-else>
      <form class="tp-row" @submit.prevent="apply">
        <TextInput
          v-model="eventType"
          size="sm"
          placeholder="Event type prefix, e.g. approval_"
          aria-label="Event type"
        />
        <TextInput
          v-model="actor"
          size="sm"
          placeholder="Actor user id"
          aria-label="Actor user id"
        />
        <Button size="sm" type="submit" variant="secondary">Filter</Button>
      </form>
      <Card title="Audit events">
        <ul v-if="events.data.value?.items.length" class="tp-list">
          <li v-for="e in events.data.value.items" :key="e.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ e.event_type }}</span>
              <span class="tp-note"
                >{{ e.actor_email ?? e.actor_user_id ?? 'system' }} · {{ when(e.created_at)
                }}{{ e.ip ? ` · ${e.ip}` : '' }}</span
              >
              <span v-if="details(e)" class="tp-note">{{ details(e) }}</span>
            </div>
          </li>
        </ul>
        <p v-else-if="events.error.value" class="tp-note" role="alert">{{ events.error.value }}</p>
        <p v-else-if="!events.loading.value" class="tp-note">No audit events match.</p>
      </Card>
      <div v-if="offset > 0 || hasNext" class="tp-row">
        <Button
          size="sm"
          variant="ghost"
          :disabled="offset === 0"
          @click="offset = Math.max(0, offset - PAGE)"
          >Previous</Button
        >
        <span class="tp-note tp-num"
          >{{ offset + 1 }}–{{ offset + (events.data.value?.items.length ?? 0)
          }}{{ ` of ${total}` }}</span
        >
        <Button size="sm" variant="ghost" :disabled="!hasNext" @click="offset += PAGE">Next</Button>
      </div>
    </template>
  </div>
</template>
