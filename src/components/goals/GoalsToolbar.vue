<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
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
import Tabs from '@/components/ui/Tabs.vue'
import Icon from '@/components/ui/Icon.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import TagFilter from '@/components/TagFilter.vue'
import type { GoalStatus } from '@/types'

const props = defineProps<{
  search: string
  status: GoalStatus | 'all'
  tag: string
  /** Each goal's tag, one group per goal, for the filter's counts. */
  tagGroups: readonly (readonly string[])[]
  sort: 'order' | 'target' | 'progress'
  mobile?: boolean
  // Filters are pointless on an empty tab.
  showFilters?: boolean
  /** The grid is in multi-select; the Select button reads Done. */
  selecting?: boolean
  /** There are goals to export as a Learning & Goals document. */
  canExport?: boolean
  /** How the list is grouped: by status, or under each goal. */
  group?: 'status' | 'goal'
}>()
const emit = defineEmits<{
  'update:search': [string]
  'submit-search': []
  'update:status': [GoalStatus | 'all']
  'update:tag': [string]
  'update:sort': ['order' | 'target' | 'progress']
  import: []
  export: []
  'update:group': ['status' | 'goal']
  'new-goal': []
  new: []
  help: []
  select: []
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
// Export sits with them: the same document goes out the way it came in.
const IMPORT_ITEMS = computed(() => [
  { value: 'paste', label: 'Paste JSON' },
  { value: 'link', label: 'Import from a link' },
  ...(props.canExport ? [{ value: 'export', label: 'Export Learning & Goals JSON' }] : []),
])

const GROUPS = [
  { value: 'goal', label: 'Group by goal' },
  { value: 'status', label: 'Group by status' },
]

const chips = computed(() => (props.mobile ? STATUSES : []))
</script>

<template>
  <div class="gtb">
    <!-- The same header row as every tab: name in the middle, Help, Import and
         New in the right-hand corner. On a phone quick add is the way in, as on
         Todos, so the header drops New rather than overflowing the screen. -->
    <ListToolbar
      title="Milestones"
      :new-label="mobile ? undefined : 'New milestone'"
      @new="emit('new')"
    >
      <template #actions>
        <!-- Persistent, not tucked into the empty state: the question "how do I
             get a goal in from JSON again?" is asked most often by somebody who
             already has goals, which is exactly when an empty-state hint is
             gone (section 23). -->
        <button
          v-if="showFilters"
          type="button"
          class="gtb__select-toggle panel-action"
          :class="{ 'is-on': selecting }"
          :aria-pressed="!!selecting"
          title="Select several milestones"
          @click="emit('select')"
        >
          {{ selecting ? 'Done' : 'Select' }}
        </button>
        <button
          type="button"
          class="gtb__help panel-action panel-action--icon"
          aria-label="How to add a milestone"
          title="How to add a milestone"
          @click="emit('help')"
        >
          <Icon name="help" size="sm" />
        </button>
        <!-- The chevron is Dropdown's own now, so the label is just the word. -->
        <Dropdown
          label="Import"
          :items="IMPORT_ITEMS"
          @select="$event === 'export' ? emit('export') : emit('import')"
        />
      </template>
    </ListToolbar>

    <div v-if="showFilters" class="gtb__filters">
      <TextInput
        type="search"
        icon="search"
        placeholder="Search milestones…"
        :model-value="search"
        @update:model-value="emit('update:search', $event)"
        @keydown.enter.prevent="emit('submit-search')"
      />

      <!-- Desktop: two compact selects sized to their content. -->
      <template v-if="!mobile">
        <Select
          aria-label="Filter by status"
          :model-value="status"
          @update:model-value="emit('update:status', $event as GoalStatus | 'all')"
          :options="[
            ...STATUSES.map((option) => ({
              value: String(option.value),
              label: `${option.label}`,
            })),
          ]"
        />
        <TagFilter
          :model-value="tag"
          :groups="tagGroups"
          @update:model-value="emit('update:tag', $event)"
        />
        <Select
          aria-label="Sort milestones"
          :model-value="sort"
          @update:model-value="emit('update:sort', $event as typeof sort)"
          :options="[
            ...SORTS.map((option) => ({ value: String(option.value), label: `${option.label}` })),
          ]"
        />
        <Select
          aria-label="Group milestones"
          :model-value="group ?? 'status'"
          :options="GROUPS"
          @update:model-value="emit('update:group', $event as 'status' | 'goal')"
        />
        <button type="button" class="gtb__goal ui-focus-ring" @click="emit('new-goal')">
          <Icon name="plus" size="xs" />New goal
        </button>
      </template>
    </div>

    <!-- Mobile: the status filter as a scroller of one-tap chips. -->
    <div v-if="showFilters && mobile" class="gtb__chips">
      <Tabs
        :model-value="status"
        :tabs="chips"
        aria-label="Filter by status"
        @update:model-value="emit('update:status', $event as GoalStatus | 'all')"
      />
      <TagFilter
        class="gtb__select--chip"
        :model-value="tag"
        :groups="tagGroups"
        @update:model-value="emit('update:tag', $event)"
      />
      <Select
        class="gtb__select gtb__select--chip"
        aria-label="Sort milestones"
        :model-value="sort"
        @update:model-value="emit('update:sort', $event as typeof sort)"
        :options="[
          ...SORTS.map((option) => ({ value: String(option.value), label: `${option.label}` })),
        ]"
      />
    </div>
  </div>
</template>

<style scoped>
.gtb {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
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
  font-size: var(--text-xs);
  font-family: inherit;
}
/* "New goal": the filter row's own control shape, icon and word on one line. */
.gtb__goal {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: var(--control-md);
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px dashed var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.gtb__goal:hover {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
.gtb__select {
  width: auto;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: var(--theme-input, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-family: inherit;
  cursor: pointer;
}
/* A phone gets the full width for typing and chips for filtering. */
@media (max-width: 640px) {
  .gtb__search {
    width: 100%;
  }
}
/* The row the strip and the sort select share. The strip draws its own chips
   now — this only has to let them scroll off the edge of a phone. */
.gtb__chips {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.gtb__chips::-webkit-scrollbar {
  display: none;
}
.gtb__select--chip {
  flex-shrink: 0;
}
</style>
