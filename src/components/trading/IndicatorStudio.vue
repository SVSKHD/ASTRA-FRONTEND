<script setup lang="ts">
// The chart's Indicator Studio: add, tune, colour, hide and remove studies, mark an
// EMA crossover, and save the set as a named preset (src/trading/studies.ts).
//
// It edits a presentation preference only. Nothing here talks to a strategy, places an
// order or depends on what the backend has registered; which values come from the
// server and which are calculated in the browser is shown per study (`sources`).
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Switch from '@/components/ui/Switch.vue'
import TextInput from '@/components/ui/TextInput.vue'
import {
  EMA_PRESETS,
  KINDS,
  MAX_STUDIES,
  PALETTE,
  kindInfo,
  studyLabel,
  type ColorKey,
  type Studio,
  type ValueSource,
} from '@/trading/studies'

const props = withDefaults(
  defineProps<{ studio: Studio; sources?: Record<string, ValueSource> }>(),
  { sources: () => ({}) },
)

const state = computed(() => props.studio.state)
const full = computed(() => state.value.studies.length >= MAX_STUDIES)
const customEma = ref<number | null>(null)
const presetName = ref('')
const message = ref('')

function say(text: string) {
  message.value = text
}
function addEma(period: number | null) {
  if (!period) return
  const s = props.studio.add('ema', [period])
  say(s ? `Added ${studyLabel(s)}.` : `At most ${MAX_STUDIES} indicators.`)
}
function addKind(kind: (typeof KINDS)[number]['kind']) {
  const s = props.studio.add(kind)
  say(s ? `Added ${studyLabel(s)}.` : `At most ${MAX_STUDIES} indicators.`)
}
function addCross() {
  say(
    props.studio.addCrossover(8, 32)
      ? 'Added EMA 8 and EMA 32 with their crossovers marked.'
      : `At most ${MAX_STUDIES} indicators.`,
  )
}
function remove(id: string, label: string) {
  props.studio.remove(id)
  say(`Removed ${label}.`)
}
function savePreset() {
  try {
    const p = props.studio.savePreset(presetName.value)
    presetName.value = ''
    say(`Saved preset “${p.name}”.`)
  } catch (e) {
    say((e as Error).message)
  }
}
function loadPreset(name: string) {
  props.studio.loadPreset(name)
  say(`Loaded preset “${name}”.`)
}
function crossLabel() {
  const c = state.value.cross
  if (!c) return ''
  const f = state.value.studies.find((s) => s.id === c.fast)
  const s = state.value.studies.find((x) => x.id === c.slow)
  return f && s ? `${studyLabel(f)} / ${studyLabel(s)}` : ''
}
function sourceText(id: string) {
  return props.sources[id] === 'server' ? 'Server values' : 'Calculated in the browser'
}
</script>

