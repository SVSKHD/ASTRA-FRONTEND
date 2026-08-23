<script setup lang="ts">
// First-run empty state for the Goals tab (task 12b). Instead of a bare "no goals
// yet", a centered creation panel that teaches all three entry paths at a glance —
// create manually, paste JSON, or import a spasta link — plus a collapsed "See the
// format" disclosure with a copyable sample and the inline-shorthand legend.
import { ref } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import Icon from '@/components/ui/Icon.vue'

const emit = defineEmits<{
  (e: 'new'): void
  (e: 'paste-json'): void
  (e: 'import-link'): void
}>()

const { c } = useStyles()

const SAMPLE = `{ "project": "learningandgoals",
  "goals": [{ "title": "Ship the trading bot",
              "timeline": { "start": "2026-08-15", "target": "2026-11-30" },
              "points": ["Finish backtest harness ~2h", "Paper trade @2026-09-15"] }] }`

function choose(k: 'new' | 'paste-json' | 'import-link') {
  if (k === 'new') emit('new')
  else if (k === 'paste-json') emit('paste-json')
  else emit('import-link')
}

const showFormat = ref(false)
const copied = ref(false)
async function copySample() {
  try {
    await navigator.clipboard.writeText(SAMPLE)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* clipboard blocked — the sample is visible to copy by hand */
  }
}

const CARDS = [
  {
    key: 'new' as const,
    title: 'Create manually',
    body: 'Start blank and add points as you go.',
    action: 'New goal',
    primary: true,
  },
  {
    key: 'paste-json' as const,
    title: 'Paste JSON',
    body: 'Bring a structured goal with timeline and points.',
    action: 'Paste JSON',
    primary: false,
  },
  {
    key: 'import-link' as const,
    title: 'Import from link',
    body: 'Open a spasta.online goals link.',
    action: 'Import link',
    primary: false,
  },
]

// --- styles ------------------------------------------------------------------
const wrap = computedStyle({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--sp-4)',
  padding: '32px 16px',
  textAlign: 'center',
  maxWidth: 760,
  margin: '0 auto',
})
function computedStyle(o: Record<string, string | number>) {
  return pxify(o)
}
const iconWrap = () => pxify({ color: c.value.dim, opacity: 0.6 })
const heading = () =>
  pxify({ ...typeStep('lg'), fontWeight: 'var(--weight-semibold)', color: c.value.text })
const sub = () => pxify({ ...typeStep('sm'), color: c.value.dim })
const grid = pxify({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 'var(--sp-3)',
  width: '100%',
  marginTop: 6,
})
const cardStyle = () =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    padding: 16,
    borderRadius: 'var(--radius-dialog)',
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    textAlign: 'left',
  })
const cardTitle = () =>
  pxify({ ...typeStep('base'), fontWeight: 'var(--weight-semibold)', color: c.value.text })
const cardBody = () => pxify({ ...typeStep('xs'), color: c.value.dim, lineHeight: 1.4, flex: 1 })
const primaryBtn = () =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '8px 12px',
    borderRadius: 'var(--radius-pill)',
    border: 'none',
    background: c.value.accent,
    color: c.value.onAccent,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  })
const ghostBtn = () =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '8px 12px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.text,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  })
const discBtn = () =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.dim,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  })
const codeWrap = () =>
  pxify({
    position: 'relative',
    width: '100%',
    textAlign: 'left',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    padding: '12px 14px',
    overflowX: 'auto',
  })
const codeStyle = () =>
  pxify({
    margin: 0,
    ...typeStep('xs'),
    lineHeight: 1.5,
    color: c.value.text,
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'pre',
  })
const copyBtn = () =>
  pxify({
    position: 'absolute',
    top: 8,
    right: 8,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '4px 8px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    color: c.value.dim,
    cursor: 'pointer',
  })
const legend = () => pxify({ ...typeStep('xs'), color: c.value.dim, marginTop: 6 })
</script>

<template>
  <div :style="wrap">
    <span :style="iconWrap()"><Icon name="football" size="xl" /></span>
    <div :style="heading()">Set your first goal</div>
    <div :style="sub()">Track targets, checklists and daily wins.</div>

    <div :style="grid">
      <div v-for="card in CARDS" :key="card.key" :style="cardStyle()">
        <div :style="cardTitle()">{{ card.title }}</div>
        <div :style="cardBody()">{{ card.body }}</div>
        <button :style="card.primary ? primaryBtn() : ghostBtn()" @click="choose(card.key)">
          {{ card.action }}
        </button>
      </div>
    </div>

    <button :style="discBtn()" @click="showFormat = !showFormat">
      {{ showFormat ? '▾' : '▸' }} See the format
    </button>
    <template v-if="showFormat">
      <div :style="codeWrap()">
        <button :style="copyBtn()" @click="copySample">{{ copied ? 'Copied ✓' : 'Copy' }}</button>
        <pre :style="codeStyle()">{{ SAMPLE }}</pre>
      </div>
      <div :style="legend()">
        Inline shorthand — <code>~2h</code> estimate, <code>@date</code> due, <code>#tag</code>.
      </div>
    </template>
  </div>
</template>
