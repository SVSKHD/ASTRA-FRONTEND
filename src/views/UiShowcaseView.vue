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

import {
  Accordion,
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
  GlassDatePicker,
  GlassPanel,
  IconButton,
  Input,
  KeyboardShortcut,
  Modal,
  Pagination,
  Popover,
  ProgressBar,
  ProgressRing,
  Radio,
  SearchField,
  SegmentedControl,
  Select,
  Skeleton,
  SlideOver,
  Slider,
  Stepper,
  Switch,
  Table,
  Tabs,
  Textarea,
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
const spacing = ['--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6']
const radii = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-pill']

// ---- live models for the demos ---------------------------------------------
const demo = ref({
  text: 'Ship the design system',
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
const sheetOpen = ref(false)
const drawerOpen = ref(false)
const popoverOpen = ref(false)

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
        <select v-model="themeChoice">
          <option v-for="d in THEME_DESCRIPTORS" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>
      <label class="ui-page__ctl">
        Density
        <select v-model="density" @change="applyChrome">
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <label class="ui-page__ctl">
        <input type="checkbox" v-model="rtl" @change="applyChrome" />
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

      <h3>Motion</h3>
      <p class="ui-page__note">
        150–200ms ease-out on hover and press, a spring on drop, 30ms list stagger — all gated on
        <code>prefers-reduced-motion</code>, which zeroes the duration tokens in one place.
      </p>
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
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </template>
          <template v-else-if="doc.name === 'IconButton'">
            <IconButton label="Refresh">↻</IconButton>
            <IconButton label="Solid" variant="solid">★</IconButton>
            <IconButton label="Active" active>◉</IconButton>
            <IconButton label="Disabled" disabled>×</IconButton>
          </template>
          <template v-else-if="doc.name === 'DragHandle'">
            <DragHandle />
            <DragHandle dragging />
          </template>

          <!-- Inputs -->
          <template v-else-if="doc.name === 'Input'">
            <Input v-model="demo.text" label="Title" hint="Shown under the field" />
            <Input v-model="demo.text" label="Error" error="Required" />
            <Input v-model="demo.text" label="Disabled" disabled />
            <Input v-model="demo.count" label="Amount" prefix="₹" type="number" />
          </template>
          <template v-else-if="doc.name === 'Textarea'">
            <Textarea v-model="demo.area" label="Notes" :rows="3" />
            <Textarea v-model="demo.area" label="Error" error="Too long" />
          </template>
          <template v-else-if="doc.name === 'Select'">
            <Select v-model="demo.select" :options="selectOptions" label="Project" />
            <Select v-model="demo.select" :options="selectOptions" label="Disabled" disabled />
          </template>
          <template v-else-if="doc.name === 'Combobox'">
            <Combobox v-model="demo.combo" :options="['work', 'home', 'errands']" label="Tag" />
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
            <Chip label="work" />
            <Chip label="goal" color="oklch(0.72 0.15 150)" />
            <Chip label="selected" selected />
            <Chip label="removable" removable />
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
            <ProgressBar :value="7" :max="18" label="Checklist" />
            <ProgressBar :value="18" :max="18" size="sm" label="Complete" />
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
          <template v-else-if="doc.name === 'Skeleton'">
            <Skeleton :lines="3" />
          </template>
          <template v-else-if="doc.name === 'Toast'">
            <Toast message="Task deleted" action-label="Undo" />
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
            <Accordion title="Advanced">Rarely-needed settings.</Accordion>
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
.ui-page {
  min-height: 100vh;
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  color: var(--theme-text);
  background: var(--theme-surface);
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
  gap: 4px;
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
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
</style>
