<script setup lang="ts">
// Bots tab: a control surface + dashboard for the trading bots. The app only
// reads what the bot process writes and flips `enabled`; it never runs strategy
// logic. One floating glass card per bot, a red "Stop all" kill switch, and a
// name-typed confirm before any live toggle.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import {
  botDisplayStatus,
  dailyLossColor,
  dailyLossPct,
  relativeHeartbeat,
  statusColor,
} from '@/utils/bots'
import type { Bot } from '@/types'

const app = useAppStore()
const { c, panelStyle, s } = useStyles()
const { bots } = storeToRefs(app)
const { now } = storeToRefs(useUiStore())

defineExpose({ focus: () => {} })

const GOOD = 'oklch(0.72 0.15 150)'
const AMBER = 'oklch(0.8 0.16 72)'
const RED = 'oklch(0.64 0.22 25)'
const COLORS = { good: GOOD, warn: AMBER, bad: RED }

const anyEnabled = computed(() => bots.value.some((b) => b.enabled))

function fmtUsd(n: number): string {
  const sign = n < 0 ? '−' : ''
  return sign + '$' + Math.abs(Math.round(n * 100) / 100).toLocaleString('en-US')
}
function statusOf(b: Bot) {
  void now.value
  return botDisplayStatus(b, now.value)
}

// --- live-toggle confirm ----------------------------------------------------
const confirmBot = ref<Bot | null>(null)
const confirmText = ref('')
function requestToggle(b: Bot) {
  if (b.pending) return
  // Turning a live bot on or off is gated behind typing its name; paper/demo
  // toggles instantly.
  if (b.mode === 'live') {
    confirmBot.value = b
    confirmText.value = ''
  } else {
    app.toggleBot(b.id)
  }
}
function confirmToggle() {
  const b = confirmBot.value
  if (!b || confirmText.value.trim() !== b.name) return
  app.toggleBot(b.id)
  confirmBot.value = null
}
function stopAll() {
  if (confirm('Stop all bots? This sets every bot to disabled.')) app.stopAllBots()
}

// --- styles -----------------------------------------------------------------
const header = pxify({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
})
const title = computed(() =>
  pxify({ ...typeStep('md'), fontWeight: 'var(--weight-semibold)', color: c.value.text }),
)
const killBtn = pxify({
  ...typeStep('xs'),
  fontWeight: 'var(--weight-semibold)',
  padding: '8px 14px',
  borderRadius: 999,
  border: '1px solid ' + RED,
  background: 'transparent',
  color: RED,
  cursor: 'pointer',
})
const list = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '2px 2px 6px',
})
const card = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
  }),
)
const cardHead = pxify({ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' })
const botName = computed(() =>
  pxify({ ...typeStep('base'), fontWeight: 'var(--weight-semibold)', color: c.value.text }),
)
function chip(bg: string, fg: string) {
  return pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.04em',
    padding: '3px 8px',
    borderRadius: 999,
    background: bg,
    color: fg,
  })
}
const softChip = computed(() => chip(c.value.input, c.value.dim))
function dot(color: string) {
  return pxify({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    boxShadow: '0 0 8px ' + color,
    flexShrink: 0,
  })
}
const spacer = pxify({ flex: 1 })
function toggleTrack(on: boolean, pending: boolean) {
  return pxify({
    position: 'relative',
    width: 46,
    height: 26,
    borderRadius: 999,
    background: pending ? AMBER : on ? c.value.accent : c.value.input,
    border: '1px solid ' + c.value.border,
    cursor: pending ? 'default' : 'pointer',
    transition: 'background .2s ease',
    flexShrink: 0,
    opacity: pending ? 0.8 : 1,
  })
}
function toggleKnob(on: boolean) {
  return pxify({
    position: 'absolute',
    top: 2,
    left: on ? 22 : 2,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left .2s cubic-bezier(.4,1.3,.4,1)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  })
}
const metaRow = computed(() =>
  pxify({ display: 'flex', gap: 16, flexWrap: 'wrap', ...typeStep('xs'), color: c.value.dim }),
)
const strong = computed(() => pxify({ color: c.value.text, fontWeight: 'var(--weight-semibold)' }))
const barTrack = computed(() =>
  pxify({
    position: 'relative',
    height: 8,
    borderRadius: 999,
    background: c.value.input,
    overflow: 'hidden',
  }),
)
function barFill(pct: number, color: string) {
  return pxify({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: pct + '%',
    background: color,
    boxShadow: '0 0 8px ' + color,
    transition: 'width .4s ease, background .3s ease',
  })
}
const sectionLabel = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
    marginBottom: 2,
  }),
)
const table = pxify({ width: '100%', borderCollapse: 'collapse', ...typeStep('xs') })
const th = computed(() =>
  pxify({
    textAlign: 'left',
    padding: '4px 6px',
    color: c.value.dim,
    borderBottom: '1px solid ' + c.value.border,
    fontWeight: 'var(--weight-semibold)',
  }),
)
const td = computed(() => pxify({ padding: '4px 6px', color: c.value.text, whiteSpace: 'nowrap' }))
const basketBox = computed(() =>
  pxify({
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    ...typeStep('xs'),
    color: c.value.dim,
    padding: '10px 12px',
    borderRadius: 12,
    background: c.value.input,
  }),
)