<template>
  <div class="is">
    <section class="is__section" aria-labelledby="is-quick">
      <h3 id="is-quick" class="is__h">Quick add</h3>
      <Button variant="primary" size="sm" :disabled="full" @click="addCross">
        <Icon name="activity" size="sm" /> EMA 8/32 Crossover
      </Button>
      <p class="tp-note">
        Adds EMA 8 and EMA 32 and marks where they cross: a solid marker on a closed candle, a
        hollow dashed one while the live candle's period has not ended.
      </p>
      <div class="is__chips" role="group" aria-label="Add an EMA">
        <Button
          v-for="p in EMA_PRESETS"
          :key="p"
          size="sm"
          variant="secondary"
          :disabled="full"
          @click="addEma(p)"
          >EMA {{ p }}</Button
        >
      </div>
      <div class="is__row">
        <label class="tp-note" for="is-custom-ema">Custom EMA period</label>
        <NumberInput
          id="is-custom-ema"
          v-model="customEma"
          :min="1"
          :max="500"
          size="sm"
          placeholder="Period"
        />
        <Button
          size="sm"
          variant="secondary"
          :disabled="full || !customEma"
          @click="addEma(customEma)"
        >
          Add custom EMA
        </Button>
      </div>
      <div class="is__chips" role="group" aria-label="Add an indicator">
        <Button
          v-for="k in KINDS.filter((x) => x.kind !== 'ema')"
          :key="k.kind"
          size="sm"
          variant="ghost"
          :disabled="full"
          :title="k.hint"
          @click="addKind(k.kind)"
          >{{ k.label }}</Button
        >
      </div>
    </section>

    <section class="is__section" aria-labelledby="is-active">
      <h3 id="is-active" class="is__h">On the chart ({{ state.studies.length }})</h3>
      <p v-if="!state.studies.length" class="tp-note">
        No indicators yet. Add one above; they stay on this device.
      </p>
      <p v-if="crossLabel()" class="is__cross">
        <span>Crossovers marked: {{ crossLabel() }}</span>
        <Button size="sm" variant="ghost" @click="studio.clearCrossover()">Stop marking</Button>
      </p>
      <ul class="is__list">
        <li v-for="s in state.studies" :key="s.id" class="is__item" :data-study="studyLabel(s)">
          <div class="is__item-head">
            <span
              class="is__swatch"
              :style="{ '--swatch': PALETTE.find((p) => p.key === s.color)?.css }"
              aria-hidden="true"
            ></span>
            <span class="tp-strong">{{ studyLabel(s) }}</span>
            <span class="is__src">{{ sourceText(s.id) }}</span>
            <Switch
              :model-value="s.visible"
              size="sm"
              :label="`Show ${studyLabel(s)}`"
              @update:model-value="studio.toggle(s.id, $event)"
            />
            <IconButton
              :label="`Remove ${studyLabel(s)}`"
              size="sm"
              tone="danger"
              @click="remove(s.id, studyLabel(s))"
            >
              <Icon name="trash-2" size="sm" />
            </IconButton>
          </div>
          <div v-if="kindInfo(s.kind).params.length" class="is__row">
            <div v-for="(spec, i) in kindInfo(s.kind).params" :key="spec.label" class="is__param">
              <label class="tp-note" :for="`${s.id}-p${i}`">{{ spec.label }}</label>
              <NumberInput
                :id="`${s.id}-p${i}`"
                :model-value="s.params[i]"
                :min="spec.min"
                :max="spec.max"
                :step="spec.step ?? 1"
                size="sm"
                @update:model-value="studio.setParam(s.id, i, $event)"
              />
            </div>
            <span
              v-if="s.kind === 'ema'"
              class="is__chips"
              role="group"
              :aria-label="`${studyLabel(s)} period presets`"
            >
              <Button
                v-for="p in EMA_PRESETS"
                :key="p"
                size="sm"
                :variant="s.params[0] === p ? 'tinted' : 'ghost'"
                @click="studio.setParam(s.id, 0, p)"
                >{{ p }}</Button
              >
            </span>
          </div>
          <div class="is__colors" role="radiogroup" :aria-label="`${studyLabel(s)} colour`">
            <button
              v-for="c in PALETTE"
              :key="c.key"
              type="button"
              role="radio"
              class="is__color ui-focus-ring"
              :class="{ 'is-on': s.color === c.key }"
              :aria-checked="s.color === c.key"
              :aria-label="c.label"
              :title="c.label"
              :style="{ '--swatch': c.css }"
              @click="studio.setColor(s.id, c.key as ColorKey)"
            ></button>
          </div>
        </li>
      </ul>
    </section>

    <section class="is__section" aria-labelledby="is-presets">
      <h3 id="is-presets" class="is__h">Presets</h3>
      <div class="is__row">
        <TextInput
          v-model="presetName"
          size="sm"
          placeholder="Preset name"
          aria-label="Preset name"
          @keydown.enter="savePreset"
        />
        <Button size="sm" variant="secondary" :disabled="!presetName.trim()" @click="savePreset">
          <Icon name="save" size="sm" /> Save preset
        </Button>
      </div>
      <ul v-if="state.presets.length" class="is__list">
        <li v-for="p in state.presets" :key="p.name" class="is__preset">
          <span class="tp-strong">{{ p.name }}</span>
          <span class="tp-note">{{ p.studies.map(studyLabel).join(' · ') || 'empty' }}</span>
          <Button size="sm" variant="ghost" @click="loadPreset(p.name)">Load</Button>
          <IconButton
            :label="`Delete preset ${p.name}`"
            size="sm"
            tone="danger"
            @click="studio.deletePreset(p.name)"
          >
            <Icon name="trash-2" size="sm" />
          </IconButton>
        </li>
      </ul>
      <p class="tp-note">Saved on this device only.</p>
    </section>
    <p class="is__status" role="status" aria-live="polite">{{ message }}</p>
  </div>
</template>

<style scoped>
.is {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
.is__section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.is__h {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
}
.is__row,
.is__chips {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.is__chips {
  gap: var(--sp-1);
}
.is__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.is__item {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-2);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-sm);
  min-width: 0;
}
.is__item-head,
.is__preset,
.is__cross {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.is__item-head .tp-strong {
  flex: 1 1 auto;
}
.is__swatch {
  width: 14px;
  height: 0;
  border-top: 3px solid var(--swatch);
}
.is__src {
  font-size: var(--text-2xs);
  color: var(--text-secondary);
  padding: 0 6px;
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-pill);
}
.is__param {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 7.5rem;
  min-width: 0;
}
.is__colors {
  display: flex;
  gap: var(--sp-1);
  flex-wrap: wrap;
}
.is__color {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  border: 2px solid transparent;
  background: var(--swatch);
  cursor: pointer;
  padding: 0;
}
.is__color.is-on {
  border-color: var(--theme-text);
  box-shadow: inset 0 0 0 2px var(--theme-surface, var(--bg));
}
.is__status {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  min-height: 1em;
}
@media (pointer: coarse) {
  .is__color {
    width: 44px;
    height: 44px;
  }
  .is :deep(button) {
    min-height: 44px;
  }
}
</style>
