<script setup lang="ts">
// The Import tab (section 32's odd one out).
//
// Every other mode under Trades is the month on the server, read through the
// calendar. This one is a file the reader hands over: parsed in the browser,
// charted, and gone the moment they clear it or leave the tab. Nothing is
// written, nothing is merged into the log, and no id is minted — which is why
// it sits outside `tv__main` rather than beside the calendar. A CSV spanning
// three years has nothing to say to a month picker.
//
// THE CHARTS, and why these:
//
//   Headline figures are a KPI row, not a chart. "Total P/L" is one number and
//   a one-bar bar chart is the classic way to say a number badly.
//
//   Monthly P/L is a column chart around a zero baseline, because the question
//   is polarity — was the month up or down — and that is what a baseline shows.
//   The sign is carried by WHICH SIDE of the line the column is on before it is
//   carried by colour, so the chart still reads with red and green confused,
//   which is the one pair a trading log cannot avoid.
//
//   Equity is the same columns run cumulatively: the shape of the account over
//   the file, on one axis. Never a second scale on the same plot — two y-axes
//   invent a correlation the data does not have.
//
// Both charts are built from divs. An `<svg>` in a template is reserved for the
// icon set and for the handful of allowlisted data-driven drawings (section
// 21e's audit), and a column chart does not need one.
import { computed, ref } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import {
  importRejectReason,
  overallStats,
  parseTradeCsv,
  summariseByMonth,
  type ImportedTrade,
} from '@/utils/tradeImport'
import { fmt2, monthName, signed2 } from '@/utils/format'

const rows = ref<ImportedTrade[]>([])
const fileName = ref('')
const error = ref('')
const notice = ref('')
const busy = ref(false)
const dragging = ref(false)

const months = computed(() => summariseByMonth(rows.value))
const stats = computed(() => overallStats(rows.value, months.value))
const loaded = computed(() => rows.value.length > 0)

// Both charts are scaled by the largest absolute value in them, so a month at
// the top of the plot is the biggest month and not simply the last one.
const plScale = computed(() => Math.max(1, ...months.value.map((m) => Math.abs(m.pl))))
const equityScale = computed(() => Math.max(1, ...months.value.map((m) => Math.abs(m.cumulative))))

/** A column's height as a percentage of its half of the plot. */
function height(value: number, scale: number): string {
  if (!value) return '0%'
  // A floor of 2%, so a month that made eleven rupees is still a mark rather
  // than a gap in the row.
  return Math.max(2, Math.round((Math.abs(value) / scale) * 100)) + '%'
}

/**
 * Which columns get a label under them. Every month is unreadable past about a
 * year and a half, so the axis thins out — but the first and last always carry
 * one, because they are what say what the file covers.
 */
const labelEvery = computed(() =>
  months.value.length <= 18 ? 1 : Math.ceil(months.value.length / 12),
)
function labelled(index: number): boolean {
  return index === 0 || index === months.value.length - 1 || index % labelEvery.value === 0
}

/** 'Sep 26' — the year is half the information when a file spans three of them. */
function shortMonth(month: string): string {
  return `${monthName(month).slice(0, 3)} ${month.slice(2, 4)}`
}

function tip(month: { month: string; pl: number; trades: number; wins: number; losses: number }) {
  return `${shortMonth(month.month)} · ${signed2(month.pl)} · ${month.trades} trades · ${month.wins}W ${month.losses}L`
}

function reset() {
  rows.value = []
  fileName.value = ''
  error.value = ''
  notice.value = ''
}

