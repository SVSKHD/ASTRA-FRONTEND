<script setup lang="ts">
// What the server refused and would not take back (section 30).
//
// Only entries that have STOPPED retrying appear here. Everything else replays
// by itself — on reconnect, on mount, on a 30-second sweep — and a list of
// things that are already being handled is a list that trains people to ignore
// the one that is not.
//
// The error code is printed verbatim rather than paraphrased, because the two
// codes that reach this state have two different fixes: `permission-denied` is
// rules that have not been deployed, `failed-precondition` is an index that
// does not exist yet. "Could not save" sends somebody to neither.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import type { OutboxEntry } from '@/services/outbox'

const props = defineProps<{ entries: OutboxEntry[] }>()
defineEmits<{ discard: [string] }>()

const held = computed(() => props.entries.filter((e) => e.blocked))

/** What the row was, from the payload it was carrying. */
function label(entry: OutboxEntry): string {
  const symbol = entry.payload.symbol
  return typeof symbol === 'string' && symbol ? symbol : entry.collection
}
</script>

<template>
  <section v-if="held.length" class="obx">
    <h3 class="ui-label">Held writes</h3>
    <ul class="obx__list">
      <li v-for="entry in held" :key="entry.id" class="obx__row">
        <span class="obx__what">{{ label(entry) }}</span>
        <span class="obx__why ui-mono">{{ entry.lastError }}</span>
        <Button variant="ghost" size="sm" @click="$emit('discard', entry.id)">Discard</Button>
      </li>
    </ul>
    <p class="obx__note">
      Fix the cause and reload to try again, or discard — nothing here is going anywhere on its own,
      and nothing here has been thrown away.
    </p>
  </section>
</template>

<style scoped>
.obx {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--theme-danger);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
}
.obx__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.obx__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.obx__what {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.obx__why {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-danger);
}
.obx__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
