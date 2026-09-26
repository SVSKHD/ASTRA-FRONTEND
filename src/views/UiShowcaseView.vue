<script setup lang="ts">
// The /ui page (section 16b): every component, every state, every theme, in one
// place. It renders from the registry rather than a hand-written list, so a
// component added to the library shows up here without a second edit — which is
// the only way a showcase stays honest.
//
// Pinned to the top: a theme switcher (so every theme can be checked without
// leaving), a density toggle and an RTL toggle. Those three are where layout
// breaks hide.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { THEME_DESCRIPTORS, type ThemeKey } from '@/themes'
import { contrastRatio } from '@/themes/contrast'
import { UI_GROUPS, componentsIn, type ComponentDoc } from '@/components/ui/registry'
import { TYPE_SCALE, WEIGHTS } from '@/components/ui/type'
import {
  ICON_NAMES,
  ICON_SIZES,
  ICON_STROKE,
  type IconName,
  type IconSize,
} from '@/components/ui/icons'
import Icon from '@/components/ui/Icon.vue'
import UiFormsDemo from '@/views/UiFormsDemo.vue'

import {
  Accordion,
  Caret,
  Alert,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  Chip,
  ColorPicker,
  Combobox,
  DragHandle,
  Dropdown,
  EmptyState,
  FormField,
  MultiSelect,
  NumberInput,
  TagInput,
  GlassDatePicker,
  GlassPanel,
  IconButton,
  TextInput,
  KeyboardShortcut,
  Modal,
  Pagination,
  Popover,
  ProgressBar,
  ProgressRing,
  Radio,
  RingCheck,
  SearchField,
  SegmentedControl,
  Select,
  SaveState,
  TopProgressBar,
  UnsavedSheet,
  Skeleton,
  SlideOver,
  StatRow,
  Slider,
  Stepper,
  StrikeText,
  SubCheck,
  Switch,
  Table,
  Tabs,
  TextArea,
  Toast,
  Tooltip,
} from '@/components/ui'

const ui = useUiStore()
// Section 23's help drawer is opened from a store flag, so the showcase reaches
// it the same way the goals toolbar does rather than mounting a second copy.
const app = useAppStore()
const { theme, effectiveThemeKey } = storeToRefs(ui)
// The picker writes through setTheme so the choice persists exactly as it does
// from the header — the showcase is not a separate theme system.
const themeChoice = computed({
  get: () => effectiveThemeKey.value,
  set: (key: ThemeKey) => ui.setTheme(key),
})

// ---- page controls ----------------------------------------------------------
const density = ref<'comfortable' | 'compact'>('comfortable')
const rtl = ref(false)
function applyChrome() {
  const root = document.documentElement
  root.dataset.density = density.value
  root.dir = rtl.value ? 'rtl' : 'ltr'
}
onMounted(applyChrome)
onBeforeUnmount(() => {
  // The page's own switches must not leak into the rest of the app.
  delete document.documentElement.dataset.density
  document.documentElement.dir = 'ltr'
})

// ---- foundations ------------------------------------------------------------
// Every foundation reads the live theme, so switching at the top restyles the
// whole page rather than just the components.
const tokens = computed(() => {
  const t = theme.value
  return [
    { name: 'text', value: t.text, ratio: contrastRatio(t.text, t.bgSolid) },
    { name: 'dim', value: t.dim, ratio: contrastRatio(t.dim, t.bgSolid) },
    { name: 'accent', value: t.accent, ratio: contrastRatio(t.accent, t.bgSolid) },
    { name: 'border', value: t.border, ratio: contrastRatio(t.border, t.bgSolid) },
  ]
})
const segment = ref('task')
const fieldDemo = ref('')
const tagOptions = [
  { value: 'work', label: 'work' },
  { value: 'home', label: 'home' },
  { value: 'errands', label: 'errands' },
]
const spacing = ['--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6']
const radii = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-pill']

// ---- live models for the demos ---------------------------------------------
const demo = ref({
  accordion: false,
  text: 'Ship the design system',
  multi: [] as string[],
  tags: ['work'] as string[],
  number: 60,
  area: 'Two lines of context that the row cannot show.',
  select: 'all',
  combo: 'work',
  checked: true,
  indeterminate: false,
  radio: 'all',
  toggle: true,
  slider: 6,
  search: '',
  date: '2024-06-12',
  datetime: '2024-06-12T09:30',
  time: '09:30',
  color: 'oklch(0.72 0.16 250)',
  count: 3,
  page: 2,
  tab: 'one',
})
const modalOpen = ref(false)
const unsavedDemo = ref(false)
const sheetOpen = ref(false)
const drawerOpen = ref(false)
const popoverOpen = ref(false)

// ---- Todo v2: the checks, the strike and the motion sheet -----------------
// Live rather than posed: a ring that can be ticked shows the pop, a bar that
// can be replayed shows the fill, and the four easings each drive a dot along
// a track so the difference between them is something you watch, not read.
const rings = ref([
  { label: 'No subtasks', done: false, subDone: 0, subTotal: 0 },
  { label: '6 of 23', done: false, subDone: 6, subTotal: 23 },
  { label: '16 of 23', done: false, subDone: 16, subTotal: 23 },
  { label: 'Done', done: true, subDone: 23, subTotal: 23 },
])
const subs = ref([
  { text: 'Checkout address autofill', done: false },
  { text: 'Razorpay webhook retries', done: true },
])
const strikeDemo = ref(false)
const barValue = ref(7)
function replayBar() {
  barValue.value = 0
  requestAnimationFrame(() => requestAnimationFrame(() => (barValue.value = 7)))
}
const EASINGS = [
  {
    name: 'pop',
    token: '--ease-pop',
    curve: 'cubic-bezier(.3, 1.9, .5, 1)',
    dur: '--dur-pop',
    ms: 400,
    use: 'A control acknowledging a tick: 1 → 1.22 → 1, overshooting.',
  },
  {
    name: 'spring',
    token: '--ease-spring',
    curve: 'cubic-bezier(.3, 1.4, .5, 1)',
    dur: '--dur-slide',
    ms: 450,
    use: 'A card or a toast arriving with a little bounce.',
  },
  {
    name: 'soft',
    token: '--ease-soft',
    curve: 'cubic-bezier(.2, .8, .2, 1)',
    dur: '--dur-fill',
    ms: 700,
    use: 'A fill or a drawer easing out, no overshoot.',
  },
  {
    name: 'sheet',
    token: '--ease-sheet',
    curve: 'cubic-bezier(.2, .9, .25, 1)',
    dur: '--dur-slide',
    ms: 450,
    use: 'A bottom sheet, which settles a touch faster than a drawer.',
  },
]
const motionRun = ref(false)
const motionSlide = ref(false)
const motionPop = ref(false)
function replayMotion() {
  motionRun.value = false
  motionSlide.value = false
  motionPop.value = false
  strikeDemo.value = false
  barValue.value = 0
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      motionRun.value = true
      motionSlide.value = true
      motionPop.value = true
      strikeDemo.value = true
      barValue.value = 7
      setTimeout(() => (motionPop.value = false), 180)
    }),
  )
}
const parsedChips = [
  { icon: 'tag', text: 'CRM' },
  { icon: 'flag', text: 'High priority' },
  { icon: 'calendar', text: 'Fri' },
  { icon: 'clock', text: '5pm reminder' },
] as const

