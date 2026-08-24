<script setup lang="ts">
// The last 20 things that happened to this account, newest first.
//
// It is a log, not a feed: every row is one line of what, one line of where,
// and a time. The two kinds worth a second look — a sign-in from a new country,
// a password change — carry an accent on the icon AND say so in their title,
// because an accent alone is a colour carrying information by itself.
import Icon from '@/components/ui/Icon.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { activityDetail, activityIcon, activityIsNotable, activityTitle } from '@/utils/sessionView'
import { formatRelative } from '@/utils/timestamps'
import type { ActivityEvent } from '@/types'
import type { IconName } from '@/components/ui/icons'

defineProps<{ events: ActivityEvent[]; now: number }>()

const iconFor = (type: ActivityEvent['type']) => activityIcon(type) as IconName
</script>

<template>
  <ul v-if="events.length" class="alog">
    <li v-for="event in events" :key="event.id" class="alog__row">
      <span
        class="alog__icon"
        :class="{ 'alog__icon--notable': activityIsNotable(event.type) }"
        aria-hidden="true"
      >
        <Icon :name="iconFor(event.type)" size="sm" />
      </span>
      <div class="alog__text">
        <p class="alog__title">{{ activityTitle(event.type) }}</p>
        <p v-if="activityDetail(event)" class="alog__detail">{{ activityDetail(event) }}</p>
      </div>
      <time class="alog__when ui-tabular" :datetime="new Date(event.at).toISOString()">
        {{ formatRelative(event.at, now) }}
      </time>
    </li>
  </ul>
  <EmptyState
    v-else
    title="No activity yet"
    description="Sign-ins, sign-outs and new devices will be listed here as they happen."
  />
</template>

<style scoped>
.alog {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.alog__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-2) 0;
}
.alog__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: var(--text-secondary, var(--theme-dim));
}
.alog__icon--notable {
  color: var(--theme-accent);
}
.alog__text {
  min-width: 0;
}
.alog__title {
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
  overflow-wrap: anywhere;
}
.alog__detail {
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
  overflow-wrap: anywhere;
}
.alog__when {
  flex-shrink: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
</style>