function load(file: File | undefined) {
  if (!file) return
  reset()
  const reason = importRejectReason(file)
  if (reason) {
    error.value = reason
    return
  }
  fileName.value = file.name
  busy.value = true

  const reader = new FileReader()
  reader.onerror = () => {
    busy.value = false
    error.value = 'That file could not be read.'
  }
  reader.onload = () => {
    const text = String(reader.result ?? '')
    // A 30MB file is a second or so of parsing, and it blocks. Yielding a frame
    // first lets "Reading…" actually paint rather than appearing after the work
    // it was meant to cover.
    setTimeout(() => {
      const out = parseTradeCsv(text)
      busy.value = false
      if (out.error) {
        error.value = out.error
        if (out.headers.length) {
          error.value += ` Columns found: ${out.headers.slice(0, 12).join(', ')}.`
        }
        return
      }
      rows.value = out.rows
      const notes: string[] = []
      if (out.skipped) {
        notes.push(
          `${out.skipped} line${out.skipped === 1 ? '' : 's'} could not be read and were left out`,
        )
      }
      if (out.assumedDayFirst) {
        notes.push('dates like 04/09 were read as day/month')
      }
      notice.value = notes.length ? notes.join(' · ') : ''
    }, 0)
  }
  reader.readAsText(file)
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  load(input.files?.[0])
  // Cleared so picking the same file twice in a row still fires a change.
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  load(event.dataTransfer?.files?.[0])
}
</script>

