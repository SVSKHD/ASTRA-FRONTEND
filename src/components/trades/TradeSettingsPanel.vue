<script setup lang="ts">
// Everything durable, in one panel (section 32).
//
// Three groups, and they are separated because they fail differently: the
// account numbers are arithmetic, the broker clock changes how every historical
// row reads, and the collection names change WHICH DATA THE APP IS LOOKING AT.
// That last one is why renaming is not an edit-in-place: the name is a pointer,
// and moving a pointer does not move what it points at.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextInput from '@/components/ui/TextInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Alert from '@/components/ui/Alert.vue'
import { COLLECTION_LABEL, collectionNameError, type CollectionKey } from '@/utils/collections'
import { offsetLabel } from '@/utils/format'
import { offsetAt } from '@/utils/tradeTime'
import type { AstraSettings, SessionBounds } from '@/types'

const props = defineProps<{ settings: AstraSettings; monthStart: number; monthLabel: string }>()
const emit = defineEmits<{
  save: [Partial<AstraSettings>]
  rename: [{ key: CollectionKey; next: string }]
}>()

const NUMBERS = [
  { key: 'startingBalance', label: 'Starting balance', step: 100 },
  { key: 'dayTarget', label: 'Day target (move)', step: 1 },
  { key: 'monthTarget', label: 'Month target (move)', step: 1 },
  { key: 'monthlyBudget', label: 'Monthly budget (spend)', step: 100 },
  { key: 'defaultLot', label: 'Default lot', step: 0.01 },
] as const

const BOUNDS: { key: keyof SessionBounds; label: string }[] = [
  { key: 'asia', label: 'Asia opens (broker)' },
  { key: 'london', label: 'London opens (broker)' },
  { key: 'ny', label: 'New York opens (broker)' },
  { key: 'nyEnd', label: 'New York closes (broker)' },
]

const NAMES: CollectionKey[] = [
  'tradesCollection',
  'dacoitCollection',
  'expensesCollection',
  'securedCollection',
]

/** What the zone and the offset actually resolve to for the month on screen. */
const brokerLabel = computed(
  () =>
    `${props.settings.brokerTimezone || 'fixed offset'} · GMT${offsetLabel(
      offsetAt(
        { zone: props.settings.brokerTimezone, offsetMinutes: props.settings.brokerOffsetMinutes },
        props.monthStart,
      ),
    )}`,
)

const editing = ref<CollectionKey | ''>('')
const draft = ref('')
const nameError = computed(() => (draft.value ? collectionNameError(draft.value) : ''))

function open(key: CollectionKey) {
  editing.value = key
  draft.value = props.settings[key]
}

function confirm() {
  if (!editing.value || nameError.value || draft.value === props.settings[editing.value]) return
  emit('rename', { key: editing.value, next: draft.value.trim() })
  editing.value = ''
}

function onNumber(key: (typeof NUMBERS)[number]['key']) {
  return (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return
    emit('save', { [key]: value } as Partial<AstraSettings>)
  }
}
</script>

<template>
  <section class="tset">
    <FormField v-for="n in NUMBERS" :key="n.key" :label="n.label" v-slot="f">
      <NumberInput
        v-bind="f"
        :model-value="settings[n.key]"
        :step="n.step"
        :min="n.key === 'startingBalance' ? undefined : 0"
        @update:model-value="onNumber(n.key)($event)"
      />
    </FormField>

    <FormField
      label="Expenses net against profit"
      hint="Off: they are counted separately."
      v-slot="f"
    >
      <SegmentedControl
        :size="f.size"
        :model-value="settings.netExpenses ? 'yes' : 'no'"
        :options="[
          { value: 'no', label: 'Separate' },
          { value: 'yes', label: 'Net off' },
        ]"
        aria-label="Expenses net against profit"
        @update:model-value="emit('save', { netExpenses: $event === 'yes' })"
      />
    </FormField>

    <FormField
      label="Broker timezone"
      hint="An IANA name, e.g. Europe/Athens. Blank uses the fixed offset."
      v-slot="f"
    >
      <TextInput
        v-bind="f"
        :model-value="settings.brokerTimezone"
        placeholder="Europe/Athens"
        @update:model-value="emit('save', { brokerTimezone: String($event).trim() })"
      />
    </FormField>
    <FormField label="Broker offset (minutes)" hint="Used only when no zone is named." v-slot="f">
      <NumberInput
        v-bind="f"
        :model-value="settings.brokerOffsetMinutes"
        :step="15"
        @update:model-value="emit('save', { brokerOffsetMinutes: Number($event) })"
      />
    </FormField>
    <!-- What those two resolve to, so a wrong zone shows up as a wrong number
         rather than as an hour of quiet drift in the session column. -->
    <p class="tset__note tset__span">Broker clock in {{ monthLabel }}: {{ brokerLabel }}</p>

    <FormField v-for="b in BOUNDS" :key="b.key" :label="b.label" v-slot="f">
      <GlassDatePicker
        :id="f.id"
        :size="f.size"
        :model-value="settings.sessionBounds[b.key]"
        mode="time"
        :clearable="false"
        @update:model-value="
          emit('save', { sessionBounds: { ...settings.sessionBounds, [b.key]: String($event) } })
        "
      />
    </FormField>

    <h3 class="ui-label tset__span">Collections</h3>
    <p class="tset__note tset__span">
      Every query is built from these names. Renaming one points the app at a different collection —
      it does not move the data that is already there.
    </p>

    <div v-for="key in NAMES" :key="key" class="tset__name tset__span">
      <span class="ui-label tset__nameLabel">{{ COLLECTION_LABEL[key] }}</span>
      <template v-if="editing === key">
        <TextInput :model-value="draft" @update:model-value="draft = String($event)" />
        <Button variant="ghost" size="sm" :disabled="!!nameError" @click="confirm">
          Copy and switch
        </Button>
        <Button variant="ghost" size="sm" @click="editing = ''">Cancel</Button>
      </template>
      <template v-else>
        <code class="tset__nameValue">{{ settings[key] }}</code>
        <Button variant="ghost" size="sm" @click="open(key)">Rename</Button>
      </template>
    </div>

    <Alert v-if="nameError" tone="danger" class="tset__span">{{ nameError }}</Alert>
  </section>
</template>

<style scoped>
.tset {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
}
.tset__span {
  grid-column: 1 / -1;
  min-width: 0;
}
.tset__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.tset__name {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.tset__nameLabel {
  min-width: 9ch;
}
.tset__nameValue {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-primary, var(--theme-text));
}
</style>
