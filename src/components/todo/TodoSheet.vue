<script setup lang="ts">
// A todo's details on a phone, as a bottom sheet over the list (Todo v2, 3b).
// It replaces the full-screen item dialog for the everyday case — reading a todo
// and ticking its subtasks — so the list stays in view behind it. The dialog is
// still one tap away for editing everything else.
//
// Drag the handle: up to the full snap, down to half, further to dismiss. The
// maths is the detail dialog's (utils/sheetSnap), so the two sheets feel alike.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip, typeStep } from '@/styles'
import { buildIndex, childrenOf } from '@/utils/taskTree'
import { focusTargetOf } from '@/utils/todoV2'
import { richPlain } from '@/utils/richText'
import { clampOffset, offsetFor, snapFor, velocityOf, type SheetSnap } from '@/utils/sheetSnap'
import RemindBell from '@/components/RemindBell.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SubCheck from '@/components/ui/SubCheck.vue'

const app = useAppStore()
const ui = useUiStore()
const { todos } = storeToRefs(app)
const { sheetTodoId } = storeToRefs(ui)
const { c, dark } = useStyles()

const index = computed(() => buildIndex(todos.value))
const todo = computed(() =>
  sheetTodoId.value == null ? undefined : index.value.byId.get(sheetTodoId.value),
)
const subs = computed(() => (todo.value ? childrenOf(index.value, todo.value.id) : []))
const subDone = computed(() => subs.value.filter((s) => s.status === 'done').length)
const desc = computed(() => richPlain(todo.value?.description).trim())
watch(todo, (t) => {
  if (sheetTodoId.value != null && !t) ui.setSheetTodo(null)
})

function close() {
  ui.setSheetTodo(null)
}
// THE GHOST CLICK. A row opens the sheet on pointerup, and on a touchscreen
// the browser then synthesises a `click` at the same spot a moment later —
// which by then lands on this scrim, and a scrim click closes. The sheet opened
// and shut inside one tap. A mouse never saw it: its click goes to the element
// the press started on. So the scrim ignores clicks for a beat after opening.
let openedAt = 0
watch(
  sheetTodoId,
  (id) => {
    if (id != null) openedAt = performance.now()
  },
  { immediate: true },
)
function onScrim() {
  if (performance.now() - openedAt < 450) return
  close()
}
function focusNext() {
  const t = todo.value
  if (!t) return
  const id = focusTargetOf(index.value, t.id)
  if (id == null) return app.showToastMsg('Nothing left to focus on')
  close()
  ui.startFocus(id)
}
function openEditor() {
  const t = todo.value
  if (!t) return
  close()
  app.openEdit('todo', t.id)
}

// --- drag -------------------------------------------------------------------
const sheet = ref<HTMLElement | null>(null)
const snap = ref<SheetSnap>('full')
const drag = ref<{ y: number; base: number; lastY: number; lastT: number; v: number } | null>(null)
const offset = ref(0)
watch(sheetTodoId, () => {
  snap.value = 'full'
  offset.value = 0
})
function height() {
  return sheet.value?.offsetHeight ?? 600
}
function onDown(e: PointerEvent) {
  const base = offsetFor(snap.value, height())
  drag.value = { y: e.clientY, base, lastY: e.clientY, lastT: e.timeStamp, v: 0 }
  offset.value = base
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}
function moveTo(y: number, at: number) {
  const d = drag.value
  if (!d) return
  d.v = velocityOf(y - d.lastY, at - d.lastT)
  d.lastY = y
  d.lastT = at
  offset.value = clampOffset(d.base + y - d.y, height())
}
function onMove(e: PointerEvent) {
  moveTo(e.clientY, e.timeStamp)
}
function onUp() {
  const d = drag.value
  if (!d) return
  drag.value = null
  const moved = Math.abs(offset.value - d.base)
  const to =
    moved < 4 ? (snap.value === 'full' ? 'half' : 'full') : snapFor(offset.value, height(), d.v)
  if (to === 'dismiss') return close()
  snap.value = to
  offset.value = offsetFor(to, height())
}

// --- the whole sheet as a handle --------------------------------------------
// A thumb does not aim for a 40px pill. Anywhere on the sheet, a vertical pull
// moves it — with one exception, the subtask list, which scrolls first: a pull
// down there moves the sheet only once the list is at its top, and a push up
// only while the sheet is at half height. Touch events rather than pointer
// events, because only a non-passive touchmove can take a gesture back from
// the browser's own scrolling.
const listEl = ref<HTMLElement | null>(null)
let touch: { x: number; y: number; decided: '' | 'sheet' | 'scroll' } | null = null
let swallowClick = false
function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1 || (e.target as HTMLElement).closest('.ts-handle')) {
    touch = null
    return
  }
  const p = e.touches[0]
  touch = { x: p.clientX, y: p.clientY, decided: '' }
}
function onTouchMove(e: TouchEvent) {
  const t = touch
  if (!t) return
  const p = e.touches[0]
  const dy = p.clientY - t.y
  const dx = p.clientX - t.x
  if (!t.decided) {
    if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return
    if (Math.abs(dx) > Math.abs(dy)) {
      t.decided = 'scroll'
      return
    }
    const list = listEl.value
    const inList = !!list && list.contains(e.target as Node)
    const listAtTop = !list || list.scrollTop <= 0
    const listScrolls = !!list && list.scrollHeight > list.clientHeight
    const toSheet =
      !inList || !listScrolls || (dy > 0 && listAtTop) || (dy < 0 && snap.value !== 'full')
    t.decided = toSheet ? 'sheet' : 'scroll'
    if (!toSheet) return
    const base = offsetFor(snap.value, height())
    drag.value = { y: p.clientY, base, lastY: p.clientY, lastT: e.timeStamp, v: 0 }
    offset.value = base
  }
  if (t.decided !== 'sheet') return
  e.preventDefault()
  moveTo(p.clientY, e.timeStamp)
}
function onTouchEnd() {
  const t = touch
  touch = null
  if (t?.decided !== 'sheet') return
  // The finger was moving the sheet, so the lift is not a tap on whatever row
  // it ended over.
  swallowClick = true
  setTimeout(() => (swallowClick = false), 400)
  onUp()
}
function onClickCapture(e: MouseEvent) {
  if (!swallowClick) return
  swallowClick = false
  e.preventDefault()
  e.stopPropagation()
}

