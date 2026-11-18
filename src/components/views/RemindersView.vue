<script setup lang="ts">
// The Reminders tab, built the way the Todo tab is: a natural-language quick
// add at the head of the list ("Pay rent tomorrow 9am every month !high"), the
// list grouped by when each one rings next (Missed, Today, Tomorrow, This week,
// Later), a ring to tick one off, and on a desktop the selected reminder's every
// field in the right-hand pane. On a phone a tap opens the same fields in the
// reminder dialog.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useAccordionState } from '@/composables/useAccordionState'
import { useLongList } from '@/composables/useLongList'
import { usePaneInset } from '@/composables/usePaneInset'
import { pxify } from '@/styles'
import { splitList } from '@/utils/listSplit'
import { repFreqLabel } from '@/utils/reminders'
import { relLabel } from '@/utils/upcoming'
import {
  GROUP_LABEL,
  GROUP_ORDER,
  groupOf,
  isReminderDone,
  sourceLabel,
  whenLabel,
  whenOf,
  type ReminderGroupKey,
} from '@/utils/reminderView'
import PanelHeader from '@/components/PanelHeader.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import QuickAdd from '@/components/todo/QuickAdd.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import Accordion from '@/components/ui/Accordion.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import RingCheck from '@/components/ui/RingCheck.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import ReminderDetail from '@/components/reminders/ReminderDetail.vue'
import { vScrollFade } from '@/directives/scrollFade'
import { PRIORITY_ORDER, type Priority, type Reminder } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { panelStyle, isMobile } = useStyles()
const { reminders, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

const quickAdd = ref<InstanceType<typeof QuickAdd> | null>(null)
function focusQuickAdd() {
  quickAdd.value?.focus(true)
}
// N / ⌘K: straight into the quick add, as on the Todo tab.
defineExpose({ focus: focusQuickAdd })

// --- the list ----------------------------------------------------------------
const completedSort = ref<'recent' | 'original'>('recent')
const split = computed(() =>
  splitList(reminders.value, {
    isDone: isReminderDone,
    isCarried: () => false,
    completedAt: (r) => r.acknowledgedAt ?? r.cancelledAt ?? null,
    completedSort: completedSort.value,
  }),
)

interface Row {
  r: Reminder
  when: string
  rel: string
  missed: boolean
  repeat: string
  source: string
}
function toRow(r: Reminder): Row {
  const at = whenOf(r, now.value)
  const done = isReminderDone(r)
  const missed = !done && groupOf(r, now.value) === 'missed'
  return {
    r,
    when: at == null ? 'No time set' : whenLabel(at, now.value),
    rel: at == null || done ? '' : relLabel(at - now.value),
    missed,
    repeat: r.repeat && r.repeat.type !== 'none' ? repFreqLabel(r.repeat) : '',
    source: sourceLabel(r),
  }
}

// Each group in time order; within a minute, the higher priority first.
const groups = computed(() => {
  const by = new Map<ReminderGroupKey, Reminder[]>()
  for (const r of split.value.active) {
    const g = groupOf(r, now.value)
    by.set(g, [...(by.get(g) ?? []), r])
  }
  return GROUP_ORDER.filter((k) => by.has(k)).map((key) => ({
    key,
    label: GROUP_LABEL[key],
    rows: by
      .get(key)!
      .sort(
        (a, b) =>
          (whenOf(a, now.value) ?? 0) - (whenOf(b, now.value) ?? 0) ||
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
      )
      .map(toRow),
  }))
})
const completedRows = computed(() => split.value.completed.map(toRow))
const completedWindow = useLongList(completedRows)

const acc = useAccordionState()
const groupOpen = (k: ReminderGroupKey) => acc.isOpen('reminders:' + k, true)

// --- ticking off ---------------------------------------------------------------
function toggleDone(r: Reminder) {
  if (isReminderDone(r)) app.patchReminder(r.id, { acknowledgedAt: null, cancelledAt: null })
  else app.acknowledgeReminder(r.id)
}

// --- master / detail -------------------------------------------------------------
const selectedId = ref<number | null>(null)
const selectedExists = computed(
  () => selectedId.value != null && reminders.value.some((r) => r.id === selectedId.value),
)
const splitView = computed(() => !isMobile.value && app.paneMode === 'inline')
const paneOpen = computed(() => !isMobile.value && !splitView.value && selectedExists.value)
const paneWidth = ref(0)
const { host: paneHost, style: paneInset } = usePaneInset(paneOpen, paneWidth)
function open(r: Reminder) {
  if (isMobile.value) app.openReminderDialog(r.id)
  else selectedId.value = selectedId.value === r.id ? null : r.id
}
function remove(r: Reminder) {
  if (selectedId.value === r.id) selectedId.value = null
  app.deleteWithUndo('reminders', 'reminder', r.id)
}

const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', normal: '', low: 'Low' }

const splitLayout = pxify({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
})
</script>

<template>
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <PanelHeader title="Reminders" new-label="New reminder" @new="app.openCreate('reminder')" />

    <div :style="splitView ? splitLayout : undefined" class="rv" data-own-keys>
      <div class="rv__col">
        <div class="rv__head">
          <ProgressLine part="inline" :done="split.stats.done" :total="split.stats.total" />
          <QuickAdd ref="quickAdd" collection="reminders" :compact="isMobile" />
        </div>

        <div v-scroll-fade class="rv__list">
          <EmptyState
            v-if="reminders.length === 0"
            glyph="🔔"
            title="No reminders yet"
            description="Type one above, like “Call mum sun 6pm every week”, or open New reminder for every option."
          />

          <Accordion
            v-for="g in groups"
            :key="g.key"
            :title="`${g.label} · ${g.rows.length}`"
            :open="groupOpen(g.key)"
            :class="'rv-group is-' + g.key"
            @toggle="acc.set('reminders:' + g.key, $event)"
          >
            <TransitionGroup name="subtask-row" tag="div" class="rv__rows">
              <div
                v-for="row in g.rows"
                :key="row.r.id"
                class="rv-row"
                :class="{
                  'is-selected': !isMobile && selectedId === row.r.id,
                  'is-high': row.r.priority === 'high',
                }"
                :data-reminder-id="row.r.id"
              >
                <RingCheck :done="false" :sub-done="0" :sub-total="0" @toggle="toggleDone(row.r)" />
                <button type="button" class="rv-row__main" @click="open(row.r)">
                  <span class="rv-row__title">{{ row.r.title || '(untitled)' }}</span>
                  <span class="rv-row__meta">
                    <span
                      class="rv-meta"
                      :class="{ 'is-missed': row.missed, 'is-when': !row.missed }"
                    >
                      <Icon name="alarm-clock" size="xs" />{{ row.when }}
                      <span v-if="row.rel" class="rv-meta__rel">· {{ row.rel }}</span>
                    </span>
                    <span v-if="row.repeat" class="rv-meta">
                      <Icon name="repeat" size="xs" />{{ row.repeat }}
                    </span>
                    <span
                      v-if="PRIORITY_LABEL[row.r.priority]"
                      class="rv-meta rv-prio"
                      :class="'is-' + row.r.priority"
                    >
                      <Icon name="flag" size="xs" />{{ PRIORITY_LABEL[row.r.priority] }}
                    </span>
                    <span
                      v-if="row.r.calSync === 'synced'"
                      class="rv-meta"
                      title="In Google Calendar"
                    >
                      <Icon name="calendar" size="xs" />Calendar
                    </span>
                    <span v-else-if="row.r.calSync === 'error'" class="rv-meta is-missed">
                      <Icon name="calendar-x" size="xs" />Sync failed
                    </span>
                    <span v-if="row.source" class="rv-meta">
                      <Icon name="link" size="xs" />{{ row.source }}
                    </span>
                    <span v-if="row.r.note" class="rv-meta rv-meta--note">{{ row.r.note }}</span>
                  </span>
                </button>
                <div v-if="!isMobile" class="rv-row__tools">
                  <IconButton
                    label="Snooze 1 hour"
                    size="sm"
                    tone="default"
                    @click="app.snoozeReminder(row.r.id, 60)"
                  >
                    <Icon name="clock" size="sm" />
                  </IconButton>
                  <IconButton
                    label="Share"
                    size="sm"
                    tone="default"
                    @click="app.share('reminder', row.r)"
                  >
                    <Icon name="share-2" size="sm" />
                  </IconButton>
                  <IconButton label="Delete" size="sm" tone="danger" @click="remove(row.r)">
                    <Icon name="trash" size="sm" />
                  </IconButton>
                </div>
              </div>
            </TransitionGroup>
          </Accordion>

          <CompletedSection
            v-if="!hideCompleted && completedRows.length > 0"
            collection="reminders"
            :count="completedRows.length"
            :sort="completedSort"
            @toggle-sort="completedSort = completedSort === 'recent' ? 'original' : 'recent'"
          >
            <div
              v-for="row in completedWindow.visible.value"
              :key="row.r.id"
              class="rv-row is-done"
              :class="{ 'is-selected': !isMobile && selectedId === row.r.id }"
            >
              <RingCheck :done="true" :sub-done="0" :sub-total="0" @toggle="toggleDone(row.r)" />
              <button type="button" class="rv-row__main" @click="open(row.r)">
                <span class="rv-row__title">{{ row.r.title || '(untitled)' }}</span>
                <span class="rv-row__meta">
                  <span class="rv-meta">
                    {{ row.r.cancelledAt != null ? 'Cancelled' : 'Done' }} · {{ row.when }}
                  </span>
                </span>
              </button>
              <div v-if="!isMobile" class="rv-row__tools">
                <IconButton label="Delete" size="sm" tone="danger" @click="remove(row.r)">
                  <Icon name="trash" size="sm" />
                </IconButton>
              </div>
            </div>
            <button
              v-if="completedWindow.remaining.value > 0"
              type="button"
              class="rv__more"
              @click="completedWindow.more()"
            >
              Show {{ Math.min(100, completedWindow.remaining.value) }} more ({{
                completedWindow.remaining.value
              }}
              hidden)
            </button>
          </CompletedSection>
        </div>
      </div>

      <DetailPane
        v-if="!isMobile"
        :open="selectedExists"
        title="Reminder details"
        :subtitle="selectedExists ? '' : 'Pick a reminder to see and change everything about it'"
        @width="paneWidth = $event"
        @close="selectedId = null"
      >
        <ReminderDetail
          v-if="selectedExists"
          :reminder-id="selectedId"
          @close="selectedId = null"
        />
        <EmptyState
          v-else
          glyph="⏰"
          title="Nothing selected"
          description="Choose a reminder on the left: its time, repeat, priority, note and calendar are all editable here."
        />
      </DetailPane>
    </div>
  </div>