<template>
  <section class="timp">
    <!-- The drop zone stays put once a file is loaded: swapping it for the
         charts would leave no way to load a second file without a reload. -->
    <div
      class="timp__drop"
      :class="{ 'is-dragging': dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="timp__dropmain">
        <Icon name="notebook" size="md" />
        <div class="timp__droptext">
          <p class="timp__droptitle">
            {{ loaded ? fileName : 'Drop a trade history CSV here' }}
          </p>
          <p class="timp__drophint">
            <template v-if="busy">Reading…</template>
            <template v-else-if="loaded">
              {{ stats.trades.toLocaleString() }} trades · {{ months.length }} month{{
                months.length === 1 ? '' : 's'
              }}
              · {{ stats.from }} → {{ stats.to }}
            </template>
            <template v-else>
              Up to 30 MB. Nothing is uploaded or saved — the file is read here and charted, and
              clearing it or leaving this tab drops it.
            </template>
          </p>
        </div>
      </div>
      <div class="timp__dropacts">
        <label class="timp__choose">
          <input type="file" accept="text/csv,.csv,.txt" hidden :disabled="busy" @change="onPick" />
          <span>{{ loaded ? 'Choose another' : 'Choose file…' }}</span>
        </label>
        <Button v-if="loaded" variant="ghost" size="sm" @click="reset">Clear</Button>
      </div>
    </div>

    <Alert
      v-if="error"
      tone="danger"
      title="Could not read that file"
      dismissible
      @dismiss="error = ''"
    >
      {{ error }}
    </Alert>
    <Alert
      v-else-if="notice"
      tone="info"
      title="Read with notes"
      dismissible
      @dismiss="notice = ''"
    >
      {{ notice }}
    </Alert>

    <template v-if="loaded">
      <!-- The headline numbers are numbers. -->
      <div class="timp__kpis">
        <div class="timp__kpi">
          <span class="timp__kpivalue" :class="stats.pl >= 0 ? 'is-pos' : 'is-neg'">
            {{ signed2(stats.pl) }}
          </span>
          <span class="timp__kpilabel">Net P/L</span>
        </div>
        <div class="timp__kpi">
          <span class="timp__kpivalue">{{ stats.trades.toLocaleString() }}</span>
          <span class="timp__kpilabel">Trades</span>
        </div>
        <div class="timp__kpi">
          <span class="timp__kpivalue">{{ Math.round(stats.winRate * 100) }}%</span>
          <span class="timp__kpilabel">Win rate · {{ stats.wins }}W {{ stats.losses }}L</span>
        </div>
        <div class="timp__kpi">
          <span class="timp__kpivalue is-pos">{{ stats.best ? signed2(stats.best.pl) : '—' }}</span>
          <span class="timp__kpilabel"
            >Best · {{ stats.best ? shortMonth(stats.best.month) : '—' }}</span
          >
        </div>
        <div class="timp__kpi">
          <span class="timp__kpivalue is-neg">{{
            stats.worst ? signed2(stats.worst.pl) : '—'
          }}</span>
          <span class="timp__kpilabel"
            >Worst · {{ stats.worst ? shortMonth(stats.worst.month) : '—' }}</span
          >
        </div>
        <div class="timp__kpi">
          <span class="timp__kpivalue">{{ stats.symbols || '—' }}</span>
          <span class="timp__kpilabel">Symbols</span>
        </div>
      </div>

      <figure class="timp__fig">
        <figcaption class="timp__figtitle">
          Profit and loss by month
          <span class="timp__figsub">above and below the line, in the file's own currency</span>
        </figcaption>
        <div class="timp__plot" role="img" aria-label="Profit and loss by month">
          <div class="timp__zero" aria-hidden="true"></div>
          <div class="timp__cols">
            <div v-for="m in months" :key="m.month" class="timp__col" :title="tip(m)">
              <span class="timp__half timp__half--up">
                <span
                  v-if="m.pl > 0"
                  class="timp__bar timp__bar--pos"
                  :style="{ height: height(m.pl, plScale) }"
                ></span>
              </span>
              <span class="timp__half timp__half--down">
                <span
                  v-if="m.pl < 0"
                  class="timp__bar timp__bar--neg"
                  :style="{ height: height(m.pl, plScale) }"
                ></span>
              </span>
            </div>
          </div>
        </div>
        <div class="timp__axis">
          <span v-for="(m, i) in months" :key="m.month" class="timp__tick">
            {{ labelled(i) ? shortMonth(m.month) : '' }}
          </span>
        </div>
      </figure>

      <figure class="timp__fig">
        <figcaption class="timp__figtitle">
          Running total
          <span class="timp__figsub">the account across the file, cumulative</span>
        </figcaption>
        <div class="timp__plot" role="img" aria-label="Cumulative profit and loss by month">
          <div class="timp__zero" aria-hidden="true"></div>
          <div class="timp__cols">
            <div
              v-for="m in months"
              :key="m.month"
              class="timp__col"
              :title="`${shortMonth(m.month)} · running total ${signed2(m.cumulative)}`"
            >
              <span class="timp__half timp__half--up">
                <span
                  v-if="m.cumulative > 0"
                  class="timp__bar timp__bar--equity"
                  :style="{ height: height(m.cumulative, equityScale) }"
                ></span>
              </span>
              <span class="timp__half timp__half--down">
                <span
                  v-if="m.cumulative < 0"
                  class="timp__bar timp__bar--neg"
                  :style="{ height: height(m.cumulative, equityScale) }"
                ></span>
              </span>
            </div>
          </div>
        </div>
        <div class="timp__axis">
          <span v-for="(m, i) in months" :key="m.month" class="timp__tick">
            {{ labelled(i) ? shortMonth(m.month) : '' }}
          </span>
        </div>
      </figure>

      <!-- Every value in both charts, in text. A hover tip is an enhancement;
           it is never the only way to read a figure. -->
      <details class="timp__table">
        <summary>The months as a table</summary>
        <div class="timp__tablewrap">
          <table>
            <caption class="ui-sr-only">
              Imported trades summarised by month
            </caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" class="is-num">Trades</th>
                <th scope="col" class="is-num">Won</th>
                <th scope="col" class="is-num">Lost</th>
                <th scope="col" class="is-num">P/L</th>
                <th scope="col" class="is-num">Running</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in months" :key="m.month">
                <td>{{ shortMonth(m.month) }}</td>
                <td class="is-num">{{ m.trades }}</td>
                <td class="is-num">{{ m.wins }}</td>
                <td class="is-num">{{ m.losses }}</td>
                <td class="is-num" :class="m.pl >= 0 ? 'is-pos' : 'is-neg'">{{ signed2(m.pl) }}</td>
                <td class="is-num" :class="m.cumulative >= 0 ? 'is-pos' : 'is-neg'">
                  {{ fmt2(m.cumulative) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.timp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}

/* ---- the drop zone --------------------------------------------------------*/
.timp__drop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: 1px dashed var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.timp__drop.is-dragging {
  border-color: var(--theme-accent);
  border-style: solid;
}
.timp__dropmain {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  color: var(--theme-dim);
}
.timp__droptext {
  min-width: 0;
}
.timp__droptitle {
  margin: 0;
  /* A dropped file can be named anything at all, and a long one would push the
     actions off their own row without this (section 26d, rule 3). */
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
  overflow-wrap: anywhere;
}
.timp__drophint {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  line-height: 1.45;
  color: var(--text-secondary, var(--theme-dim));
}
.timp__dropacts {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-shrink: 0;
}
/* The input is `hidden` and the label is the control (acceptance 126): a bare
   file input cannot be styled and reads as a different control on every
   platform. Clicking the label still opens the operating system's picker, which
   is the whole of what the element is for. */
.timp__choose {
  display: inline-flex;
  align-items: center;
  padding: 4px var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
  cursor: pointer;
}
.timp__choose:hover {
  color: var(--theme-text);
  border-color: var(--theme-accent);
}

/* ---- the headline row -----------------------------------------------------*/
.timp__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--sp-2);
}
.timp__kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  min-width: 0;
}
/* Proportional figures, not tabular: equal-width digits make a large standalone
   number look loose. The table below is where digits line up. */