// A tiny equity sparkline as an inline polyline.
function sparkPoints(values: number[]): string {
  if (values.length < 2) return ''
  const w = 120
  const h = 30
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / span) * h
      return x.toFixed(1) + ',' + y.toFixed(1)
    })
    .join(' ')
}
function sparkColor(values: number[]): string {
  if (values.length < 2) return c.value.dim
  return values[values.length - 1] >= values[0] ? GOOD : RED
}

// --- zero state -------------------------------------------------------------
const emptyWrap = pxify({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  textAlign: 'center',
})
const emptyOrb = computed(() =>
  pxify({
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 32%, ' + c.value.accent + ' 0%, transparent 72%)',
    boxShadow: '0 0 24px ' + c.value.accent,
  }),
)
const dialogOverlay = pxify({
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  background: 'rgba(0,0,0,0.45)',
  display: 'grid',
  placeItems: 'center',
})
const dialogCard = computed(() =>
  pxify({
    width: 'min(92vw, 380px)',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 20,
    padding: 20,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    color: c.value.text,
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <div :style="header">
      <span :style="title">Bots</span>
      <button v-if="anyEnabled" :style="killBtn" @click="stopAll">Stop all bots</button>
    </div>

    <div v-if="!bots.length" :style="emptyWrap">
      <span :style="emptyOrb"></span>
      <div>
        <div :style="strong">No bots connected</div>
        <div :style="{ color: c.dim, ...typeStep('sm'), maxWidth: '320px', marginTop: '4px' }">
          Point your trading bot's service account at
          <code>users/&lt;uid&gt;/bots/&lt;botId&gt;</code> and it will appear here. See the write
          contract in the README.
        </div>
      </div>
    </div>

    <div v-else :style="list">
      <div v-for="b in bots" :key="b.id" :style="card">
        <!-- header row -->
        <div :style="cardHead">
          <span
            :style="dot(statusColor(statusOf(b), COLORS))"
            :title="'heartbeat ' + relativeHeartbeat(b.heartbeatAt, now)"
          ></span>
          <span :style="botName">{{ b.name }}</span>
          <span :style="softChip">{{ b.symbol }}</span>
          <span
            :style="
              b.mode === 'live'
                ? chip('color-mix(in oklch, ' + RED + ' 22%, transparent)', RED)
                : softChip
            "
            >{{ b.mode === 'live' ? 'Live' : b.mode === 'demo' ? 'Demo' : 'Paper' }}</span
          >
          <span :style="softChip">{{ b.lot }} lot</span>
          <span :style="spacer"></span>
          <span
            v-if="b.pending"
            :style="{ ...typeStep('xs'), color: AMBER, fontWeight: 'var(--weight-semibold)' }"
          >
            {{ b.enabled ? 'Starting…' : 'Stopping…' }}
          </span>
          <div
            :style="toggleTrack(b.enabled, b.pending === true)"
            role="switch"
            :aria-checked="b.enabled"
            :aria-label="'Enable ' + b.name"
            @click="requestToggle(b)"
          >
            <span :style="toggleKnob(b.enabled)"></span>
          </div>
        </div>

        <!-- daily loss bar -->
        <div>
          <div :style="sectionLabel">Daily loss</div>
          <div :style="barTrack">
            <span
              :style="
                barFill(
                  dailyLossPct(b.dailyLossUsed, b.dailyLossCap),
                  dailyLossColor(b.dailyLossUsed, b.dailyLossCap, COLORS),
                )
              "
            ></span>
          </div>
          <div :style="{ ...typeStep('xs'), color: c.dim, marginTop: '4px' }">
            {{ fmtUsd(-Math.abs(b.dailyLossUsed)) }} of {{ fmtUsd(-Math.abs(b.dailyLossCap)) }}
          </div>
        </div>

        <!-- today stats -->
        <div :style="metaRow">
          <span
            >Realized <span :style="strong">{{ fmtUsd(b.realizedPl) }}</span></span
          >
          <span
            >Floating <span :style="strong">{{ fmtUsd(b.floatingPl) }}</span></span
          >
          <span
            >Trades <span :style="strong">{{ b.tradeCount }}</span></span
          >
          <span
            >Win rate <span :style="strong">{{ Math.round(b.winRate * 100) }}%</span></span
          >
          <span v-if="b.phase"
            >Phase <span :style="strong">{{ b.phase }}</span> · {{ b.phaseRemaining }}</span
          >
        </div>

        <!-- equity sparkline -->
        <svg v-if="b.equityCurve.length > 1" width="120" height="30" viewBox="0 0 120 30">
          <polyline
            :points="sparkPoints(b.equityCurve)"
            fill="none"
            :stroke="sparkColor(b.equityCurve)"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>

        <!-- basket block -->
        <div v-if="b.basket" :style="basketBox">
          <span
            >Basket <span :style="strong">{{ b.basket.open ? 'open' : 'closed' }}</span></span
          >
          <span
            >Layers <span :style="strong">{{ b.basket.layers }}</span></span
          >
          <span
            >Floating <span :style="strong">{{ fmtUsd(b.basket.floatingTotal) }}</span> /
            {{ fmtUsd(b.basket.stop) }}</span
          >
          <span v-if="b.basket.openedAt"
            >Open for
            <span :style="strong">{{ relativeHeartbeat(b.basket.openedAt, now) }}</span></span
          >
        </div>

        <!-- open positions -->
        <div v-if="b.positions.length">
          <div :style="sectionLabel">Open positions</div>
          <table :style="table">
            <thead>
              <tr>
                <th :style="th">Ticket</th>
                <th :style="th">Dir</th>
                <th :style="th">Lot</th>
                <th :style="th">Entry</th>
                <th :style="th">Now</th>
                <th :style="th">Float</th>
                <th :style="th">SL</th>
                <th :style="th">Layer</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in b.positions" :key="p.ticket">
                <td :style="td">{{ p.ticket }}</td>
                <td :style="td">{{ p.direction }}</td>
                <td :style="td">{{ p.lot }}</td>
                <td :style="td">{{ p.entry }}</td>
                <td :style="td">{{ p.current }}</td>
                <td :style="[td, { color: p.floatingPl < 0 ? RED : GOOD }]">
                  {{ fmtUsd(p.floatingPl) }}
                </td>
                <td :style="td">{{ p.sl }}</td>
                <td :style="td">{{ p.layer || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- live-toggle confirm -->
    <div v-if="confirmBot" :style="dialogOverlay" @click.self="confirmBot = null">
      <div :style="dialogCard">
        <div :style="{ fontWeight: 'var(--weight-semibold)' }">Confirm live toggle</div>
        <div :style="{ ...typeStep('sm'), color: c.dim }">
          This is a <strong :style="{ color: RED }">live</strong> bot. Type its name
          <strong>{{ confirmBot.name }}</strong> to {{ confirmBot.enabled ? 'stop' : 'start' }} it.
        </div>
        <input :style="s.input" v-model="confirmText" :placeholder="confirmBot.name" />
        <div :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
          <button :style="s.cancelBtn" @click="confirmBot = null">Cancel</button>
          <button
            :style="[s.saveBtn, { opacity: confirmText.trim() === confirmBot.name ? 1 : 0.5 }]"
            :disabled="confirmText.trim() !== confirmBot.name"
            @click="confirmToggle"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
