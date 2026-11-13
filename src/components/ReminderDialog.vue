<script setup lang="ts">
// The reminder dialog, for creating AND editing: both show the same labelled
// form (ReminderForm), so a field is never on one and missing from the other.
//
// Create holds its values in the store's dialogDraft and commits on Add (a
// mistyped reminder is never half-saved); a killed tab or a stray close keeps
// the draft (useDraft) and offers it back. Edit writes through on each change,
// so its main button only dismisses.
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useDraft } from '@/composables/useDraft'
import { dialogCard, pxify } from '@/styles'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Icon from '@/components/ui/Icon.vue'
import DraftBanner from '@/components/DraftBanner.vue'
import ReminderForm from '@/components/reminders/ReminderForm.vue'
import ReminderCalendar from '@/components/reminders/ReminderCalendar.vue'
import {
  defaultStart,
  draftPatch,
  formFromDraft,
  formFromReminder,
  isReminderDone,
  type ReminderFormValue,
} from '@/utils/reminderView'
import type { Reminder } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, s } = useStyles()
const { itemDialog, dialogDraft, dialogClosing, reminders } = storeToRefs(app)
const { now } = storeToRefs(ui)

const active = computed(() => (itemDialog.value?.type === 'reminder' ? itemDialog.value : null))
const isCreate = computed(() => active.value?.mode === 'create')
const reminder = computed<Reminder | undefined>(() =>
  active.value?.mode === 'edit'
    ? reminders.value.find((r) => r.id === active.value!.id)
    : undefined,
)
const open = computed(() => isCreate.value || !!reminder.value)

const value = computed<ReminderFormValue>(() =>
  reminder.value ? formFromReminder(reminder.value) : formFromDraft(dialogDraft.value),
)

// A new reminder starts at a sensible time rather than an empty picker.
watch(
  () => isCreate.value && !dialogDraft.value.start,
  (blank) => {
    if (blank) app.setDialogDraft('start', defaultStart(Date.now()))
  },
  { immediate: true },
)

function patch(p: Partial<ReminderFormValue>) {
  if (isCreate.value) {
    for (const [k, v] of Object.entries(draftPatch(p))) app.setDialogDraft(k, v)
    return
  }
  const r = reminder.value
  if (!r) return
  for (const [k, v] of Object.entries(p)) {
    if (k === 'addToCalendar') continue
    app.updateReminder(r.id, k as keyof Reminder, v)
  }
}

// Draft resume for create, as ItemDialog does for every other type.
const createType = () => (isCreate.value ? 'reminder' : '')
const blank = () => (isCreate.value ? app.blankDraft('reminder') : {})
const draft = useDraft(createType, null, dialogDraft, {
  entityUpdatedAt: () => 0,
  baseline: blank,
  // The default time alone is not work worth keeping.
  isEmpty: (p) => {
    const d = p as Record<string, unknown>
    return !String(d.title ?? '').trim() && !String(d.note ?? '').trim()
  },
})

function save() {
  if (isCreate.value) {
    if (app.commitCreate()) draft.clear()
  } else app.closeItemDialog()
}
function close() {
  if (isCreate.value) draft.flush()
  app.closeItemDialog()
}
function onEnter(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.isContentEditable) return
  // The date picker takes Enter for its own typed entry.
  if (el.closest('.glass-dp, [role="dialog"] [role="grid"]')) return
  e.preventDefault()
  save()
}
function onDelete() {
  const r = reminder.value
  if (!r) return
  app.deleteWithUndo('reminders', 'reminder', r.id)
  app.closeItemDialog()
}
function toggleDone() {
  const r = reminder.value
  if (!r) return
  if (isReminderDone(r)) app.patchReminder(r.id, { acknowledgedAt: null, cancelledAt: null })
  else app.acknowledgeReminder(r.id)
}

const cardStyle = computed(() =>
  pxify({
    ...dialogCard(c.value, dialogClosing.value),
    width: 'min(94vw, 520px)',
    gap: 'var(--sp-5)',
  }),
)
</script>

<template>
  <template v-if="active && open">
    <div :style="s.dialogOverlay" @click="close()"></div>
    <div
      :style="cardStyle"
      role="dialog"
      aria-modal="true"
      :aria-label="isCreate ? 'New reminder' : 'Edit reminder'"
      data-testid="reminder-dialog"
      @keydown.enter="onEnter"
      @keydown.esc="close()"
    >
      <div class="rd__head">
        <span class="rd__icon"><Icon name="bell" size="md" /></span>
        <span :style="s.dialogHeading">{{ isCreate ? 'New reminder' : 'Edit reminder' }}</span>
        <span v-if="reminder && isReminderDone(reminder)" class="rd__state">
          {{ reminder.cancelledAt != null ? 'Cancelled' : 'Done' }}
        </span>
        <IconButton class="rd__close" label="Close" size="sm" tone="default" @click="close()">
          <Icon name="x" size="sm" />
        </IconButton>
      </div>

      <DraftBanner
        v-if="isCreate && draft.hasDraft.value"
        :restored-at="draft.restoredAt.value"
        :from-other-device="draft.fromOtherDevice.value"
        @use="draft.applyDraft()"
        @ignore="draft.ignore()"
        @discard="draft.discard()"
      />

      <ReminderForm
        :value="value"
        :now="now"
        :create="isCreate"
        :autofocus="isCreate"
        @patch="patch"
      >
        <template v-if="reminder" #calendar>
          <ReminderCalendar :reminder="reminder" />
        </template>
      </ReminderForm>

      <div class="rd__foot">
        <template v-if="reminder">
          <Button variant="ghost" size="sm" class="rd__del" @click="onDelete">
            <Icon name="trash" size="sm" />Delete
          </Button>
          <Button variant="ghost" size="sm" @click="app.share('reminder', reminder)">
            <Icon name="share-2" size="sm" />Share
          </Button>
          <span class="rd__spacer" />
          <Button variant="secondary" size="sm" @click="toggleDone">
            <Icon :name="isReminderDone(reminder) ? 'rotate-ccw' : 'check'" size="sm" />
            {{ isReminderDone(reminder) ? 'Reopen' : 'Mark done' }}
          </Button>
          <Button size="sm" @click="save">Done</Button>
        </template>
        <template v-else>
          <span class="rd__spacer" />
          <Button variant="ghost" size="sm" @click="close()">Cancel</Button>
          <Button size="sm" data-testid="reminder-add" @click="save">
            <Icon name="plus" size="sm" />Add reminder
          </Button>
        </template>
      </div>
    </div>
  </template>
</template>

<style scoped>
.rd__head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.rd__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  flex-shrink: 0;
  background: color-mix(in oklch, var(--theme-accent) 22%, transparent);
  color: var(--theme-accent);
}
.rd__state {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  color: var(--theme-dim);
}
.rd__close {
  margin-left: auto;
}
.rd__foot {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.rd__spacer {
  flex: 1;
}
.rd__foot :deep(.ui-icon) {
  margin-right: 6px;
}
.rd__del {
  color: var(--theme-danger);
}
</style>