.timp__kpivalue {
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
  white-space: nowrap;
}
.timp__kpilabel {
  min-width: 0;
  font-size: var(--text-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
  overflow-wrap: anywhere;
}

/* ---- the plots ------------------------------------------------------------*/
.timp__fig {
  margin: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  min-width: 0;
}
.timp__figtitle {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
.timp__figsub {
  font-weight: var(--weight-normal);
  color: var(--text-secondary, var(--theme-dim));
}
/* The plot is two equal halves with the baseline between them, so a column's
   side of the line carries the sign before its colour does. */
.timp__plot {
  position: relative;
  height: 180px;
  min-width: 0;
  overflow-x: auto;
}
.timp__zero {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  /* A solid hairline. A dashed rule here would read as a threshold rather than
     as the axis it is. */
  border-top: 1px solid var(--layer-raised-border);
  pointer-events: none;
}
.timp__cols {
  display: flex;
  align-items: stretch;
  /* The 2px surface gap that separates adjacent columns — never a border. */
  gap: 2px;
  height: 100%;
  min-width: 100%;
}
.timp__col {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 6px;
  height: 100%;
}
.timp__half {
  display: flex;
  flex: 1 1 50%;
  min-height: 0;
}
.timp__half--up {
  align-items: flex-end;
}
.timp__half--down {
  align-items: flex-start;
}
.timp__bar {
  width: 100%;
  /* Rounded at the data end only, anchored to the baseline. */
  border-radius: 4px 4px 0 0;
}
.timp__half--down .timp__bar {
  border-radius: 0 0 4px 4px;
}
.timp__bar--pos {
  background: var(--theme-success);
}
.timp__bar--neg {
  background: var(--theme-danger);
}
.timp__bar--equity {
  background: var(--accent, var(--theme-accent));
}
.timp__axis {
  display: flex;
  gap: 2px;
  margin-top: var(--sp-1);
}
.timp__tick {
  flex: 1 1 0;
  min-width: 6px;
  font-size: var(--text-2xs);
  color: var(--text-secondary, var(--theme-dim));
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
}

/* ---- the table twin -------------------------------------------------------*/
.timp__table {
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  padding: var(--sp-3);
  font-size: var(--text-xs);
  color: var(--text-primary, var(--theme-text));
}
.timp__table summary {
  cursor: pointer;
  color: var(--text-secondary, var(--theme-dim));
}
.timp__tablewrap {
  margin-top: var(--sp-3);
  overflow-x: auto;
}
.timp__tablewrap table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}
.timp__tablewrap th,
.timp__tablewrap td {
  padding: var(--sp-1) var(--sp-2);
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--layer-raised-border);
}
.timp__tablewrap th {
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.timp__tablewrap .is-num {
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.is-pos {
  color: var(--theme-success);
}
.is-neg {
  color: var(--theme-danger);
}

/* The one thing on this screen that moves is the drop zone's border answering a
   file being dragged over it. Said here rather than assumed, because a file that
   moves has to say what stops. */
@media (prefers-reduced-motion: reduce) {
  .timp__drop {
    transition: none;
  }
}
</style>