const selectOptions = [
  { value: 'all', label: 'All projects' },
  { value: 'work', label: 'Work' },
  { value: 'home', label: 'Home' },
]
const menuItems = [
  { value: 'edit', label: 'Edit' },
  { value: 'dup', label: 'Duplicate' },
  { value: 'del', label: 'Delete', disabled: true },
]
const tabItems = [
  { value: 'one', label: 'Overview' },
  { value: 'two', label: 'Activity' },
]
const tableColumns = [
  { key: 'repo', label: 'Repo' },
  { key: 'issues', label: 'Open', align: 'right' as const },
]
const tableRows = [
  { id: 1, repo: 'octo/demo', issues: 4 },
  { id: 2, repo: 'octo/site', issues: 0 },
]

const copied = ref('')
async function copySnippet(doc: ComponentDoc) {
  try {
    await navigator.clipboard.writeText(doc.snippet)
    copied.value = doc.name
    setTimeout(() => (copied.value = ''), 1500)
  } catch {
    copied.value = ''
  }
}

// --- the icons page (section 21e) -------------------------------------------
// Rendered from the set itself, like everything else here: an icon added to
// icons.ts appears on this page without a second edit.
const ICON_STEPS = Object.keys(ICON_SIZES) as IconSize[]
const copiedIcon = ref<IconName | ''>('')
let copyTimer: ReturnType<typeof setTimeout> | undefined
async function copyIcon(name: IconName) {
  const tag = `<Icon name="${name}" />`
  try {
    await navigator.clipboard?.writeText(tag)
  } catch {
    /* no clipboard permission — the tile still says which name it is */
  }
  copiedIcon.value = name
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copiedIcon.value = ''), 1200)
}
onBeforeUnmount(() => clearTimeout(copyTimer))

// The overlap detector (section 21c), loaded only in development. Behind a
// constant branch and a dynamic import, so the production build folds the
// branch away and never emits the chunk — the detector is a development tool
// and has no business in anybody's download.
const OverlapDetector = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/components/dev/OverlapDetector.vue'))
  : null
</script>

