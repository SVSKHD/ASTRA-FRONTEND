<script setup lang="ts">
// The overlap detector (section 21c). Development only.
//
// Section 21c is a list of layout rules — grid and flex only, `min-width: 0` on
// any child holding text, ellipsis on single-line labels, nothing absolutely
// positioned that anybody has to read — and every one of them exists to prevent
// the same two failures: text landing on top of text, and text running off the
// edge of what holds it.
//
// A rule that is only checked by eye is a rule that holds until the next busy
// afternoon. So this measures: it reads the boxes the browser actually laid
// out, on demand and at any width, and names the pairs that are sitting on each
// other. The judgement about what counts is in utils/overlap, where it can be
// argued with in a test.
//
// It ships in development only. `import.meta.env.DEV` is a compile-time
// constant, so the whole thing folds away in a production build.
import { onBeforeUnmount, ref } from 'vue'
import { findCollisions, overflowsX, type Candidate, type Collision } from '@/utils/overlap'

const props = withDefaults(defineProps<{ root?: string }>(), { root: 'body' })

const isDev = import.meta.env.DEV
const collisions = ref<Collision[]>([])
const overflows = ref<string[]>([])
const scanned = ref(0)
const ran = ref(false)
const live = ref(false)
let liveTimer: ReturnType<typeof setInterval> | undefined

// A readable handle for an element, for the report. Nobody can act on
// "DIV[47]", so this reads out the classes and the first few words of text.
function describe(el: Element, index: number): string {
  const tag = el.tagName.toLowerCase()
  const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)
  return `${tag}${cls ? '.' + cls : ''}#${index}${text ? ` “${text}”` : ''}`
}

// What is worth measuring: something that holds its own text, or something a
// reader can click. A wrapper div with no words in it can overlap whatever it
// likes — nobody is reading it.
function isInteresting(el: Element): boolean {
  if (el.closest('[data-overlap-ok]')) return false
  const tag = el.tagName
  if (tag === 'SVG' || tag === 'PATH' || tag === 'BR' || tag === 'SCRIPT') return false
  if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return true
  // Its OWN text, not its descendants': otherwise every ancestor of a word
  // counts, and the whole page is "interesting".
  return Array.from(el.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim().length > 1,
  )
}

function scan() {
  const root = document.querySelector(props.root)
  if (!root) return
  const all = Array.from(root.querySelectorAll<HTMLElement>('*'))
  const seen = new Map<Element, string>()
  const candidates: Candidate[] = []
  const spills: string[] = []

  all.forEach((el, index) => {
    const id = `n${index}`
    seen.set(el, id)
    if (!isInteresting(el)) return
    const rect = el.getBoundingClientRect()
    // Nothing laid out yet (display:none, a closed disclosure) has no box to
    // collide with.
    if (rect.width < 1 || rect.height < 1) return

    const ancestors: string[] = []
    for (let p = el.parentElement; p; p = p.parentElement) {
      const pid = seen.get(p)
      if (pid) ancestors.push(pid)
    }
    candidates.push({
      id,
      box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      where: describe(el, index),
      ancestors,
    })

    const style = getComputedStyle(el)
    const scrollable = style.overflowX === 'auto' || style.overflowX === 'scroll'
    if (overflowsX(el.clientWidth, el.scrollWidth, scrollable)) spills.push(describe(el, index))
  })

  scanned.value = candidates.length
  collisions.value = findCollisions(candidates).slice(0, 40)
  overflows.value = spills.slice(0, 40)
  ran.value = true
}

// Held down while resizing the window, which is where these actually appear:
// a layout is rarely broken at the width it was built at.
function toggleLive() {
  live.value = !live.value
  clearInterval(liveTimer)
  if (live.value) {
    scan()
    liveTimer = setInterval(scan, 600)
  }
}
onBeforeUnmount(() => clearInterval(liveTimer))
</script>

<template>
  <section v-if="isDev" class="odet" data-overlap-ok>
    <header class="odet__head">
      <h3 class="odet__title">Overlap detector</h3>
      <span class="odet__note">dev only · not in the production bundle</span>
      <button type="button" class="odet__btn" @click="scan">Scan</button>
      <button type="button" class="odet__btn" :aria-pressed="live" @click="toggleLive">
        {{ live ? 'Watching…' : 'Watch while resizing' }}
      </button>
    </header>

    <p v-if="!ran" class="odet__note">
      Measures every element that holds its own text or takes a click, and reports the pairs sitting
      on top of each other. Mark a deliberate stack with <code>data-overlap-ok</code> to leave it
      out.
    </p>

    <template v-else>
      <p class="odet__summary">
        {{ scanned }} boxes · {{ collisions.length }} overlapping ·
        {{ overflows.length }} overflowing
      </p>

      <p v-if="!collisions.length && !overflows.length" class="odet__clean">
        Nothing is sitting on anything else at this width.
      </p>

      <ul v-if="collisions.length" class="odet__list">
        <li v-for="(hit, i) in collisions" :key="`c${i}`" class="odet__row">
          <span class="odet__amount">{{ hit.x }}×{{ hit.y }}px</span>
          <span class="odet__what">{{ hit.a }}</span>
          <span class="odet__what">{{ hit.b }}</span>
        </li>
      </ul>

      <ul v-if="overflows.length" class="odet__list">
        <li v-for="(where, i) in overflows" :key="`o${i}`" class="odet__row">
          <span class="odet__amount">overflows</span>
          <span class="odet__what odet__what--wide">{{ where }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.odet {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
}
.odet__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.odet__title {
  margin: 0;
  font-size: var(--text-sm);
}
.odet__note,
.odet__summary,
.odet__clean {
  margin: 0;
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.odet__btn {
  padding: 2px var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-2xs);
  cursor: pointer;
}
.odet__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 260px;
  overflow-y: auto;
}
/* Three tracks, the two names allowed to shrink and ellipsis — a report about
   overflow that overflows would be a poor advertisement. */
.odet__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-2);
  align-items: baseline;
  font-size: var(--text-2xs);
}
.odet__amount {
  color: var(--theme-accent);
  font-variant-numeric: tabular-nums;
}
.odet__what {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--theme-dim);
}
.odet__what--wide {
  grid-column: 2 / -1;
}
</style>
