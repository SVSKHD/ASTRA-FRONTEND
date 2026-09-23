<script setup lang="ts">
// The tray that collects every standing Alert in the app.
//
// IT IS NOT ONLY WARNINGS. An `Alert` of any tone lands here — a failure, a
// warning, a success, a note — and the summary used to call all four "N
// warnings" behind one red `!`. So a finished import and a broken connection
// were the same red badge, and the only way to tell them apart was to open it.
//
// The summary now reads the tones it actually holds: the worst one colours the
// badge and picks the icon, and the label counts each tone by name. Every row
// carries its own icon and says its tone in words, because the left-hand border
// colour was the only thing distinguishing them and colour alone is not a label.
import { computed, ref } from 'vue'
import { warningEntries, removeWarning, type WarningEntry } from '@/services/warnings'
import Caret from '@/components/ui/Caret.vue'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'

const expanded = ref(false)

type Tone = WarningEntry['tone']

// Worst first: this is both the badge's priority and the order the label reads.
const TONES: Tone[] = ['danger', 'warning', 'success', 'info']
const TONE_ICON: Record<Tone, IconName> = {
  danger: 'alert-circle',
  warning: 'alert-circle',
  success: 'check',
  info: 'bell',
}
// Singular and plural, per tone. "1 warning" and "1 success" are different
// sentences and a tray that says the first when it means the second is lying.
const TONE_NOUN: Record<Tone, [string, string]> = {
  danger: ['issue', 'issues'],
  warning: ['warning', 'warnings'],
  success: ['success', 'successes'],
  info: ['note', 'notes'],
}

const counts = computed<Record<Tone, number>>(() => {
  const out: Record<Tone, number> = { danger: 0, warning: 0, success: 0, info: 0 }
  for (const entry of warningEntries) out[entry.tone]++
  return out
})
/** The tone the badge takes: the most serious one present. */
const worst = computed<Tone>(() => TONES.find((t) => counts.value[t] > 0) ?? 'info')
/** "2 issues · 1 success" — every tone in the tray, named and counted. */
const summary = computed(() =>
  TONES.filter((t) => counts.value[t] > 0)
    .map((t) => `${counts.value[t]} ${TONE_NOUN[t][counts.value[t] === 1 ? 0 : 1]}`)
    .join(' · '),
)
function toneWord(tone: Tone): string {
  return TONE_NOUN[tone][0]
}

function dismiss(id: string): void {
  const entry = warningEntries.find((item) => item.id === id)
  if (!entry?.dismissible) return
  entry.dismiss()
  removeWarning(id)
}

function dismissAll(): void {
  for (const entry of [...warningEntries]) if (entry.dismissible) entry.dismiss()
  warningEntries.splice(0)
  expanded.value = false
}
</script>

<template>
  <aside v-if="warningEntries.length" class="warning-tray" aria-label="Alerts">
    <button
      class="warning-tray__summary"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="warning-tray__signal" :class="`is-${worst}`" aria-hidden="true">
        <Icon :name="TONE_ICON[worst]" size="xs" />
      </span>
      <span class="warning-tray__label">{{ summary }}</span>
      <Caret :open="expanded" size="sm" />
    </button>
    <Transition name="warning-panel">
      <div v-if="expanded" class="warning-tray__list">
        <div
          v-for="entry in warningEntries"
          :key="entry.id"
          class="warning-tray__item"
          :class="`is-${entry.tone}`"
        >
          <span class="warning-tray__mark" aria-hidden="true">
            <Icon :name="TONE_ICON[entry.tone]" size="xs" />
          </span>
          <div class="warning-tray__copy">
            <!-- The tone in words, for a reader who cannot see the colour. -->
            <span class="ui-sr-only">{{ toneWord(entry.tone) }}:</span>
            <strong v-if="entry.title">{{ entry.title }}</strong>
            <span>{{ entry.message }}</span>
          </div>
          <button
            v-if="entry.dismissible"
            class="warning-tray__dismiss"
            type="button"
            :aria-label="`Dismiss ${entry.title || 'warning'}`"
            @click="dismiss(entry.id)"
          >
            ×
          </button>
        </div>
        <button class="warning-tray__dismissAll" type="button" @click="dismissAll">
          Dismiss all
        </button>
      </div>
    </Transition>
  </aside>