<template>
  <div class="ui-page">
    <!-- Pinned chrome: theme, density and direction, so every state below can be
         checked in every combination without leaving the page. -->
    <header class="ui-page__bar">
      <strong class="ui-page__brand">Design system</strong>
      <label class="ui-page__ctl">
        Theme
        <Select
          v-model="themeChoice"
          :options="[
            ...THEME_DESCRIPTORS.map((d) => ({ value: String(d.id), label: `${d.name}` })),
          ]"
        />
      </label>
      <label class="ui-page__ctl">
        Density
        <Select
          v-model="density"
          @update:model-value="applyChrome"
          :options="[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]"
        />
      </label>
      <label class="ui-page__ctl">
        <Checkbox v-model="rtl" @update:model-value="applyChrome" />
        RTL
      </label>
      <span class="ui-page__count">{{ UI_GROUPS.length }} groups</span>
    </header>

    <!-- ---- Foundations ------------------------------------------------- -->
    <section class="ui-page__section">
      <h2>Foundations</h2>

      <h3>Colour — with the contrast ratio against this theme's surface</h3>
      <div class="ui-page__grid">
        <div v-for="token in tokens" :key="token.name" class="ui-page__token">
          <span class="ui-page__swatch" :style="{ background: token.value }"></span>
          <div>
            <code>{{ token.name }}</code>
            <span class="ui-page__ratio" :class="{ 'is-pass': token.ratio >= 4.5 }">
              {{ token.ratio.toFixed(2) }}:1
            </span>
          </div>
        </div>
      </div>

      <h3>Typography — eight steps, and nothing between them</h3>
      <p class="ui-page__note">
        Rendered from <code>ui/type.ts</code>, the same table the lint rule reads. A component picks
        a step by name; a raw <code>font-size</code> outside the token file fails the build.
      </p>
      <div class="ui-page__type">
        <div v-for="step in TYPE_SCALE" :key="step.token" class="ui-page__typeRow">
          <div class="ui-page__typeMeta">
            <code>--{{ step.token }}</code>
            <span class="ui-page__typePx">{{ step.px }}px / {{ step.lineHeight }}</span>
            <span class="ui-page__typeUse">{{ step.use }}</span>
          </div>
          <p
            class="ui-page__typeSample"
            :style="{
              fontSize: `var(--${step.token})`,
              lineHeight: `var(--lh-${step.token.replace('text-', '')})`,
              fontWeight: step.weight,
              letterSpacing: step.tracking ?? 'normal',
              textTransform: step.transform ?? 'none',
            }"
          >
            The quick brown fox jumps
          </p>
        </div>
      </div>

      <h3>Weights — three, so emphasis means something</h3>
      <div class="ui-page__stack">
        <p
          v-for="w in WEIGHTS"
          :key="w.token"
          class="ui-page__weightRow"
          :style="{ fontWeight: w.value }"
        >
          <code>--{{ w.token }}</code> {{ w.value }} — {{ w.use }}
        </p>
      </div>

      <h3>Families — sans for the interface, mono for data</h3>
      <div class="ui-page__stack">
        <p class="ui-page__famRow">Deploy the backtest harness before Friday</p>
        <p class="ui-page__famRow ui-mono ui-tabular">2026-11-30 · 1,204 · #a83f19b · 90m</p>
        <p class="ui-page__note">
          Mono is for dates, ids, counts and code, where character width is information. Numbers in
          a column also take <code>.ui-tabular</code>, or the column jitters as the values change.
        </p>
      </div>

      <h3>Spacing &amp; radii</h3>
      <div class="ui-page__row">
        <div v-for="sp in spacing" :key="sp" class="ui-page__spacer">
          <span :style="{ width: `var(${sp})`, height: `var(${sp})` }"></span>
          <code>{{ sp }}</code>
        </div>
      </div>
      <div class="ui-page__row">
        <div
          v-for="r in radii"
          :key="r"
          class="ui-page__radius"
          :style="{ borderRadius: `var(${r})` }"
        >
          <code>{{ r.replace('--radius-', '') }}</code>
        </div>
      </div>

      <h3>Motion — four named moves, and the four curves behind them</h3>
      <p class="ui-page__note">
        150–200ms ease-out on hover and press, a spring on drop, 30ms list stagger — and the Todo v2
        sheet's four moves below. All of it is gated on <code>prefers-reduced-motion</code>, which
        zeroes the duration tokens in one place.
      </p>
      <div class="ui-page__motion">
        <div class="ui-page__motionHead">
          <Button size="sm" variant="secondary" @click="replayMotion">
            <Icon name="play" size="xs" />Replay all
          </Button>
        </div>
        <div v-for="e in EASINGS" :key="e.name" class="ui-page__easing">
          <div class="ui-page__easingMeta">
            <code>{{ e.token }}</code>
            <span class="ui-page__typePx">{{ e.curve }} · {{ e.ms }}ms</span>
            <span class="ui-page__typeUse">{{ e.use }}</span>
          </div>
          <div class="ui-page__track">
            <span
              class="ui-page__dot"
              :class="{ 'is-run': motionRun }"
              :style="{ '--easing': `var(${e.token})`, '--dur': `var(${e.dur})` }"
            ></span>
          </div>
        </div>
        <div class="ui-page__sequence">
          <span class="ui-page__typeUse">The completion sequence, in order:</span>
          <div class="ui-page__seqRow">
            <RingCheck
              :done="strikeDemo"
              :sub-done="6"
              :sub-total="23"
              surface="var(--glass-solid)"
              @toggle="strikeDemo = !strikeDemo"
            />
            <StrikeText :done="strikeDemo">1 · pop &nbsp; 2 · check &nbsp; 3 · strike</StrikeText>
          </div>
          <ProgressBar :value="strikeDemo ? 7 : 6" :max="18" :delay="150" label="4 · fill" />
          <div class="ui-page__slideTrack">
            <div class="ui-page__slidePanel" :class="{ 'is-in': motionSlide }">slide · sheet</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ---- Forms (section 25d) ---------------------------------------- -->
    <section class="ui-page__section">
      <h2>Forms</h2>
      <p class="ui-page__note">
        Every control in one shell, at one size scale, with one error pattern. The example below is
        a real <code>useForm</code> over a real Zod schema rather than a mock-up, because the timing
        is the thing worth documenting and a fake would document nothing: a field is silent until it
        has been left once, then follows every keystroke, and submit checks the fields nobody
        visited.
      </p>
      <UiFormsDemo />
    </section>

    <!-- ---- Dialogs and drawers ----------------------------------------- -->
    <section class="ui-page__section ui-page__surfaces">
      <h2>Dialogs &amp; drawers</h2>
      <p class="ui-page__note">
        Focused surfaces for decisions, quick filters, and supporting detail. Each example uses the
        same glass layer, scrim, close behavior, and responsive motion as the production UI.
      </p>
      <div class="ui-page__surfaceGrid">
        <article class="ui-page__surfaceDemo">
          <div>
            <span class="ui-page__surfaceEyebrow">Centered decision</span>
            <h3>Modal dialog</h3>
            <p>Use when the current task must pause for a clear answer.</p>
          </div>
          <Button variant="secondary" @click="modalOpen = true">Open modal</Button>
        </article>
        <article class="ui-page__surfaceDemo">
          <div>
            <span class="ui-page__surfaceEyebrow">Thumb reachable</span>
            <h3>Bottom sheet</h3>
            <p>Use for mobile-first filters and short action lists.</p>
          </div>
          <Button variant="secondary" @click="sheetOpen = true">Open sheet</Button>
        </article>
        <article class="ui-page__surfaceDemo">
          <div>
            <span class="ui-page__surfaceEyebrow">Supporting context</span>
            <h3>Side drawer</h3>
            <p>Use when detail should stay beside the page that opened it.</p>
          </div>
          <Button variant="secondary" @click="drawerOpen = true">Open drawer</Button>
        </article>
        <article class="ui-page__surfaceDemo">
          <div>
            <span class="ui-page__surfaceEyebrow">Unsaved work</span>
            <h3>Exit confirmation</h3>
            <p>Use when closing would discard edits or an in-progress flow.</p>
          </div>
          <Button variant="ghost" @click="unsavedDemo = true">Show confirmation</Button>
        </article>
      </div>
      <Modal :open="modalOpen" title="Delete task?" @close="modalOpen = false">
        This cannot be undone.
        <template #footer>
          <Button variant="ghost" @click="modalOpen = false">Cancel</Button>
          <Button variant="danger" @click="modalOpen = false">Delete</Button>
        </template>
      </Modal>
      <BottomSheet :open="sheetOpen" title="Filters" @close="sheetOpen = false">
        <div class="ui-page__sheetContent">
          <Switch v-model="demo.toggle" label="Only active items" />
          <Checkbox v-model="demo.checked" label="Include archived" />
          <Button @click="sheetOpen = false">Apply filters</Button>
        </div>
      </BottomSheet>
      <SlideOver :open="drawerOpen" title="Details" @close="drawerOpen = false">
        <div class="ui-page__drawerContent">
          <StatRow
            :stats="[
              { label: 'Open', value: '12' },
              { label: 'Done', value: '28' },
            ]"
          />
          <p class="ui-page__note">
            A drawer keeps the source page visible while the reader checks supporting information.
          </p>
          <Button variant="secondary" @click="drawerOpen = false">Done</Button>
        </div>
      </SlideOver>
      <UnsavedSheet
        :open="unsavedDemo"
        :fields="['Assignee', 'Description']"
        @save="unsavedDemo = false"
        @discard="unsavedDemo = false"
        @back="unsavedDemo = false"
      />
    </section>

    <!-- ---- Components --------------------------------------------------- -->
    <section v-for="group in UI_GROUPS" :key="group" class="ui-page__section">
      <h2>{{ group }}</h2>
      <article v-for="doc in componentsIn(group)" :key="doc.name" class="ui-page__component">
        <header class="ui-page__componentHead">
          <h3>{{ doc.name }}</h3>
          <p>{{ doc.summary }}</p>
        </header>

        <div class="ui-page__demo">
          <!-- Actions -->
          <template v-if="doc.name === 'Button'">
            <Button>+ New todo</Button>
            <Button variant="secondary">Done, next</Button>
            <Button variant="ghost">Exit</Button>
            <Button variant="tinted" size="sm">Undo</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="secondary" caps size="sm">Export</Button>
            <Button variant="secondary" :count="4">
              <Icon name="calendar-check" size="sm" class="ui-page__accentIcon" />Weekly review
            </Button>
            <Button size="sm">Small</Button>
            <Button size="lg"><Icon name="pause" size="sm" />Pause</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </template>
          <template v-else-if="doc.name === 'IconButton'">
            <IconButton label="Focus on the next subtask"
              ><Icon name="timer" size="sm"
            /></IconButton>
            <IconButton label="Remind me"><Icon name="bell" size="sm" /></IconButton>
            <IconButton label="Delete" tone="danger"><Icon name="x" size="sm" /></IconButton>
            <IconButton label="Focus" size="sm"><Icon name="timer" size="sm" /></IconButton>
            <IconButton label="Close" variant="outline" tone="default" size="sm">
              <Icon name="x" size="xs" />
            </IconButton>
            <IconButton label="Focus" size="lg" active><Icon name="timer" size="md" /></IconButton>
            <IconButton label="Solid" variant="solid"><Icon name="star" size="sm" /></IconButton>
            <IconButton label="Disabled" disabled><Icon name="x" size="sm" /></IconButton>
          </template>
          <template v-else-if="doc.name === 'DragHandle'">
            <DragHandle />
            <DragHandle dragging />
          </template>

          <!-- Inputs -->
          <template v-else-if="doc.name === 'TextInput'">
            <TextInput v-model="demo.text" label="Title" hint="Shown under the field" />
            <TextInput v-model="demo.text" label="Error" error="Required" />
            <TextInput v-model="demo.text" label="Disabled" disabled />
            <TextInput v-model="demo.count" label="Amount" prefix="₹" type="number" />
          </template>
          <template v-else-if="doc.name === 'TextArea'">
            <TextArea v-model="demo.area" label="Notes" :rows="3" />
            <TextArea v-model="demo.area" label="Error" error="Too long" />
          </template>
          <template v-else-if="doc.name === 'Select'">
            <Select v-model="demo.select" :options="selectOptions" label="Project" />
            <Select v-model="demo.select" :options="selectOptions" label="Disabled" disabled />
          </template>
          <template v-else-if="doc.name === 'Combobox'">
            <FormField label="Tag" hint="Pick one, or name a new one" v-slot="f">
              <Combobox v-bind="f" v-model="demo.combo" :options="tagOptions" creatable />
            </FormField>
          </template>
          <template v-else-if="doc.name === 'MultiSelect'">
            <FormField label="Projects" v-slot="f">
              <MultiSelect v-bind="f" v-model="demo.multi" :options="tagOptions" />
            </FormField>
          </template>
          <template v-else-if="doc.name === 'NumberInput'">
            <FormField label="Estimate" hint="Minutes" v-slot="f">
              <NumberInput v-bind="f" v-model="demo.number" :min="0" :max="480" :step="15" />
            </FormField>
          </template>
          <template v-else-if="doc.name === 'TagInput'">
            <FormField label="Tags" hint="Enter or comma to add, backspace to remove" v-slot="f">
              <TagInput v-bind="f" v-model="demo.tags" :suggestions="['work', 'home', 'errands']" />
            </FormField>
          </template>
          <template v-else-if="doc.name === 'Checkbox'">
            <Checkbox v-model="demo.checked" label="Checked" />
            <Checkbox v-model="demo.indeterminate" label="Indeterminate" indeterminate />
            <Checkbox v-model="demo.checked" label="Disabled" disabled />
          </template>
          <template v-else-if="doc.name === 'Radio'">
            <Radio v-model="demo.radio" value="all" name="demo" label="All" />
            <Radio v-model="demo.radio" value="open" name="demo" label="Open" />
            <Radio v-model="demo.radio" value="none" name="demo" label="Disabled" disabled />
          </template>
          <template v-else-if="doc.name === 'Switch'">
            <Switch v-model="demo.toggle" label="Sync enabled" />
            <Switch v-model="demo.toggle" size="sm" label="Small" />
            <Switch v-model="demo.toggle" label="Disabled" disabled />
          </template>
          <template v-else-if="doc.name === 'SegmentedControl'">
            <SegmentedControl
              v-model="segment"
              :options="[
                { value: 'task', label: 'Task' },
                { value: 'todo', label: 'Todo' },
                { value: 'reminder', label: 'Reminder' },
              ]"
              aria-label="Type"
            />
          </template>
          <template v-else-if="doc.name === 'StatRow'">
            <StatRow
              :stats="[
                { label: 'In', value: '₹1,20,000' },
                { label: 'Out', value: '₹84,500' },
                { label: 'Net', value: '+₹35,500', tone: 'positive' },
              ]"
            />
          </template>
          <template v-else-if="doc.name === 'Alert'">
            <div class="ui-page__stack">
              <Alert tone="danger" title="Could not save"
                >The repository astra/frontend could not be reached. Check the name and try
                again.</Alert
              >
              <Alert tone="info"
                >Goals imported from a link are editable before they are saved.</Alert
              >
            </div>
          </template>
          <template v-else-if="doc.name === 'FormField'">
            <div class="ui-page__stack">
              <FormField label="Title" hint="What the task is called" required v-slot="f">
                <TextInput v-bind="f" v-model="fieldDemo" placeholder="Ship the trading bot" />
              </FormField>
              <FormField label="Title" error="Enter a title" required v-slot="f">
                <TextInput v-bind="f" model-value="" placeholder="Ship the trading bot" />
              </FormField>
              <p class="ui-page__note">
                Both fields are the same height. The message row is reserved, so an error appearing
                does not move the form under the reader.
              </p>
            </div>
          </template>
          <template v-else-if="doc.name === 'Slider'">
            <Slider v-model="demo.slider" :min="0" :max="10" label="Weight" />
          </template>
          <template v-else-if="doc.name === 'SearchField'">
            <SearchField v-model="demo.search" />
          </template>
          <template v-else-if="doc.name === 'GlassDatePicker'">
            <GlassDatePicker v-model="demo.date" label="Date" />
            <GlassDatePicker v-model="demo.datetime" mode="datetime" label="Date and time" />
            <GlassDatePicker v-model="demo.time" mode="time" label="Time" />
            <GlassDatePicker v-model="demo.date" label="Disabled" disabled />
          </template>
          <template v-else-if="doc.name === 'ColorPicker'">
            <ColorPicker v-model="demo.color" />
          </template>
          <template v-else-if="doc.name === 'Stepper'">
            <Stepper v-model="demo.count" :min="0" :max="9" label="Count" />
          </template>

          <!-- Display -->
          <template v-else-if="doc.name === 'Chip'">
            <Chip label="Frontend" :color="theme.accent" />
            <Chip label="Inbox" />
            <Chip label="Frontend" :color="theme.accent" size="sm" />
            <Chip label="selected" selected />
            <Chip label="removable" removable />
            <Chip
              v-for="ch in parsedChips"
              :key="ch.text"
              tone="accent"
              :icon="ch.icon"
              :label="ch.text"
            />
          </template>
          <template v-else-if="doc.name === 'Badge'">
            <Badge tone="neutral" label="Neutral" />
            <Badge tone="success" label="Synced" />
            <Badge tone="warning" label="Paused" />
            <Badge tone="danger" label="Failed" />
            <Badge tone="info" label="Info" />
          </template>
          <template v-else-if="doc.name === 'Avatar'">
            <Avatar name="Ada Lovelace" size="sm" />
            <Avatar name="Grace Hopper" />
            <Avatar name="Alan Turing" size="lg" />
          </template>
          <template v-else-if="doc.name === 'ProgressBar'">
            <div class="ui-page__stack ui-page__wide">
              <span class="ui-page__note">Page · 5px, gradient, moves 150ms after the tick</span>
              <ProgressBar :value="barValue" :max="18" label="Checklist" :delay="150" />
              <span class="ui-page__note">Detail · 6px, solid accent</span>
              <ProgressBar :value="barValue" :max="18" size="lg" solid label="Subtasks" />
              <span class="ui-page__note">Phone · 4px</span>
              <ProgressBar :value="barValue" :max="18" size="sm" label="Today" />
              <Button size="sm" variant="secondary" @click="replayBar">Replay the fill</Button>
            </div>
          </template>
          <template v-else-if="doc.name === 'RingCheck'">
            <div v-for="r in rings" :key="r.label" class="ui-page__ringDemo">
              <RingCheck
                :done="r.done"
                :sub-done="r.subDone"
                :sub-total="r.subTotal"
                surface="var(--glass-solid)"
                @toggle="r.done = !r.done"
              />
              <span class="ui-page__note">{{ r.label }}</span>
            </div>
          </template>
          <template v-else-if="doc.name === 'SubCheck'">
            <div v-for="sub in subs" :key="sub.text" class="ui-page__subRow">
              <SubCheck :done="sub.done" @toggle="sub.done = !sub.done" />
              <StrikeText :done="sub.done">{{ sub.text }}</StrikeText>
            </div>
            <div class="ui-page__subRow">
              <SubCheck :done="subs[0].done" size="md" @toggle="subs[0].done = !subs[0].done" />
              <span class="ui-page__note">md · 20px, the phone sheet</span>
            </div>
          </template>
          <template v-else-if="doc.name === 'StrikeText'">
            <StrikeText :done="strikeDemo">Aquakart Frontend Pending</StrikeText>
            <Button size="sm" variant="secondary" @click="strikeDemo = !strikeDemo">
              {{ strikeDemo ? 'Undo' : 'Mark done' }}
            </Button>
          </template>
          <template v-else-if="doc.name === 'ProgressRing'">
            <ProgressRing :ratio="0.24" />
            <ProgressRing :ratio="0.62" :size="52" />
            <ProgressRing :ratio="1" :size="36" :stroke="3.5" />
          </template>
          <template v-else-if="doc.name === 'Table'">
            <Table :columns="tableColumns" :rows="tableRows" caption="Repositories" />
          </template>
          <template v-else-if="doc.name === 'KeyboardShortcut'">
            <KeyboardShortcut keys="mod+k" />
            <KeyboardShortcut keys="shift+alt+d" />
          </template>

          <!-- Feedback -->
          <template v-else-if="doc.name === 'SaveState'">
            <div style="display: flex; align-items: center; gap: 12px">
              <SaveState state="working" />
              <SaveState state="done" />
              <SaveState state="failed" />
            </div>
          </template>
          <template v-else-if="doc.name === 'TopProgressBar'">
            <!-- Rendered inert here: the real one is fixed to the viewport top
                 and would sit over the page's own chrome. -->
            <div style="position: relative; height: 2px; overflow: hidden">
              <TopProgressBar :active="true" />
            </div>
          </template>
          <template v-else-if="doc.name === 'UnsavedSheet'">
            <Button variant="ghost" size="sm" @click="unsavedDemo = true">Show the sheet</Button>
            <UnsavedSheet
              :open="unsavedDemo"
              :fields="['Assignee', 'Description']"
              @save="unsavedDemo = false"
              @discard="unsavedDemo = false"
              @back="unsavedDemo = false"
            />
          </template>
          <template v-else-if="doc.name === 'Skeleton'">
            <Skeleton :lines="3" />
          </template>
          <template v-else-if="doc.name === 'Toast'">
            <Toast message="Deleted “Aquakart CRM Pending”" action-label="Undo" />
            <Toast message="Could not save" tone="danger" />
          </template>
          <template v-else-if="doc.name === 'EmptyState'">
            <EmptyState glyph="◎" title="No goals yet" description="Goals group work over time.">
              <template #action><Button size="sm">New goal</Button></template>
            </EmptyState>
          </template>
          <template v-else-if="doc.name === 'Tooltip'">
            <Tooltip text="Sync now"><Button variant="secondary">Hover me</Button></Tooltip>
          </template>

          <!-- Surfaces -->
          <template v-else-if="doc.name === 'Card'">
            <Card title="Repo card">Open issues, last commit, linked task progress.</Card>
            <Card title="Interactive" interactive>Whole card is a button.</Card>
          </template>
          <template v-else-if="doc.name === 'GlassPanel'">
            <GlassPanel>Glass surface, one place.</GlassPanel>
          </template>
          <template v-else-if="doc.name === 'Modal'">
            <Button variant="secondary" @click="modalOpen = true">Open modal</Button>
            <Modal :open="modalOpen" title="Delete task?" @close="modalOpen = false">
              This cannot be undone.
              <template #footer>
                <Button variant="ghost" @click="modalOpen = false">Cancel</Button>
                <Button variant="danger" @click="modalOpen = false">Delete</Button>
              </template>
            </Modal>
          </template>
          <template v-else-if="doc.name === 'BottomSheet'">
            <Button variant="secondary" @click="sheetOpen = true">Open sheet</Button>
            <BottomSheet :open="sheetOpen" title="Filters" @close="sheetOpen = false">
              Filter controls live here.
            </BottomSheet>
          </template>
          <template v-else-if="doc.name === 'SlideOver'">
            <Button variant="secondary" @click="drawerOpen = true">Open drawer</Button>
            <SlideOver :open="drawerOpen" title="Details" @close="drawerOpen = false">
              Secondary detail.
            </SlideOver>
          </template>
          <template v-else-if="doc.name === 'Popover'">
            <Popover :open="popoverOpen" @close="popoverOpen = false">
              <template #trigger>
                <Button variant="secondary" @click="popoverOpen = !popoverOpen">Toggle</Button>
              </template>
              Anchored content.
            </Popover>
          </template>

          <!-- Navigation -->
          <template v-else-if="doc.name === 'Dropdown'">
            <Dropdown :items="menuItems" label="Actions" />
          </template>
          <template v-else-if="doc.name === 'Tabs'">
            <Tabs v-model="demo.tab" :tabs="tabItems" />
          </template>
          <template v-else-if="doc.name === 'Accordion'">
            <Accordion title="Advanced" :open="demo.accordion" @toggle="demo.accordion = $event">
              Rarely-needed settings.
            </Accordion>
          </template>
          <template v-else-if="doc.name === 'Caret'">
            <span style="display: inline-flex; align-items: center; gap: 12px">
              <Caret :open="false" />
              <Caret :open="true" />
            </span>
          </template>
          <template v-else-if="doc.name === 'Pagination'">
            <Pagination v-model:page="demo.page" :page-count="9" />
          </template>
        </div>

        <details class="ui-page__props">
          <summary>Props &amp; usage</summary>
          <table>
            <thead>
              <tr>
                <th>Prop</th>
                <th>Type</th>
                <th>Default</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prop in doc.props" :key="prop.name">
                <td>
                  <code>{{ prop.name }}</code>
                </td>
                <td>
                  <code>{{ prop.type }}</code>
                </td>
                <td>{{ prop.default || '—' }}</td>
                <td>{{ prop.note || '' }}</td>
              </tr>
            </tbody>
          </table>
          <pre class="ui-page__snippet"><code>{{ doc.snippet }}</code></pre>
          <Button size="sm" variant="ghost" @click="copySnippet(doc)">
            {{ copied === doc.name ? 'Copied' : 'Copy snippet' }}
          </Button>
        </details>
      </article>
    </section>

    <!-- ---- Layout check --------------------------------------------------- -->
    <section class="ui-page__section">
      <h2>Layout check</h2>
      <p class="ui-page__note">
        Section 21c's rules, measured rather than eyeballed. Resize the window with Watch on: a
        layout is rarely broken at the width it was built at.
      </p>
      <component :is="OverlapDetector" v-if="OverlapDetector" root=".ui-page" />
    </section>

    <!-- ---- Icons --------------------------------------------------------- -->
    <section class="ui-page__section">
      <h2>Icons</h2>
      <p class="ui-page__note">
        One set, one weight ({{ ICON_STROKE }}), five sizes. Click a name to copy the tag. An icon
        drawn by hand anywhere else fails the build.
      </p>

      <h3>The scale</h3>
      <GlassPanel padding="sm">
        <div class="ui-page__iconscale">
          <div v-for="step in ICON_STEPS" :key="step" class="ui-page__iconstep">
            <Icon name="bell" :size="step" />
            <code>{{ step }}</code>
            <span class="ui-page__note">{{ ICON_SIZES[step] }}px</span>
          </div>
        </div>
      </GlassPanel>

      <h3>The set — {{ ICON_NAMES.length }} icons</h3>
      <GlassPanel padding="sm">
        <div class="ui-page__icongrid">
          <button
            v-for="name in ICON_NAMES"
            :key="name"
            type="button"
            class="ui-page__icontile"
            :title="`Copy the ${name} tag`"
            @click="copyIcon(name)"
          >
            <Icon :name="name" size="lg" />
            <span class="ui-page__iconname">{{ copiedIcon === name ? 'copied' : name }}</span>
          </button>
        </div>
      </GlassPanel>
    </section>

    <!-- ---- Patterns ------------------------------------------------------ -->
    <section class="ui-page__section">
      <h2>Patterns</h2>

      <h3>List row</h3>
      <GlassPanel padding="sm">
        <div class="ui-page__listrow">
          <DragHandle />
          <Checkbox :model-value="false" />
          <div class="ui-page__listmain">
            <strong>Ship the design system</strong>
            <span>Consolidate every primitive into ui/</span>
            <div class="ui-page__chips">
              <Chip label="work" color="oklch(0.72 0.16 250)" />
              <Badge tone="success" label="On track" />
            </div>
          </div>
          <KeyboardShortcut keys="mod+enter" />
        </div>
      </GlassPanel>

      <h3>Task card</h3>
      <Card title="Fix the flaky test">
        <p class="ui-page__note">Linked to octo/demo#123 · due tomorrow</p>
        <ProgressBar :value="3" :max="5" label="Subtasks" />
      </Card>

      <h3>Goal card</h3>
      <Card title="Run 100km">
        <div class="ui-page__goal">
          <ProgressRing :ratio="0.62" :size="52" />
          <div>
            <p class="ui-page__note">62% · 12 of 18 points</p>
            <Chip label="health" color="oklch(0.72 0.15 150)" />
          </div>
        </div>
      </Card>

      <h3>Todo row (desktop) — rest, selected, done</h3>
      <div class="ui-page__stack">
        <div
          v-for="(r, i) in rings.slice(1)"
          :key="r.label"
          class="ui-page__todoRow"
          :class="{ 'is-selected': i === 1 }"
        >
          <DragHandle />
          <RingCheck
            :done="r.done"
            :sub-done="r.subDone"
            :sub-total="r.subTotal"
            surface="var(--glass-solid)"
            @toggle="r.done = !r.done"
          />
          <div class="ui-page__todoMain" :class="{ 'is-done': r.done }">
            <div class="ui-page__todoTitle">
              <Chip label="Frontend" :color="theme.accent" />
              <StrikeText :done="r.done">Aquakart Frontend Pending</StrikeText>
              <span class="ui-mono ui-tabular ui-page__count"
                >{{ r.subDone }}/{{ r.subTotal }}</span
              >
            </div>
            <span class="ui-page__todoDesc"
              >Pending Aquakart ecommerce frontend, conversion, SEO and customer-facing work.</span
            >
          </div>
          <IconButton label="Focus on the next subtask"><Icon name="timer" size="sm" /></IconButton>
          <IconButton label="Remind me"><Icon name="bell" size="sm" /></IconButton>
          <IconButton label="Delete" tone="danger"><Icon name="x" size="sm" /></IconButton>
        </div>
      </div>

      <h3>Subtask row — Next up</h3>
      <div class="ui-page__stack">
        <div v-for="sub in subs" :key="sub.text" class="ui-page__nextRow">
          <SubCheck :done="sub.done" @toggle="sub.done = !sub.done" />
          <StrikeText :done="sub.done">{{ sub.text }}</StrikeText>
          <Chip label="Frontend" :color="theme.accent" size="sm" />
          <IconButton label="Focus" size="sm" :disabled="sub.done">
            <Icon name="timer" size="sm" />
          </IconButton>
        </div>
      </div>

      <h3>Quick add — typing, with the parsed chips</h3>
      <div class="ui-page__quickAdd is-typing">
        <div class="ui-page__quickLine">
          <Icon name="plus" size="sm" class="ui-page__accentIcon" />
          <span class="ui-page__quickText">Call vendor fri 5pm #CRM !high</span>
          <span class="ui-mono ui-page__quickHint">↵</span>
        </div>
        <div class="ui-page__quickChips">
          <Chip
            v-for="ch in parsedChips"
            :key="ch.text"
            tone="accent"
            :icon="ch.icon"
            :label="ch.text"
          />
        </div>
      </div>

      <h3>Bottom pill (desktop) and tab bar (phone)</h3>
      <div class="ui-page__row">
        <div class="ui-page__pill">
          <span class="ui-page__pillBtn"><Icon name="notebook" size="sm" />Notes</span>
          <span class="ui-page__pillBtn is-on"><Icon name="palette" size="sm" />Appearance</span>
          <span class="ui-page__pillBtn"><Icon name="user-circle" size="sm" />Account</span>
          <span class="ui-page__pillBtn"><Icon name="github" size="sm" />GitHub</span>
          <span class="ui-page__pillDivider"></span>
          <span class="ui-page__pillSync"><span class="ui-page__okDot"></span>Synced</span>
        </div>
        <div class="ui-page__tabbar">
          <span class="ui-page__tab"
            ><span class="ui-page__tabCap"><Icon name="columns" size="md" /></span>Overview</span
          >
          <span class="ui-page__tab is-on"
            ><span class="ui-page__tabCap"><Icon name="check-square" size="md" /></span>Todo</span
          >
          <span class="ui-page__tab"
            ><span class="ui-page__tabCap"><Icon name="list" size="md" /></span>Tasks</span
          >
          <span class="ui-page__tab"
            ><span class="ui-page__tabCap"><Icon name="bell" size="md" /></span>Remind</span
          >
          <span class="ui-page__tab"
            ><span class="ui-page__tabCap"><Icon name="rupee" size="md" /></span>Finance</span
          >
          <span class="ui-page__tab"
            ><span class="ui-page__tabCap"><Icon name="more-horizontal" size="md" /></span
            >More</span
          >
        </div>
      </div>

      <h3>Focus timer ring</h3>
      <div class="ui-page__row">
        <span class="ui-page__focusRing" :style="{ '--pct': '38%' }">
          <span class="ui-page__focusTime ui-tabular">15:30</span>
        </span>
        <div class="ui-page__stack">
          <span class="ui-page__note">200px conic ring, fills as the 25 minutes elapse.</span>
          <div class="ui-page__row">
            <Button size="lg"><Icon name="pause" size="sm" />Pause</Button>
            <Button variant="secondary" size="lg">Done, next</Button>
            <Button variant="ghost" size="lg">Exit</Button>
          </div>
        </div>
      </div>

      <h3>Empty state</h3>
      <GlassPanel>
        <EmptyState glyph="◇" title="Nothing here yet" description="Create the first one.">
          <template #action><Button size="sm">Create</Button></template>
        </EmptyState>
      </GlassPanel>

      <h3>How to add a goal</h3>
      <p class="ui-page__note">
        Section 23's help drawer — the walkthroughs, the shorthand and the JSON schema reference. It
        is the same panel the goals toolbar's ? and the goal dialog's ⋯ open, mounted once at the
        app root, so this button only sets the flag.
      </p>
      <GlassPanel padding="sm">
        <Button size="sm" @click="app.openGoalHelp()">Open the goal help panel</Button>
      </GlassPanel>
    </section>
  </div>