// --- styles -----------------------------------------------------------------
const sheetStyle = computed(() =>
  pxify({
    transform: `translateY(${offset.value}px)`,
    transition: drag.value ? 'none' : undefined,
  }),
)
const topRow = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' })
const tagStyle = computed(() =>
  todo.value?.tag
    ? pxify({ ...tagChip(c.value, todo.value.tag, dark.value), alignSelf: 'center' })
    : {},
)
const title = computed(() => pxify({ ...typeStep('lg'), margin: 0 }))
const descStyle = computed(() => pxify({ ...typeStep('base'), color: c.value.dim, margin: 0 }))
const progress = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' })
const track = computed(() =>
  pxify({
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    background: 'color-mix(in srgb, ' + c.value.text + ' 8%, transparent)',
  }),
)
const fill = computed(() =>
  pxify({
    display: 'block',
    height: '100%',
    width: '100%',
    background: c.value.accent,
    transformOrigin: 'left',
    transform: `scaleX(${subs.value.length ? subDone.value / subs.value.length : 0})`,
    transition: 'transform .5s cubic-bezier(.2,.8,.2,1)',
  }),
)
const count = computed(() =>
  pxify({ ...typeStep('sm'), color: c.value.dim, fontVariantNumeric: 'tabular-nums' }),
)
const list = pxify({
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  minHeight: 0,
  overscrollBehavior: 'contain',
})
function subText(done: boolean) {
  return pxify({
    ...typeStep('md'),
    flex: 1,
    minWidth: 0,
    color: done ? c.value.dim : c.value.text,
    textDecoration: done ? 'line-through' : 'none',
  })
}
const empty = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim, padding: '12px 0' }))
</script>

<template>
  <Transition name="ts-fade">
    <div v-if="todo" class="ts-scrim" @click="onScrim"></div>
  </Transition>
  <Transition name="ts-up">
    <section
      v-if="todo"
      ref="sheet"
      class="ts-sheet"
      :style="sheetStyle"
      role="dialog"
      aria-modal="true"
      :aria-label="todo.text || 'Todo'"
      @keydown.esc="close"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
      @click.capture="onClickCapture"
    >
      <button
        type="button"
        class="ts-handle"
        aria-label="Drag to resize, tap to toggle size"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <span></span>
      </button>
      <div :style="topRow">
        <span v-if="todo.tag" :style="tagStyle">{{ todo.tag }}</span>
        <span style="flex: 1"></span>
        <IconButton label="Focus" size="lg" active @click="focusNext">
          <Icon name="timer" size="md" />
        </IconButton>
        <RemindBell collection="todos" :id="todo.id" />
        <IconButton label="Open in editor" size="lg" active @click="openEditor">
          <Icon name="external-link" size="md" />
        </IconButton>
      </div>
      <h2 :style="title">{{ todo.text || '(untitled)' }}</h2>
      <p v-if="desc" :style="descStyle">{{ desc }}</p>
      <div v-if="subs.length" :style="progress">
        <span :style="track"><span :style="fill"></span></span>
        <span :style="count">{{ subDone }} of {{ subs.length }}</span>
      </div>
      <div ref="listEl" :style="list">
        <!-- The whole 48px row toggles; the box is the same control with
             its pop, and stops the tap so it does not count twice. -->
        <div v-for="s in subs" :key="s.id" class="ts-sub" @click="app.toggleTodo(s.id)">
          <SubCheck :done="s.status === 'done'" size="md" @toggle="app.toggleTodo(s.id)" />
          <span :style="subText(s.status === 'done')">{{ s.text || '(untitled)' }}</span>
        </div>
        <span v-if="!subs.length" :style="empty">No subtasks. Open the editor to add some.</span>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.ts-scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.5);
}
.ts-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 51;
  height: min(640px, 92dvh);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: 6px 20px calc(24px + env(safe-area-inset-bottom, 0px));
  border-radius: 30px 30px 0 0;
  background: var(--glass-solid, var(--theme-card));
  border-top: 1px solid var(--theme-border);
  box-shadow: 0 -20px 40px -10px rgba(0, 0, 0, 0.6);
  color: var(--theme-text);
  transition: transform var(--dur-slide) var(--ease-sheet);
}
.ts-handle {
  align-self: center;
  width: 64px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: grab;
  touch-action: none;
}
.ts-handle span {
  width: 40px;
  height: 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--theme-text) 22%, transparent);
}
.ts-sub {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  border-bottom: 1px solid var(--theme-border);
  cursor: pointer;
}
.ts-fade-enter-active,
.ts-fade-leave-active {
  transition: opacity 300ms ease;
}
.ts-fade-enter-from,
.ts-fade-leave-to {
  opacity: 0;
}
.ts-up-enter-from,
.ts-up-leave-to {
  transform: translateY(105%) !important;
}
@media (prefers-reduced-motion: reduce) {
  .ts-sheet,
  .ts-fade-enter-active,
  .ts-fade-leave-active {
    transition: none;
  }
}
</style>
