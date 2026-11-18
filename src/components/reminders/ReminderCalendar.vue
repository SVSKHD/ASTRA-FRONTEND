<script setup lang="ts">
// A saved reminder's Google Calendar: where it stands, and the one action that
// moves it on (add, update, reconnect), with remove and "open in Google" beside.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { buildGCalUrl } from '@/utils/reminders'
import type { Reminder } from '@/types'

const props = defineProps<{ reminder: Reminder }>()
const app = useAppStore()
const { calendarNeedsAuth } = storeToRefs(app)

const STATUS: Record<string, { label: string; tone: 'ok' | 'busy' | 'bad' | 'idle' }> = {
  synced: { label: 'In Google Calendar', tone: 'ok' },
  pending: { label: 'Syncing…', tone: 'busy' },
  error: { label: 'Sync failed', tone: 'bad' },
  local: { label: 'Only in this app', tone: 'idle' },
}
const status = computed(() => STATUS[props.reminder.calSync] ?? STATUS.local!)
function openInGoogle() {
  window.open(buildGCalUrl(props.reminder), '_blank', 'noopener')
}
</script>

<template>
  <section class="rc" aria-label="Google Calendar">
    <div class="rc__row">
      <span class="rc__label">Google Calendar</span>
      <span class="rc__status" :class="'is-' + status.tone">
        <span class="rc__dot" />{{ status.label }}
      </span>
    </div>
    <p v-if="calendarNeedsAuth" class="rc__note">
      Google Calendar access expired. Reconnect to sync again.
    </p>
    <div class="rc__actions">
      <Button v-if="calendarNeedsAuth" size="sm" @click="app.reconnectCalendar()">
        <Icon name="refresh-cw" size="sm" />Reconnect
      </Button>
      <Button v-else size="sm" variant="secondary" @click="app.syncCalendar(reminder.id)">
        <Icon name="calendar-plus" size="sm" />{{
          reminder.calEventId ? 'Update event' : 'Add to calendar'
        }}
      </Button>
      <Button
        v-if="reminder.calEventId"
        size="sm"
        variant="ghost"
        @click="app.unsyncCalendar(reminder.id)"
      >
        <Icon name="calendar-x" size="sm" />Remove
      </Button>
      <Button size="sm" variant="ghost" @click="openInGoogle">
        <Icon name="external-link" size="sm" />Open in Google
      </Button>
    </div>
  </section>
</template>

<style scoped>
.rc {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--theme-border);
  background: color-mix(in oklch, var(--theme-card) 60%, transparent);
}
.rc__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.rc__label {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.rc__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.rc__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.rc__status.is-ok {
  color: var(--theme-success);
}
.rc__status.is-bad {
  color: var(--theme-danger);
}
.rc__status.is-busy {
  color: var(--theme-warning);
}
.rc__note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-warning);
}
.rc__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.rc__actions :deep(.ui-icon) {
  margin-right: 6px;
}
</style>