</template>

<style scoped>
/* The page paints the surface edge to edge; its CONTENT sits in a container.
   Without one every section ran the full width of the monitor — a type scale
   measured across 2500px, an icon grid eleven columns wide, a "listrow" sample
   nothing in the app is ever that wide. A design system read at a width the app
   never uses is a design system showing you the wrong thing.

   1500px is not a new number: it is `maxWidth` in `views/workspaceStage.ts`,
   the cap every tab's stage already has. The components are reviewed here at
   the width they are shipped at. */
.ui-page {
  --ui-page-container: 1500px;

  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  color: var(--theme-text);
  background: var(--theme-surface);
}
/* Each block centres itself rather than a wrapper doing it, so the sticky bar
   stays sticky — a scroll container in between would pin it to that instead of
   to the page. */
.ui-page > * {
  width: 100%;
  max-width: var(--ui-page-container);
  margin-inline: auto;
}
.ui-page__bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  flex-wrap: wrap;
  padding: var(--sp-3);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  background: var(--glass-solid);
}
.ui-page__brand {
  font-size: var(--text-md);
}
.ui-page__ctl {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ui-page__ctl select {
  background: var(--theme-input);
  color: var(--theme-text);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 4px 6px;
}
.ui-page__count {
  margin-inline-start: auto;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ui-page__type {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.ui-page__typeRow {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: baseline;
  min-width: 0;
  padding-bottom: var(--sp-2);
  border-bottom: 1px solid var(--glass-border);
}
.ui-page__typeMeta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ui-page__typePx,
.ui-page__typeUse {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ui-page__typeSample {
  margin: 0;
  min-width: 0;
}
.ui-page__weightRow,
.ui-page__famRow {
  margin: 0;
  font-size: var(--text-base);
}
@media (max-width: 640px) {
  .ui-page__typeRow {
    grid-template-columns: minmax(0, 1fr);
  }
}
.ui-page__section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.ui-page__section h2 {
  margin: 0;
  font-size: var(--text-lg);
  border-bottom: 1px solid var(--glass-border);
  padding-bottom: var(--sp-2);
}
.ui-page__section h3 {
  margin: var(--sp-2) 0 0;
  font-size: var(--text-sm);
  color: var(--theme-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ui-page__component {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
}
.ui-page__componentHead h3 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--theme-text);
  text-transform: none;
  letter-spacing: 0;
}
.ui-page__componentHead p {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ui-page__demo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--glass-border) 18%, transparent);
}
.ui-page__surfaceGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}
.ui-page__surfaceDemo {
  display: flex;
  min-height: 170px;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  background: color-mix(in oklch, var(--glass-bg) 72%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 12%, transparent);
}
.ui-page__surfaceEyebrow {
  color: var(--theme-accent);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ui-page__surfaceDemo h3 {
  margin: var(--sp-1) 0 0;
  color: var(--theme-text);
  font-size: var(--text-md);
  letter-spacing: 0;
  text-transform: none;
}
.ui-page__surfaceDemo p {
  max-width: 34ch;
  margin: var(--sp-1) 0 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  line-height: var(--lh-base);
}
.ui-page__sheetContent,
.ui-page__drawerContent {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
@media (max-width: 640px) {
  .ui-page__surfaceGrid {
    grid-template-columns: 1fr;
  }
}
.ui-page__props {
  font-size: var(--text-xs);
}
.ui-page__props table {
  width: 100%;
  border-collapse: collapse;
  margin-top: var(--sp-2);
}
.ui-page__props th,
.ui-page__props td {
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1px solid var(--glass-border);
  color: var(--theme-dim);
}
.ui-page__snippet {
  overflow-x: auto;
  padding: var(--sp-2);
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--glass-border) 25%, transparent);
  font-size: var(--text-2xs);
}
.ui-page__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--sp-3);
}
.ui-page__token {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-xs);
}
.ui-page__swatch {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
}
.ui-page__ratio {
  display: block;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ui-page__ratio.is-pass {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
}
.ui-page__stack {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.ui-page__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  align-items: flex-end;
}
.ui-page__spacer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--text-2xs);
}
.ui-page__spacer span {
  display: block;
  background: var(--theme-accent);
  border-radius: 2px;
}
.ui-page__radius {
  display: grid;
  place-items: center;
  width: 64px;
  height: 44px;
  border: 1px solid var(--glass-border);
  font-size: var(--text-2xs);
}
.ui-page__note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ui-page__listrow {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-page__listmain {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
}
.ui-page__listmain span {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ui-page__chips {
  display: flex;
  gap: var(--sp-1);
}
.ui-page__goal {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
/* ---- Todo v2 demos ------------------------------------------------------- */
.ui-page__accentIcon {
  color: var(--theme-accent);
}
.ui-page__wide {
  width: 100%;
  max-width: 520px;
}
.ui-page__ringDemo,
.ui-page__subRow {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.ui-page__motion {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  background: var(--glass-solid);
}
.ui-page__motionHead {
  display: flex;
  justify-content: flex-end;
}
.ui-page__easing {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: center;
  min-width: 0;
}
.ui-page__easingMeta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ui-page__track {
  position: relative;
  height: 28px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
}
.ui-page__dot {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--theme-accent);
  transform: translateX(0);
  transition: transform var(--dur) var(--easing);
}
.ui-page__dot.is-run {
  transform: translateX(calc(100% * 12));
}
.ui-page__sequence {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--glass-border);
}
.ui-page__seqRow {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--text-base);
}
.ui-page__slideTrack {
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px dashed var(--glass-border);
}
.ui-page__slidePanel {
  padding: var(--sp-2) var(--sp-3);
  background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  font-size: var(--text-xs);
  transform: translateX(-100%);
  transition: transform var(--dur-slide) var(--ease-sheet);
}
.ui-page__slidePanel.is-in {
  transform: translateX(0);
}
.ui-page__todoRow {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 12px 12px 12px 14px;
  border-radius: 14px;
  background: var(--glass-solid);
  border: 1px solid var(--glass-border);
  transition:
    background var(--dur-med) ease,
    border-color var(--dur-med) ease;
}
.ui-page__todoRow:hover {
  background: color-mix(in srgb, var(--theme-text) 4%, var(--glass-solid));
}
.ui-page__todoRow.is-selected {
  border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
  background: color-mix(in srgb, var(--theme-accent) 8%, var(--glass-solid));
}
.ui-page__todoMain {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: opacity var(--dur-pop) ease 250ms;
}
.ui-page__todoMain.is-done {
  opacity: 0.55;
}
.ui-page__todoTitle {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
}
.ui-page__count {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ui-page__todoDesc {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ui-page__nextRow {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 10px 12px;
  border-radius: var(--radius-card);
  background: var(--glass-solid);
  border: 1px solid var(--glass-border);
  font-size: var(--text-base);
}
.ui-page__nextRow > :nth-child(2) {
  flex: 1;
  min-width: 0;
}
.ui-page__quickAdd {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  max-width: 620px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--glass-solid);
  border: 1px solid var(--glass-border);
}
.ui-page__quickAdd.is-typing {
  border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
}
.ui-page__quickLine {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-base);
}
.ui-page__quickText {
  flex: 1;
  min-width: 0;
}
.ui-page__quickHint {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ui-page__quickChips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 26px;
}
.ui-page__pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
  border-radius: var(--radius-pill);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--theme-text) 7%, transparent);
}
.ui-page__pillBtn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.ui-page__pillBtn .ui-icon {
  color: var(--theme-accent);
}
.ui-page__pillBtn.is-on {
  background: color-mix(in srgb, var(--theme-text) 12%, transparent);
  border-color: color-mix(in srgb, var(--theme-text) 20%, transparent);
  color: var(--theme-text);
}
.ui-page__pillDivider {
  width: 1px;
  height: 22px;
  margin: 0 6px;
  background: var(--glass-border);
}
.ui-page__pillSync {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px 0 4px;
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.ui-page__okDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-success);
}
.ui-page__tabbar {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  align-items: center;
  width: 366px;
  max-width: 100%;
  height: 64px;
  padding: 0 4px;
  border-radius: 32px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}
