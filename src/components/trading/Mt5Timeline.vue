<script setup lang="ts">
// Signal timeline of the MT5 dashboard: the bot's journal, newest first, with a
// badge per kind (P, cross, protected, secured, exit, closed, error; any other
// kind the bot sends gets a neutral badge). Filter by kind; read-only.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import Select from '@/components/ui/Select.vue'
import { when } from '@/trading/format'
import { KINDS, eventSummary, kindLabel, kindTone, type Mt5Signals } from '@/trading/mt5'

const props = defineProps<{ signals: Mt5Signals | null; kind: string; loading: boolean }>()
const emit = defineEmits<{ 'update:kind': [kind: string] }>()

const options = computed(() => [
  { value: '', label: 'All kinds' },
  ...KINDS.map((k) => ({ value: k, label: kindLabel(k) })),
])

const latest = computed(() =>
  Object.entries(props.signals?.latest ?? {}).map(([sym, kinds]) => ({
    sym,
    kinds: Object.keys(kinds ?? {}).filter((k) => kinds[k] !== null),
  })),
)
</script>

<template>
  <Card>
    <template #header>
      <div class="tp-head">
        <span class="tp-title">Signal timeline</span>
        <Select
          :model-value="kind"
          :options="options"
          size="sm"
          label="Kind"
          @update:model-value="(v: string) => emit('update:kind', v)"
        />
      </div>
    </template>
    <div v-for="l in latest" :key="l.sym" class="tp-row">
      <span class="tp-note">Latest {{ l.sym }}:</span>
      <Badge v-for="k in l.kinds" :key="k" :tone="kindTone(k)" :label="kindLabel(k)" />
    </div>
    <p v-if="loading && !signals" class="tp-note">Loading the journal…</p>
    <p v-else-if="!signals?.items.length" class="tp-note">
      No events{{ kind ? ' of this kind' : '' }} yet.
    </p>
    <ol v-else class="tp-list" aria-label="Bot journal">
      <li v-for="ev in signals.items" :key="ev.id" class="tp-item">
        <div class="tp-main">
          <div class="tp-row">
            <Badge :tone="kindTone(ev.kind)" :label="kindLabel(ev.kind)" />
            <span v-if="ev.symbol" class="tp-strong">{{ ev.symbol }}</span>
            <span v-if="ev.ticket !== null" class="tp-note tp-num">#{{ ev.ticket }}</span>
            <span v-if="ev.event !== ev.kind" class="tp-note">{{ ev.event }}</span>
          </div>
          <span class="tp-note">{{ eventSummary(ev) }}</span>
        </div>
        <time class="tp-note tp-num" :datetime="ev.t">{{ when(ev.t) }}</time>
      </li>
    </ol>
    <p v-if="signals && signals.total > signals.items.length" class="tp-note">
      Showing the newest {{ signals.items.length }} of {{ signals.total }}.
    </p>
  </Card>
</template>
