<script setup lang="ts">
// One device in the list.
//
// The layout rule from section 26b applies here for the same reason it applied
// to the unscheduled panel: this row holds a user-agent-derived label, a city
// name and a relative time in a fixed-width drawer, and any of the three can be
// long. Every text cell sets min-width: 0 and says what it does when it
// overflows, or the drawer gets pushed off its own edge by a Samsung device
// model number.
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import Chip from '@/components/ui/Chip.vue'
import Button from '@/components/ui/Button.vue'
import { deviceIcon, locationLabel } from '@/utils/device'
import { formatRelative } from '@/utils/timestamps'
import type { DeviceSession } from '@/types'

const props = defineProps<{ session: DeviceSession; now: number; busy?: boolean }>()
defineEmits<{ revoke: [id: string] }>()

const icon = computed(() => deviceIcon(props.session.deviceType))
</script>

<template>
  <li class="drow" :class="{ 'drow--current': session.current }">
    <span class="drow__icon" aria-hidden="true">
      <Icon :name="icon" size="md" />
    </span>

    <div class="drow__text">
      <p class="drow__label">
        {{ session.deviceLabel }}
        <!-- "This device" is a word rather than a colour, because the row's
             tint would otherwise be the only thing distinguishing it, and
             colour alone carries no information. -->
        <Chip v-if="session.current" label="This device" size="sm" />
      </p>
      <p class="drow__meta">
        <span class="drow__cell">{{ session.browser }} · {{ session.os }}</span>
        <span class="drow__dot" aria-hidden="true">·</span>
        <span class="drow__cell">{{ locationLabel(session.city, session.country) }}</span>
      </p>
    </div>

    <span class="drow__when ui-tabular">{{ formatRelative(session.lastActiveAt, now) }}</span>

    <!-- The current device gets no Revoke button: signing yourself out from the
         devices list is what "Sign out" in the account menu is for, and a
         button that logs you out of the page you are reading is a trap. -->
    <Button
      v-if="!session.current"
      size="sm"
      variant="ghost"
      :disabled="busy"
      @click="$emit('revoke', session.id)"
    >
      Revoke
    </Button>
    <span v-else class="drow__spacer" aria-hidden="true"></span>
  </li>
</template>

<style scoped>
.drow {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  /* Uniform height, so a row with no city does not sit shorter than its
     neighbours and make the list look ragged. */
  min-height: 56px;
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--border-subtle, var(--glass-border));
}
.drow:last-child {
  border-bottom: none;
}
.drow__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-control, 6px);
  background: var(--bg-elevated, var(--glass-card));
  color: var(--text-secondary, var(--theme-dim));
}
.drow--current .drow__icon {
  color: var(--theme-accent);
}
.drow__text {
  min-width: 0;
}
.drow__label {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
  overflow-wrap: anywhere;
}
.drow__meta {
  display: flex;
  align-items: baseline;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  /* --text-secondary, not --text-muted: this line says which browser and where,
     which is the information the row exists to carry. */
  color: var(--text-secondary, var(--theme-dim));
}
.drow__cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drow__dot {
  flex-shrink: 0;
}
.drow__when {
  flex-shrink: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.drow__spacer {
  display: block;
  width: 1px;
}
@media (max-width: 480px) {
  /* The relative time moves under the label rather than competing with the
     button for the last 60px of a phone screen. */
  .drow {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .drow__when {
    grid-column: 2;
    grid-row: 2;
  }
}
</style>