.ui-page__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ui-page__tabCap {
  display: grid;
  place-items: center;
  width: 44px;
  height: 32px;
  border-radius: 16px;
}
.ui-page__tab.is-on {
  color: var(--theme-accent);
}
.ui-page__tab.is-on .ui-page__tabCap {
  background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
}
.ui-page__focusRing {
  display: grid;
  place-items: center;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: conic-gradient(
    var(--theme-accent) var(--pct),
    color-mix(in srgb, var(--theme-text) 10%, transparent) var(--pct) 100%
  );
}
.ui-page__focusTime {
  display: grid;
  place-items: center;
  width: 184px;
  height: 184px;
  border-radius: 50%;
  background: var(--glass-solid);
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  letter-spacing: -0.03em;
}
@media (max-width: 640px) {
  .ui-page__easing {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-page__dot,
  .ui-page__slidePanel,
  .ui-page__todoMain,
  .ui-page__todoRow {
    transition: none;
  }
}
.ui-page__iconscale {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sp-4);
}
.ui-page__iconstep {
  display: grid;
  justify-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
.ui-page__icongrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: var(--sp-2);
}
.ui-page__icontile {
  display: grid;
  justify-items: center;
  gap: var(--sp-2);
  /* min-width: 0 so a long name ellipses rather than widening its cell. */
  min-width: 0;
  padding: var(--sp-3) var(--sp-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--theme-text);
  cursor: pointer;
}
.ui-page__icontile:hover {
  border-color: var(--theme-accent);
}
.ui-page__iconname {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
</style>