</template>

<style scoped>
.rv {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.rv__col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  flex: 1;
  min-height: 0;
}
.rv__head {
  padding: 4px 10px 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.rv__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 10px 18px;
}
.rv__rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
/* The group's count in its own colour: Missed reads at a glance. */
.rv-group.is-missed :deep(.ui-accordion__head) {
  color: var(--theme-danger);
}

/* A row: the ring, the title over its facts, and the tools that wait for the
   pointer (always shown on touch, where there is no hover). */
.rv-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 10px 12px;
  border-radius: var(--radius-card);
  border: 1px solid var(--theme-border);
  background: var(--theme-card);
  transition:
    border-color var(--dur-fast) ease,
    box-shadow var(--dur-fast) ease;
}
.rv-row:hover {
  border-color: color-mix(in oklch, var(--theme-accent) 35%, var(--theme-border));
}
.rv-row.is-selected {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--theme-accent) 14%, transparent);
}
/* High priority: a bar down the leading edge, as a todo's colour band. */
.rv-row.is-high::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: var(--radius-pill);
  background: var(--theme-danger);
}
.rv-row.is-done {
  opacity: 0.6;
}
.rv-row.is-done .rv-row__title {
  text-decoration: line-through;
}
.rv-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rv-row__main:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}
.rv-row__title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--theme-text);
  min-width: 0;
  overflow-wrap: anywhere;
}
.rv-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}
.rv-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  white-space: nowrap;
}
.rv-meta.is-when {
  color: var(--theme-accent);
  font-weight: var(--weight-medium);
}
.rv-meta.is-missed {
  color: var(--theme-danger);
  font-weight: var(--weight-medium);
}
.rv-meta__rel {
  color: var(--theme-dim);
  font-weight: var(--weight-normal);
}
.rv-prio.is-high {
  color: var(--theme-danger);
}
.rv-meta--note {
  min-width: 0;
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rv-row__tools {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-fast) ease;
}
.rv-row:hover .rv-row__tools,
.rv-row:focus-within .rv-row__tools,
.rv-row.is-selected .rv-row__tools {
  opacity: 1;
}
/* On touch there is no hover to reveal them (a phone shows none: a tap opens
   the dialog, which has them all). */
@media (hover: none) {
  .rv-row__tools {
    opacity: 1;
  }
}
.rv__more {
  padding: var(--sp-2);
  border: 0;
  background: transparent;
  color: var(--theme-accent);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}
</style>
