<script setup lang="ts">
// "Daily spark": a quote card in the left gutter, below the reminders.
//
// The card is one fixed size whatever the line: a short quote is set large, a
// long one a step or two smaller, always centred in the same space — so the
// column never jumps as the quotes turn over. It turns over by itself every
// EVERY_MS (a thin bar along the foot shows when), and ‹ › step through by
// hand; hovering holds it. The list starts at a different line each day.
//
// Kept here rather than fetched, so it never waits on a network or shows
// nothing; your own, added through the pencil, come first (app.quotes).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import Icon from '@/components/ui/Icon.vue'
import QuotesDialog from '@/components/shell/QuotesDialog.vue'
import { useAppStore } from '@/stores/app'
import { quoteKey } from '@/utils/quotes'

const QUOTES: { text: string; by?: string }[] = [
  { text: 'Small steps every day add up to big results.' },
  { text: 'Done is better than perfect.' },
  { text: 'Focus on progress, not perfection.' },
  { text: 'The secret of getting ahead is getting started.', by: 'Mark Twain' },
  { text: 'Well begun is half done.', by: 'Aristotle' },
  { text: 'It always seems impossible until it is done.', by: 'Nelson Mandela' },
  { text: 'A journey of a thousand miles begins with a single step.', by: 'Lao Tzu' },
  { text: 'We suffer more in imagination than in reality.', by: 'Seneca' },
  { text: 'What we do now echoes in eternity.', by: 'Marcus Aurelius' },
  { text: 'Action is the foundational key to all success.', by: 'Pablo Picasso' },
  { text: 'Simplicity is the ultimate sophistication.', by: 'Leonardo da Vinci' },
  { text: 'Discipline is choosing what you want most over what you want now.' },
  { text: 'One thing at a time, done well.' },
  { text: 'Clear the next task, then the next.' },
  { text: 'Energy flows where attention goes.' },
]
const EVERY_MS = 10000

const { now } = storeToRefs(useUiStore())
// Your own quotes first (the Quotes dialog), then the built-in ones, with any
// line that appears in both shown once.
const { quotes: mine } = storeToRefs(useAppStore())
const all = computed(() => {
  const seen = new Set<string>()
  const out: { text: string; by?: string }[] = []
  for (const q of [
    ...mine.value.map((m) => ({ text: m.text, by: m.by || undefined })),
    ...QUOTES,
  ]) {
    const k = quoteKey(q.text)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(q)
  }
  return out
})
const managing = ref(false)
const start = Math.floor(now.value / 86400000)
const step = ref(0)
const index = computed(() => {
  const n = all.value.length
  return (((start + step.value) % n) + n) % n
})
const quote = computed(() => all.value[index.value])
// Which way the last change went, so the new line slides in from that side.
const dir = ref<1 | -1>(1)

// The size that fits: the card's height is fixed, so the type gives way.
const size = computed(() => {
  const n = quote.value.text.length
  return n <= 34 ? 'lg' : n <= 60 ? 'md' : 'sm'
})

const paused = ref(false)
// Restarted on every change, so a manual step resets the countdown too.
const lap = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
function go(delta: 1 | -1) {
  dir.value = delta
  step.value += delta
  lap.value += 1
  restart()
}
function restart() {
  clearInterval(timer)
  timer = setInterval(() => {
    if (!paused.value) go(1)
  }, EVERY_MS)
}
onMounted(restart)
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section
    class="spark"
    :class="{ 'is-paused': paused, 'go-back': dir === -1 }"
    aria-roledescription="carousel"
    aria-label="Daily spark"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <!-- A large, faint quotation mark behind everything: the card's emblem. -->
    <span class="spark__glyph" aria-hidden="true">“</span>

    <header class="spark__head">
      <span class="spark__label"><span aria-hidden="true">✦</span> Daily spark</span>
      <span class="spark__nav">
        <button type="button" class="spark__btn" aria-label="Previous quote" @click="go(-1)">
          <Icon name="chevron-left" size="xs" />
        </button>
        <span class="spark__count">{{ index + 1 }} / {{ all.length }}</span>
        <button type="button" class="spark__btn" aria-label="Next quote" @click="go(1)">
          <Icon name="chevron-right" size="xs" />
        </button>
        <!-- Your own quotes: add by pasting JSON or lines, or delete. -->
        <button
          type="button"
          class="spark__btn"
          aria-label="Your quotes"
          title="Your quotes"
          @click="managing = true"
        >
          <Icon name="pencil" size="xs" />
        </button>
      </span>
    </header>

    <!-- The fixed stage: the line is centred in it, and swapped in place. -->
    <div class="spark__stage">
      <Transition name="spark-swap" mode="out-in">
        <figure :key="index" class="spark__body" aria-live="polite">
          <blockquote class="spark__text" :class="'is-' + size">
            <span class="spark__mark" aria-hidden="true">“</span
            ><span class="spark__words">{{ quote.text }}</span
            ><span class="spark__mark" aria-hidden="true">”</span>
          </blockquote>
          <figcaption class="spark__by">
            <span class="spark__rule" aria-hidden="true"></span>{{ quote.by ?? 'Aureon' }}
          </figcaption>
        </figure>
      </Transition>
    </div>

    <!-- Time until the next one; starts over with every change. -->
    <span
      :key="'lap' + lap"
      class="spark__timer"
      :style="{ animationDuration: EVERY_MS + 'ms' }"
      aria-hidden="true"
    ></span>
    <QuotesDialog :open="managing" @close="managing = false" />
  </section>
