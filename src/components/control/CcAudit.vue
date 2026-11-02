<script setup lang="ts">
// The audit log (backend Phase 20, GET /api/v1/audit/events): paged, filtered by
// event type and actor. Until that endpoint exists on the server it answers
// 404, and this page says what it is waiting for instead of showing nothing.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { failureOf, rawGet } from '@/control/api'
import { when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

interface AuditEvent {
  id: number | string
  event_type?: string
  event?: string
  actor?: string | null
  user_id?: string | null
  at?: string
  created_at?: string
  occurred_at?: string
  target?: string | null
  details?: Record<string, unknown>
}
interface AuditPage {
  items: AuditEvent[]
  total?: number
  limit?: number
  offset?: number
}

const PAGE = 50
const eventType = ref('')
const actor = ref('')
const offset = ref(0)
const missing = ref(false)

const events = useLoad(async () => {
  try {
    const body = await rawGet<AuditPage | AuditEvent[]>('/api/v1/audit/events', {
      limit: PAGE,
      offset: offset.value,
      event_type: eventType.value.trim() || undefined,
      actor: actor.value.trim() || undefined,
    })
    missing.value = false
    return Array.isArray(body) ? { items: body } : body
  } catch (e) {
    if (failureOf(e).status === 404) {
      missing.value = true
      return null
    }
    throw e
  }
})
watch(offset, () => void events.reload())
function apply() {
  if (offset.value) offset.value = 0
  else void events.reload()
}
const total = computed(() => events.data.value?.total)
const hasNext = computed(() =>
  total.value != null
    ? offset.value + PAGE < total.value
    : (events.data.value?.items.length ?? 0) === PAGE,
)
function details(e: AuditEvent): string {
  const d = e.details ?? {}
  return Object.entries(d)
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
      description="This server has no /api/v1/audit/events yet. Deploy the approval engine (Phase 20) and this page fills in."
    />
    <template v-else>
      <form class="tp-row" @submit.prevent="apply">
        <TextInput
          v-model="eventType"
          size="sm"
          placeholder="Event type, e.g. approval_executed"
          aria-label="Event type"
        />
        <TextInput v-model="actor" size="sm" placeholder="Actor" aria-label="Actor" />
        <Button size="sm" type="submit" variant="secondary">Filter</Button>
      </form>
      <Card title="Audit events">
        <ul v-if="events.data.value?.items.length" class="tp-list">
          <li v-for="e in events.data.value.items" :key="e.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ e.event_type ?? e.event ?? 'event' }}</span>
              <span class="tp-note"
                >{{ e.actor ?? e.user_id ?? 'system' }} ·
                {{ when(e.at ?? e.occurred_at ?? e.created_at)
                }}{{ e.target ? ` · ${e.target}` : '' }}</span
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
          }}{{ total != null ? ` of ${total}` : '' }}</span
        >
        <Button size="sm" variant="ghost" :disabled="!hasNext" @click="offset += PAGE">Next</Button>
      </div>
    </template>
  </div>
</template>
