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
    name: 'Icon',
    group: 'Display',
    summary: 'Every icon in the app. One set, one weight, five sizes.',
    props: [
      { name: 'name', type: 'IconName', note: 'A name from the set — see the Icons page.' },
      { name: 'size', type: "'xs' | 'sm' | 'md' | 'lg' | 'xl'", default: 'sm' },
      {
        name: 'label',
        type: 'string',
        note: 'Set only when the icon carries meaning on its own; otherwise it is hidden.',
      },
    ],
    snippet: '<Icon name="bell" size="sm" />',
  },
  {
    name: 'IconSprite',
    group: 'Display',
    summary: 'The set itself, mounted once at the app root. Never rendered anywhere else.',
    props: [],
    snippet: '<IconSprite />',
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
    name: 'TextInput',
    group: 'Inputs',
    summary:
      'The text field. Leading icon or slot, prefix/suffix, clear button, inline loading — everything that lives inside the box. The label lives in FormField.',
    props: [
      { name: 'modelValue', type: 'string | number | null' },
      {
        name: 'type',
        type: "'text' | 'number' | 'email' | 'password' | 'url' | 'search' | 'tel'",
        default: 'text',
      },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'icon', type: 'IconName', note: 'Drawn inside the box, before the text.' },
      { name: 'prefix', type: 'string', note: 'Part of the field, not of the value.' },
      { name: 'suffix', type: 'string' },
      { name: 'clearable', type: 'boolean' },
      { name: 'loading', type: 'boolean' },
      { name: 'invalid', type: 'boolean' },
      { name: 'readonly', type: 'boolean' },
    ],
    snippet: '<TextInput v-model="title" placeholder="Ship the bot" />',
  },
  {
    name: 'NumberInput',
    group: 'Inputs',
    summary:
      'A number field with its own steppers, arrow-key nudging and tabular figures — and no browser spinners.',
    props: [
      { name: 'modelValue', type: 'number | null' },
      { name: 'min', type: 'number' },
      { name: 'max', type: 'number', note: 'Clamped on blur, not while typing.' },
      { name: 'step', type: 'number', default: '1' },
      { name: 'suffix', type: 'string', note: 'A unit — "min", "kg".' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'disabled', type: 'boolean' },
      { name: 'readonly', type: 'boolean' },
    ],
    snippet: '<NumberInput v-model="estimate" :min="0" :step="15" suffix="min" />',
  },
  {
    name: 'TextArea',
    group: 'Inputs',
    summary:
      'The multi-line field. Auto-grows through the same composable as the inline row editors; a fixed rows is available for a window onto something long.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'rows', type: 'number', default: '3', note: 'Starting height.' },
      { name: 'autoGrow', type: 'boolean', default: 'true' },
      { name: 'maxHeight', type: 'string', default: '40vh', note: 'Past this it scrolls.' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'invalid', type: 'boolean' },
      { name: 'readonly', type: 'boolean' },
    ],
    snippet: '<TextArea v-model="notes" :rows="3" />',
  },
  {
    name: 'AutoTextarea',
    group: 'Inputs',
    summary: 'Inline-editable line that grows to fit its text and shows no chrome until focused.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'variant', type: "'body' | 'title'", default: 'body' },
      { name: 'done', type: 'boolean', note: 'Struck through and dimmed, still readable.' },
      { name: 'minHeight', type: 'number', note: 'Floor in px, for a list of empty rows.' },
    ],
    snippet: '<AutoTextarea v-model="point.text" label="Point" @commit="next" />',
  },
  {
    name: 'Select',
    group: 'Inputs',
    summary:
      'A themed listbox in a portal — not a native select. Type-ahead, arrows, Home/End, Esc; groups, icons per option, optional clear.',
    props: [
      { name: 'modelValue', type: 'string' },
      {
        name: 'options',
        type: 'SelectOption[]',
        note: '{ value, label, group?, icon?, disabled? }',
      },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'placeholder', type: 'string', default: 'Select…' },
      { name: 'clearable', type: 'boolean' },
      { name: 'disabled', type: 'boolean' },
      { name: 'readonly', type: 'boolean' },
      { name: 'invalid', type: 'boolean', note: 'Set by FormField; danger border and ring.' },
    ],
    snippet: '<Select v-model="project" :options="projects" />',
  },
  {
    name: 'MultiSelect',
    group: 'Inputs',
    summary:
      'The same list, with the chosen values as removable chips inside the control; overflow collapses to +N.',
    props: [
      { name: 'modelValue', type: 'string[]' },
      { name: 'options', type: 'ListOption[]' },
      { name: 'maxChips', type: 'number', default: '3', note: 'Beyond this, the rest become +N.' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'disabled', type: 'boolean' },
      { name: 'invalid', type: 'boolean' },
    ],
    snippet: '<MultiSelect v-model="tags" :options="allTags" />',
  },
  {
    name: 'TagInput',
    group: 'Inputs',
    summary:
      'An open set: Enter or comma adds, backspace removes the last, duplicates are refused case-insensitively.',
    props: [
      { name: 'modelValue', type: 'string[]' },
      { name: 'suggestions', type: 'string[]', note: 'Offered beneath; typing still wins.' },
      { name: 'max', type: 'number' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'disabled', type: 'boolean' },
      { name: 'readonly', type: 'boolean' },
    ],
    snippet: '<TagInput v-model="tags" :suggestions="known" />',
  },
  {
    name: 'Combobox',
    group: 'Inputs',
    summary:
      'Select plus a filter. The input owns the value, so a value not in the list is still a value; async loading and a create affordance are built in.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'options', type: 'ListOption[]' },
      { name: 'creatable', type: 'boolean', note: 'Offers "Create …" when nothing matches.' },
      {
        name: 'loading',
        type: 'boolean',
        note: 'Spinner in the trailing slot, not over the text.',
      },
      { name: 'externalFilter', type: 'boolean', note: 'Set when the parent filters (async).' },
      { name: 'emptyText', type: 'string', default: 'No results' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
    ],
    snippet: '<Combobox v-model="tag" :options="tags" creatable />',
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
    name: 'Alert',
    group: 'Feedback',
    summary:
      'A message that stays. Unlike a Toast, which is for something that happened and is over, an alert is for something that is still true — a server rejection explaining why this form did not save.',
    props: [
      { name: 'tone', type: "'danger' | 'warning' | 'success' | 'info'", default: 'info' },
      { name: 'title', type: 'string' },
      { name: 'dismissible', type: 'boolean', default: 'false' },
    ],
    snippet: '<Alert tone="danger">The repository could not be reached.</Alert>',
  },
  {
    name: 'FormField',
    group: 'Inputs',
    summary:
      'The shell every control sits in: label, required marker, hint, error, counter and the aria wiring. Controls render none of it themselves.',
    props: [
      { name: 'label', type: 'string' },
      { name: 'hint', type: 'string', note: 'Replaced by `error`, never stacked with it.' },
      { name: 'error', type: 'string' },
      { name: 'required', type: 'boolean' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'disabled', type: 'boolean' },
      { name: 'readonly', type: 'boolean' },
      { name: 'id', type: 'string', note: 'Generated when omitted.' },
      { name: 'length', type: 'number', note: 'With `maxLength`, renders a counter.' },
      { name: 'maxLength', type: 'number' },
    ],
    snippet:
      '<FormField label="Title" :error="err" v-slot="f"><TextInput v-bind="f" /></FormField>',
  },
  {
    name: 'SegmentedControl',
    group: 'Inputs',
    summary: 'Two to four exclusive options, all visible at once. Replaces a short radio group.',
    props: [
      { name: 'modelValue', type: 'string' },
      { name: 'options', type: 'Segment[]', note: '{ value, label } — two to four of them.' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: 'md' },
      { name: 'disabled', type: 'boolean' },
      {
        name: 'ariaLabel',
        type: 'string',
        note: 'Names the group when there is no visible label.',
      },
    ],
    snippet: '<SegmentedControl v-model="kind" :options="KINDS" />',
  },
  {
    name: 'StatRow',
    group: 'Display',
    summary:
      'A row of metrics as stacked label/value pairs with dividers. Replaces a run-on strip where labels and values alternate and the eye cannot pair them.',
    props: [
      {
        name: 'stats',
        type: 'Stat[]',
        note: '{ label, value, tone?, note? } — tone only where a sign carries meaning.',
      },
      { name: 'size', type: "'md' | 'lg'", default: 'md' },
    ],
    snippet: "<StatRow :stats=\"[{ label: 'Net', value: '+₹0', tone: 'neutral' }]\" />",
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
      {
        name: 'dayMeta',
        type: 'Record<string, DayMeta>',
        note: 'Per-day tone / intensity / title, keyed by YYYY-MM-DD. Paints the grid.',
      },
      {
        name: 'quickEntry',
        type: 'boolean',
        default: 'true',
        note: 'The typed field and preset chips. Off when the grid is a calendar, not a field.',
      },
      {
        name: 'slot: day',
        type: '{ cell, meta }',
        note: 'Replaces the day number — where a painted grid puts its own mark.',
      },
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
    name: 'SaveState',
    group: 'Feedback',
    summary: 'The three states of a save — ring, check, error — in a box that never resizes.',
    props: [
      { name: 'state', type: "'idle' | 'working' | 'done' | 'failed'" },
      { name: 'size', type: 'IconSize', default: "'xs'" },
    ],
    snippet: '<SaveState state="working" />',
  },
  {
    name: 'TopProgressBar',
    group: 'Feedback',
    summary:
      'A 2px indeterminate bar at the top of the viewport. Route changes and background syncs only.',
    props: [{ name: 'active', type: 'boolean' }],
    snippet: '<TopProgressBar :active="syncing" />',
  },
  {
    name: 'UnsavedSheet',
    group: 'Feedback',
    summary: 'Asks about unsaved work by naming the fields. Save, then Discard; Escape goes back.',
    props: [
      { name: 'open', type: 'boolean' },
      { name: 'fields', type: 'string[]' },
      { name: 'title', type: 'string' },
    ],
    snippet: '<UnsavedSheet :open="asking" :fields="[\'Assignee\']" />',
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
      { name: 'side', type: "'left' | 'right'", default: 'right' },
      {
        name: 'size',
        type: "'md' | 'lg'",
        default: 'md',
        note: 'lg (560px) for a drawer that carries a reference table.',
      },
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