</template>

<style scoped>
/* One size for every quote: the column below never moves. */
.spark {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  height: 236px;
  padding: 14px 18px 18px;
  border-radius: var(--radius-dialog);
  /* The reminder cards' warmed glass, with a glow of the accent rising from
     the lower corner. */
  background:
    radial-gradient(
      120% 90% at 100% 100%,
      color-mix(in oklch, var(--theme-accent) 22%, transparent),
      transparent 60%
    ),
    color-mix(in oklch, var(--theme-accent) 9%, var(--glass-card, var(--theme-card)));
  border: 1px solid color-mix(in oklch, var(--theme-accent) 26%, transparent);
  backdrop-filter: blur(30px) saturate(1.6);
  -webkit-backdrop-filter: blur(30px) saturate(1.6);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--theme-text) 10%, transparent),
    var(--shadow-soft);
}

/* The emblem: the type scale's largest step, drawn up five times. */
.spark__glyph {
  position: absolute;
  z-index: -1;
  right: 26px;
  top: 30px;
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  line-height: 1;
  color: var(--theme-accent);
  opacity: 0.1;
  transform: scale(5.5);
  transform-origin: top right;
  pointer-events: none;
}

.spark__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.spark__label {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-accent);
}
.spark__nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.spark__count {
  min-width: 38px;
  text-align: center;
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--theme-dim);
}
.spark__btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--theme-text) 14%, transparent);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    color var(--dur-fast, 120ms) ease,
    border-color var(--dur-fast, 120ms) ease,
    background var(--dur-fast, 120ms) ease;
}
.spark__btn:hover,
.spark__btn:focus-visible {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  outline: none;
}

.spark__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
}
.spark__body {
  margin: 0;
  width: 100%;
}
.spark__text {
  margin: 0;
  font-weight: var(--weight-semibold);
  font-style: italic;
  letter-spacing: -0.01em;
  /* Never more than four lines, whatever slips through the sizing. */
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-width: 0;
}
.spark__text.is-lg {
  font-size: var(--text-2xl);
  line-height: 1.18;
}
.spark__text.is-md {
  font-size: var(--text-xl);
  line-height: 1.24;
}
.spark__text.is-sm {
  font-size: var(--text-lg);
  line-height: 1.3;
}
/* The words in a light-to-accent sweep. */
.spark__words {
  background: linear-gradient(
    100deg,
    var(--theme-text) 0%,
    var(--theme-text) 45%,
    color-mix(in oklch, var(--theme-accent) 85%, var(--theme-text)) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.spark__mark {
  color: var(--theme-accent);
  font-style: normal;
}
.spark__by {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.04em;
  color: var(--theme-dim);
}
.spark__rule {
  width: 22px;
  height: 2px;
  border-radius: 2px;
  background: var(--theme-accent);
}

.spark__timer {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  background: linear-gradient(90deg, transparent, var(--theme-accent));
  transform-origin: left;
  animation: spark-timer linear forwards;
}
.spark.is-paused .spark__timer {
  animation-play-state: paused;
}
@keyframes spark-timer {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

/* The turn-over: the old line blurs out one way, the new one sharpens in
   from the other. */
.spark-swap-enter-active,
.spark-swap-leave-active {
  transition:
    opacity 0.38s ease,
    transform 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.38s ease;
}
.spark-swap-enter-from {
  opacity: 0;
  transform: translateX(18px);
  filter: blur(6px);
}
.spark-swap-leave-to {
  opacity: 0;
  transform: translateX(-18px);
  filter: blur(6px);
}
.go-back .spark-swap-enter-from {
  transform: translateX(-18px);
}
.go-back .spark-swap-leave-to {
  transform: translateX(18px);
}
@media (prefers-reduced-motion: reduce) {
  .spark-swap-enter-active,
  .spark-swap-leave-active {
    transition: opacity 0.2s ease;
  }
  .spark-swap-enter-from,
  .spark-swap-leave-to,
  .go-back .spark-swap-enter-from,
  .go-back .spark-swap-leave-to {
    transform: none;
    filter: none;
  }
  .spark__timer {
    display: none;
  }
}
</style>