</template>

<style scoped>
.warning-tray {
  position: fixed;
  right: var(--sp-4);
  bottom: var(--sp-4);
  z-index: 70;
  width: min(380px, calc(100vw - 32px));
  color: var(--theme-text);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  box-shadow:
    var(--elev-1),
    inset 0 1px 0 color-mix(in srgb, white 14%, transparent);
  animation: warningTrayIn var(--dur-med) var(--ease-out) both;
}
.warning-tray__summary {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border: 0;
  border-radius: inherit;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  text-align: left;
  cursor: pointer;
}
/* The badge carries the worst tone in the tray. A tinted disc rather than a
   solid fill: the icon inside it is the tone's own colour, which is the same
   colour the matching rows are edged with, so the summary and the list agree. */
.warning-tray__signal {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: var(--theme-accent);
  background: color-mix(in oklch, currentcolor 18%, transparent);
  border: 1px solid color-mix(in oklch, currentcolor 45%, transparent);
}
.warning-tray__signal.is-danger {
  color: var(--theme-danger);
}
.warning-tray__signal.is-warning {
  color: var(--theme-warning);
}
.warning-tray__signal.is-success {
  color: var(--theme-success);
}
/* Each row repeats its tone as an icon, so the tone survives a colour-blind
   reader, a mono theme and a screenshot alike. */
.warning-tray__mark {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--theme-accent);
}
.warning-tray__item.is-danger .warning-tray__mark {
  color: var(--theme-danger);
}
.warning-tray__item.is-warning .warning-tray__mark {
  color: var(--theme-warning);
}
.warning-tray__item.is-success .warning-tray__mark {
  color: var(--theme-success);
}
.warning-tray__label {
  flex: 1;
}
.warning-tray__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: 0 var(--sp-3) var(--sp-3);
}
.warning-tray__item {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--theme-accent);
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--glass-solid) 28%, transparent);
}
.warning-tray__item.is-danger {
  border-left-color: var(--theme-danger);
}
.warning-tray__item.is-warning {
  border-left-color: var(--theme-warning);
}
.warning-tray__item.is-success {
  border-left-color: var(--theme-success);
}
.warning-tray__copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.warning-tray__copy strong {
  font-size: var(--text-xs);
}
.warning-tray__copy span {
  /* It is allowed to break a long word, so it has to be allowed to be narrow:
     a flex item's automatic minimum is its content, and a message with a
     40-character URL in it would widen the tray rather than wrap inside it. */
  min-width: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}
.warning-tray__dismiss,
.warning-tray__dismissAll {
  border: 0;
  color: var(--theme-dim);
  background: transparent;
  cursor: pointer;
}
.warning-tray__dismiss {
  font-size: var(--text-lg);
  line-height: 1;
}
.warning-tray__dismissAll {
  align-self: flex-end;
  padding: var(--sp-1) var(--sp-2);
  font-size: var(--text-2xs);
}
.warning-tray__dismiss:hover,
.warning-tray__dismissAll:hover {
  color: var(--theme-text);
}
@keyframes warningTrayIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.warning-panel-enter-active,
.warning-panel-leave-active {
  transition:
    opacity var(--dur-med) var(--ease-out),
    transform var(--dur-med) var(--ease-out),
    max-height var(--dur-med) var(--ease-out);
  overflow: hidden;
}
.warning-panel-enter-from,
.warning-panel-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}
.warning-panel-enter-to,
.warning-panel-leave-from {
  max-height: 520px;
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .warning-panel-enter-active,
  .warning-panel-leave-active {
    transition: none;
  }
}
@media (max-width: 640px) {
  .warning-tray {
    right: var(--sp-3);
    bottom: var(--sp-3);
  }
}
</style>
