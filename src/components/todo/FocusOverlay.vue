<script setup lang="ts">
// Focus mode (Todo v2, 5b): one subtask, a 25-minute timer, and nothing else on
// screen. "Done, next" ticks the subtask and moves straight on to the next open
// one under the same todo, so a run of small subtasks can be worked through
// without going back to the list between each.
//
// The session lives in the ui store and is persisted there, so this component
// only draws it; a reload lands back here with the right time left.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore, FOCUS_MS } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { buildIndex, childrenOf } from '@/utils/taskTree'
import { nextFocusAfter } from '@/utils/todoV2'
import Icon from '@/components/ui/Icon.vue'
import Button from '@/components/ui/Button.vue'

const app = useAppStore()
const ui = useUiStore()
const { todos } = storeToRefs(app)
const { focus } = storeToRefs(ui)
const { c, B } = useStyles()

const index = computed(() => buildIndex(todos.value))
const target = computed(() => (focus.value ? index.value.byId.get(focus.value.todoId) : undefined))
const parent = computed(() =>
  target.value?.parentId != null ? index.value.byId.get(target.value.parentId) : undefined,
)
const parentLine = computed(() => {
  const p = parent.value
  if (!p) return target.value?.tag ? target.value.tag : ''
  const kids = childrenOf(index.value, p.id)
  const done = kids.filter((k) => k.status === 'done').length
  return `${p.text || '(untitled)'} · ${done} of ${kids.length}`
})

// A focused todo that has been deleted elsewhere ends the session.
watch(target, (t) => {
  if (focus.value && !t) ui.stopFocus()
})

const clock = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (clock.value = Date.now()), 250)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('keydown', onKey)
})
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && focus.value) ui.stopFocus()
}

const remaining = computed(() => ui.focusRemaining(clock.value))
const running = computed(() => focus.value?.endsAt != null && remaining.value > 0)
const finished = computed(() => !!focus.value && remaining.value <= 0)
watch(finished, (f) => {
  if (!f) return
  ui.pauseFocus()
  app.showToastMsg('Focus session finished — take a break')
})
const time = computed(() => {
  const s = Math.ceil(remaining.value / 1000)
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
})
const pct = computed(() => ((FOCUS_MS - remaining.value) / FOCUS_MS) * 100)

function toggle() {
  if (finished.value && focus.value) ui.startFocus(focus.value.todoId)
  else if (running.value) ui.pauseFocus()
  else ui.resumeFocus()
}
function doneNext() {
  const t = target.value
  if (!t) return
  const next = nextFocusAfter(index.value, t.id)
  if (t.status !== 'done') app.toggleTodo(t.id)
  if (next != null) ui.startFocus(next)
  else ui.stopFocus()
}

// --- styles -----------------------------------------------------------------
const card = computed(() =>
  pxify({
    width: 'min(440px, calc(100vw - 32px))',
    boxSizing: 'border-box',
    padding: 32,
    borderRadius: 28,
    background:
      'radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ' +
      c.value.accent +
      ' 14%, ' +
      c.value.bgSolid +
      '), ' +
      c.value.bgSolid +
      ' 70%)',
    border: B.value,
    boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    textAlign: 'center',
    color: c.value.text,
  }),
)
const label = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim }))
const subTitle = computed(() => pxify({ ...typeStep('lg'), margin: 0 }))
const parentStyle = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim }))
const ring = computed(() =>
  pxify({
    width: 200,
    height: 200,
    margin: '10px 0',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    background: `conic-gradient(${c.value.accent} ${pct.value}%, color-mix(in srgb, ${c.value.text} 10%, transparent) ${pct.value}% 100%)`,
  }),
)
const ringInner = computed(() =>
  pxify({
    width: 184,
    height: 184,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    background: c.value.bgSolid,
    ...typeStep('2xl'),
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.03em',
  }),
)
const actions = pxify({
  display: 'flex',
  gap: 'var(--sp-2)',
  flexWrap: 'wrap',
  justifyContent: 'center',
})
</script>

<template>
  <Transition name="focus-fade">
    <div
      v-if="focus && target"
      class="focus-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
    >
      <div :style="card" class="focus-card">
        <span :style="label">Focusing on</span>
        <h2 :style="subTitle">{{ target.text || '(untitled)' }}</h2>
        <span v-if="parentLine" :style="parentStyle">{{ parentLine }}</span>
        <span :style="ring" role="timer" :aria-label="time + ' left'">
          <span :style="ringInner">{{ time }}</span>
        </span>
        <div :style="actions">
          <Button size="lg" @click="toggle">
            <Icon :name="running ? 'pause' : 'play'" size="sm" />
            {{ finished ? 'Restart' : running ? 'Pause' : 'Resume' }}
          </Button>
          <Button variant="secondary" size="lg" @click="doneNext">Done, next</Button>
          <Button variant="ghost" size="lg" @click="ui.stopFocus()">Exit</Button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.focus-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--glass-solid, #000) 72%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.focus-card {
  transition: transform var(--dur-slide) var(--ease-spring);
}
.focus-fade-enter-active,
.focus-fade-leave-active {
  transition: opacity 300ms ease;
}
.focus-fade-enter-from,
.focus-fade-leave-to {
  opacity: 0;
}
.focus-fade-enter-from .focus-card {
  transform: scale(0.94);
}
@media (prefers-reduced-motion: reduce) {
  .focus-card,
  .focus-fade-enter-active,
  .focus-fade-leave-active {
    transition: none;
  }
}
</style>
