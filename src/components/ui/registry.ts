// The component library's own index (section 16b). The /ui showcase renders from
// this rather than from a hand-maintained page, so a component added to the
// library appears on the page, in the props table, and in the test that asserts
// the library is complete — without three separate edits that can drift.

export type UiGroup = 'Inputs' | 'Actions' | 'Display' | 'Surfaces' | 'Navigation' | 'Feedback'

export interface PropDoc {
  name: string
  type: string
  default?: string
  note?: string
}

export interface ComponentDoc {
  name: string
  group: UiGroup
  summary: string
  props: PropDoc[]
  // The line a developer copies to use it.
  snippet: string
}

export const UI_COMPONENTS: ComponentDoc[] = [
  {
    name: 'Button',
    group: 'Actions',
    summary: 'Primary action control, four variants and three sizes.',
    props: [
      { name: 'variant', type: "'primary' | 'secondary' | 'ghost' | 'danger'", default: 'primary' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'loading', type: 'boolean', note: 'Disables and shows a spinner.' },
      { name: 'block', type: 'boolean', note: 'Full width.' },
    ],
    snippet: '<Button variant="primary" size="md">Save</Button>',
  },
  {
    name: 'IconButton',
    group: 'Actions',
    summary: 'Square glyph button. The label is required and becomes aria-label.',
    props: [
      { name: 'label', type: 'string', note: 'Required — icon-only needs a name.' },
      { name: 'variant', type: "'ghost' | 'solid'", default: 'ghost' },
      { name: 'active', type: 'boolean' },
    ],
    snippet: '<IconButton label="Delete">×</IconButton>',
  },
  {
    name: 'Input',
    group: 'Inputs',
    summary: 'Text field with label, hint and error wired to the input by id.',
    props: [
      { name: 'modelValue', type: 'string | number | null' },
      { name: 'label / hint / error', type: 'string' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'prefix', type: 'string', note: 'Adornment inside the box (₹).' },
    ],
    snippet: '<Input v-model="name" label="Name" hint="As it appears" />',
  },
  {
    name: 'Textarea',
    group: 'Inputs',
    summary: 'Multi-line field sharing Input’s label/hint/error contract.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'rows', type: 'number', default: '3' },
    ],
    snippet: '<Textarea v-model="notes" label="Notes" :rows="4" />',
  },
  {
    name: 'Select',
    group: 'Inputs',
    summary: 'Native select, themed — keeps the platform picker on mobile.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'options', type: '{ value, label }[]' },
    ],
    snippet: '<Select v-model="scope" :options="options" label="Scope" />',
  },
  {
    name: 'Combobox',
    group: 'Inputs',
    summary: 'Filtering text field that still allows a value not in the list.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'options', type: 'string[]' },
    ],
    snippet: '<Combobox v-model="tag" :options="tags" label="Tag" />',
  },
  {
    name: 'Checkbox',
    group: 'Inputs',
    summary: 'Checkbox with indeterminate support over a real input.',
    props: [
      { name: 'modelValue', type: 'boolean' },
      { name: 'indeterminate', type: 'boolean' },
    ],
    snippet: '<Checkbox v-model="done" label="Include archived" />',
  },
  {
    name: 'Radio',
    group: 'Inputs',
    summary: 'One radio in a named group; the browser handles arrow keys.',
    props: [
      { name: 'modelValue / value', type: 'string' },
      { name: 'name', type: 'string', note: 'Shared across the group.' },
    ],
    snippet: '<Radio v-model="mode" value="all" name="mode" label="All" />',
  },
  {
    name: 'Switch',
    group: 'Inputs',
    summary: 'Immediate binary toggle, role="switch".',
    props: [
      { name: 'modelValue', type: 'boolean' },
      { name: 'size', type: "'sm' | 'md'", default: 'md' },
    ],
    snippet: '<Switch v-model="syncEnabled" label="Sync" />',
  },
  {
    name: 'Slider',
    group: 'Inputs',
    summary: 'Range input with a readout, because a slider without one is a guess.',
    props: [
      { name: 'modelValue', type: 'number' },
      { name: 'min / max / step', type: 'number' },
    ],
    snippet: '<Slider v-model="weight" :min="0" :max="10" label="Weight" />',
  },
  {
    name: 'SearchField',
    group: 'Inputs',
    summary: 'Search box with a clear affordance built in.',
    props: [{ name: 'modelValue', type: 'string' }],
    snippet: '<SearchField v-model="query" placeholder="Search issues…" />',
  },
  {
    name: 'GlassDatePicker',
    group: 'Inputs',
    summary: 'The single date/time control: date, datetime, time, range, month.',
    props: [
      { name: 'mode', type: "'date' | 'datetime' | 'time' | 'range' | 'month'", default: 'date' },
      { name: 'min / max', type: 'string', note: 'YYYY-MM-DD bounds.' },
      { name: 'inline', type: 'boolean', note: 'Renders the panel with no trigger.' },
    ],
    snippet: '<GlassDatePicker v-model="dueAt" mode="date" />',
  },
  {
    name: 'ColorPicker',
    group: 'Inputs',
    summary: 'Fixed palette of swatches — no free wheel that can fail contrast.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'colors', type: 'string[]' },
    ],
    snippet: '<ColorPicker v-model="goalColor" />',
  },
  {
    name: 'Stepper',
    group: 'Inputs',
    summary: 'Numeric stepper whose field stays typable.',
    props: [
      { name: 'modelValue', type: 'number' },
      { name: 'min / max / step', type: 'number' },
    ],
    snippet: '<Stepper v-model="count" :min="1" :max="20" label="Count" />',
  },
  {
    name: 'Chip',
    group: 'Display',
    summary: 'Tag with an optional colour dot and remove affordance.',
    props: [
      { name: 'label', type: 'string' },
      { name: 'color', type: 'string' },
      { name: 'removable', type: 'boolean' },
    ],
    snippet: '<Chip label="work" color="oklch(0.7 0.15 250)" removable />',
  },
  {
    name: 'Badge',
    group: 'Display',
    summary: 'Status badge that carries a glyph as well as a colour.',
    props: [
      { name: 'tone', type: "'neutral' | 'success' | 'warning' | 'danger' | 'info'" },
      { name: 'label', type: 'string' },
    ],
    snippet: '<Badge tone="success" label="Synced" />',
  },
  {
    name: 'Avatar',
    group: 'Display',
    summary: 'Image avatar that degrades to a derived initial.',
    props: [
      { name: 'name', type: 'string' },
      { name: 'src', type: 'string' },
      { name: 'size', type: "'sm' | 'md' | 'lg'" },
    ],
    snippet: '<Avatar name="Ada Lovelace" size="md" />',
  },
  {
    name: 'ProgressBar',
    group: 'Display',
    summary: 'Determinate line using the accent gradient pair.',
    props: [
      { name: 'value / max', type: 'number' },
      { name: 'size', type: "'sm' | 'md'" },
    ],
    snippet: '<ProgressBar :value="7" :max="18" label="Checklist" />',
  },
  {
    name: 'ProgressRing',
    group: 'Display',
    summary: 'Circular progress; the ratio is clamped for the caller.',
    props: [
      { name: 'ratio', type: 'number', note: '0–1, clamped.' },
      { name: 'size / stroke', type: 'number' },
    ],
    snippet: '<ProgressRing :ratio="0.62" :size="44" />',
  },
  {
    name: 'Skeleton',
    group: 'Feedback',
    summary: 'Loading placeholder shaped like the content it stands in for.',
    props: [
      { name: 'lines', type: 'number', default: '1' },
      { name: 'width / height', type: 'string' },
    ],
    snippet: '<Skeleton :lines="3" />',
  },
  {
    name: 'Toast',
    group: 'Feedback',
    summary: 'Transient message with an optional action, role="status".',
    props: [
      { name: 'message', type: 'string' },
      { name: 'actionLabel', type: 'string' },
      { name: 'tone', type: "'neutral' | 'danger'" },
    ],
    snippet: '<Toast message="Task deleted" action-label="Undo" />',
  },
  {
    name: 'EmptyState',
    group: 'Feedback',
    summary: 'Glyph, sentence and the action that creates the first item.',
    props: [
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'glyph', type: 'string' },
    ],
    snippet: '<EmptyState glyph="◎" title="No goals yet" />',
  },
  {
    name: 'Tooltip',
    group: 'Feedback',
    summary: 'Hover and focus tooltip — focus, so it is not pointer-only.',
    props: [
      { name: 'text', type: 'string' },
      { name: 'placement', type: "'top' | 'bottom'" },
    ],
    snippet: '<Tooltip text="Sync now"><IconButton label="Sync">↻</IconButton></Tooltip>',
  },
  {
    name: 'Card',
    group: 'Surfaces',
    summary: 'Content card; interactive cards render as real buttons.',
    props: [
      { name: 'title', type: 'string' },
      { name: 'interactive', type: 'boolean' },
    ],
    snippet: '<Card title="Repo">…</Card>',
  },
  {
    name: 'GlassPanel',
    group: 'Surfaces',
    summary: 'The glass surface itself — blur, border and shadow in one place.',
    props: [
      { name: 'padding', type: "'none' | 'sm' | 'md' | 'lg'" },
      { name: 'radius', type: "'md' | 'lg' | 'xl'" },
    ],
    snippet: '<GlassPanel padding="md">…</GlassPanel>',
  },
  {
    name: 'Modal',
    group: 'Surfaces',
    summary: 'Centred dialog with scrim, focus trap and focus return.',
    props: [
      { name: 'open', type: 'boolean' },
      { name: 'title', type: 'string' },
      { name: 'size', type: "'sm' | 'md' | 'lg'" },
    ],
    snippet: '<Modal :open="open" title="Confirm" @close="open = false">…</Modal>',
  },
  {
    name: 'BottomSheet',
    group: 'Surfaces',
    summary: 'The mobile counterpart to Modal, thumb-reachable.',
    props: [
      { name: 'open', type: 'boolean' },
      { name: 'title', type: 'string' },
    ],
    snippet: '<BottomSheet :open="open" title="Filters" @close="open = false">…</BottomSheet>',
  },
  {
    name: 'SlideOver',
    group: 'Surfaces',
    summary: 'Side drawer for secondary flows.',
    props: [
      { name: 'open', type: 'boolean' },
      { name: 'side', type: "'left' | 'right'" },
    ],
    snippet: '<SlideOver :open="open" title="Details" @close="open = false">…</SlideOver>',
  },
  {
    name: 'Popover',
    group: 'Surfaces',
    summary: 'Anchored panel that closes on outside click and Escape.',
    props: [
      { name: 'open', type: 'boolean' },
      { name: 'align', type: "'start' | 'end'" },
    ],
    snippet: '<Popover :open="open" @close="open = false">…</Popover>',
  },
  {
    name: 'Dropdown',
    group: 'Navigation',
    summary: 'Action menu with roving arrow-key focus.',
    props: [
      { name: 'items', type: '{ value, label, disabled? }[]' },
      { name: 'label', type: 'string' },
    ],
    snippet: '<Dropdown :items="items" label="Actions" @select="onSelect" />',
  },
  {
    name: 'Tabs',
    group: 'Navigation',
    summary: 'ARIA tab strip; only the active tab is a tab stop.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'tabs', type: '{ value, label }[]' },
    ],
    snippet: '<Tabs v-model="pane" :tabs="tabs" />',
  },
  {
    name: 'Accordion',
    group: 'Navigation',
    summary: 'Disclosure built on native details/summary.',
    props: [
      { name: 'title', type: 'string' },
      { name: 'open', type: 'boolean' },
    ],
    snippet: '<Accordion title="Advanced">…</Accordion>',
  },
  {
    name: 'Table',
    group: 'Display',
    summary: 'Real table markup; wide tables scroll inside their own box.',
    props: [
      { name: 'columns', type: '{ key, label, align? }[]' },
      { name: 'rows', type: 'Record<string, unknown>[]' },
    ],
    snippet: '<Table :columns="columns" :rows="rows" caption="Repos" />',
  },
  {
    name: 'Pagination',
    group: 'Navigation',
    summary: 'Page controls with a live count; ends disable rather than wrap.',
    props: [{ name: 'page / pageCount', type: 'number' }],
    snippet: '<Pagination v-model:page="page" :page-count="9" />',
  },
  {
    name: 'DragHandle',
    group: 'Actions',
    summary: 'The grip: grab/grabbing cursors and a keyboard affordance.',
    props: [
      { name: 'label', type: 'string' },
      { name: 'dragging', type: 'boolean' },
    ],
    snippet: '<DragHandle :dragging="isDragging" />',
  },
  {
    name: 'KeyboardShortcut',
    group: 'Display',
    summary: 'Keycaps using the platform’s own modifier glyphs.',
    props: [{ name: 'keys', type: 'string', note: "e.g. 'mod+k'." }],
    snippet: '<KeyboardShortcut keys="mod+k" />',
  },
]

export const UI_GROUPS: UiGroup[] = [
  'Actions',
  'Inputs',
  'Display',
  'Surfaces',
  'Navigation',
  'Feedback',
]

export function componentsIn(group: UiGroup): ComponentDoc[] {
  return UI_COMPONENTS.filter((c) => c.group === group)
}
