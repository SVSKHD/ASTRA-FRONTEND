<script setup lang="ts">
// The goals tab's header strip (section 19c).
//
// It used to be three full-width controls stacked over a title row: a search
// box as wide as the screen, and two selects beside it, none of which needed
// that much room. Now the controls are sized to their content and sit on one
// line, with the actions on the right.
//
// The two import buttons collapse into one `Import ▾`. They always led to the
// same screen — /import/goals handles pasted JSON, a dropped file and a spasta
// link alike — so two buttons were one destination wearing two hats.
//
// On a phone the search takes the full width and the status filter becomes a
// horizontal chip scroller, because a select on a small screen is a modal
// wheel and a chip is one tap.
import { computed } from 'vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import Icon from '@/components/ui/Icon.vue'
import type { GoalStatus } from '@/types'

const props = defineProps<{
  search: string
  status: GoalStatus | 'all'
  sort: 'order' | 'target' | 'progress'
  mobile?: boolean
  // Filters are pointless on an empty tab.
  showFilters?: boolean
}>()
const emit = defineEmits<{
  'update:search': [Event]
  'submit-search': []
  'update:status': [GoalStatus | 'all']
  'update:sort': ['order' | 'target' | 'progress']
  import: []
  new: []
  help: []
}>()

const STATUSES: { value: GoalStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Active & open' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
]
const SORTS: { value: 'order' | 'target' | 'progress'; label: string }[] = [
  { value: 'order', label: 'Manual order' },
  { value: 'target', label: 'By target date' },
  { value: 'progress', label: 'By progress' },
]
// One destination, so the menu explains the ways in rather than offering
// different ones.
const IMPORT_ITEMS = [
  { value: 'paste', label: 'Paste JSON' },
  { value: 'link', label: 'Import from a link' },
]

const chips = computed(() => (props.mobile ? STATUSES : []))
</script>

<template>
  <div class="gtb">
    <div class="gtb__row">
      <h2 class="gtb__title">Goals</h2>
      <div class="gtb__spacer"></div>
      <div class="gtb__actions">
        <!-- Persistent, not tucked into the empty state: the question "how do I
             get a goal in from JSON again?" is asked most often by somebody who
             already has goals, which is exactly when an empty-state hint is
             gone (section 23). -->
        <button
          type="button"
          class="gtb__help"
          aria-label="How to add a goal"
          title="How to add a goal"
          @click="emit('help')"
        >
          <Icon name="help" size="sm" />
        </button>
        <Dropdown label="Import ▾" :items="IMPORT_ITEMS" @select="emit('import')" />
        <button type="button" class="gtb__new" @click="emit('new')">+ New goal</button>
      </div>
    </div>

    <div v-if="showFilters" class="gtb__filters">
      <input
        class="gtb__search"
        type="search"
        placeholder="Search goals…"
        :value="search"
        @input="emit('update:search', $event)"
        @keydown.enter.prevent="emit('submit-search')"
      />

      <!-- Desktop: two compact selects sized to their content. -->
      <template v-if="!mobile">
        <select
          class="gtb__select"
          aria-label="Filter by status"
          :value="status"
          @change="
            emit('update:status', ($event.target as HTMLSelectElement).value as GoalStatus | 'all')
          "
        >
          <option v-for="option in STATUSES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select
          class="gtb__select"
          aria-label="Sort goals"
          :value="sort"
          @change="emit('update:sort', ($event.target as HTMLSelectElement).value as typeof sort)"
        >
          <option v-for="option in SORTS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </template>
    </div>

    <!-- Mobile: the status filter as a scroller of one-tap chips. -->
    <div
      v-if="showFilters && mobile"
      class="gtb__chips"
      role="tablist"
      aria-label="Filter by status"
    >
      <button
        v-for="option in chips"
        :key="option.value"
        type="button"
        role="tab"
        class="gtb__chip"
        :class="status === option.value && 'gtb__chip--on'"
        :aria-selected="status === option.value"
        @click="emit('update:status', option.value)"
      >
        {{ option.label }}
      </button>
      <select
        class="gtb__select gtb__select--chip"
        aria-label="Sort goals"
        :value="sort"
        @change="emit('update:sort', ($event.target as HTMLSelectElement).value as typeof sort)"
      >
        <option v-for="option in SORTS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.gtb {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.gtb__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.gtb__title {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.gtb__spacer {
  flex: 1;
}
.gtb__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-shrink: 0;
}
.gtb__help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.gtb__help:hover {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
}
.gtb__new {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent, #fff);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
/* One line, left-aligned, each control the width it needs. */
.gtb__filters {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.gtb__search {
  width: 320px;
  max-width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: var(--theme-input, transparent);
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-family: inherit;
}
.gtb__select {
  width: auto;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: var(--theme-input, transparent);
  color: var(--theme-text);
  font-size: var(--text-xs);
  font-family: inherit;
  cursor: pointer;
}
/* A phone gets the full width for typing and chips for filtering. */
@media (max-width: 640px) {
  .gtb__search {
    width: 100%;
  }
}
.gtb__chips {
  display: flex;
  gap: var(--sp-2);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.gtb__chips::-webkit-scrollbar {
  display: none;
}
.gtb__chip {
  flex-shrink: 0;
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  white-space: nowrap;
  cursor: pointer;
}
.gtb__chip--on {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
.gtb__select--chip {
  flex-shrink: 0;
}
</style>
