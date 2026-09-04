// The library's guard rails (acceptances 74 and 78): the registry, the files and
// the barrel stay in step, every component the spec names exists, and no
// component is implemented twice.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { UI_COMPONENTS, UI_GROUPS, componentsIn } from './registry'
import Button from './Button.vue'
import Badge from './Badge.vue'
import ProgressBar from './ProgressBar.vue'
import EmptyState from './EmptyState.vue'
import Tabs from './Tabs.vue'

const UI_DIR = join(process.cwd(), 'src/components/ui')
const COMPONENT_FILES = readdirSync(UI_DIR).filter((f) => f.endsWith('.vue'))

// The set section 16b asks for, mapped to this library's names.
const REQUIRED = [
  'Button',
  'IconButton',
  'TextInput',
  'TextArea',
  'Select',
  'Combobox',
  'Checkbox',
  'Radio',
  'Switch',
  'Slider',
  'Chip',
  'Badge',
  'Avatar',
  'Tooltip',
  'Popover',
  'Dropdown',
  'Modal',
  'BottomSheet',
  'SlideOver',
  'Tabs',
  'Accordion',
  'Table',
  'ProgressBar',
  'ProgressRing',
  'SaveState',
  'Skeleton',
  'Toast',
  'EmptyState',
  'Card',
  'GlassPanel',
  'DragHandle',
  'GlassDatePicker',
  'ColorPicker',
  'SearchField',
  'Pagination',
  'Stepper',
  'KeyboardShortcut',
]

describe('the library is complete', () => {
  it('every component the spec lists exists as a file', () => {
    const missing = REQUIRED.filter((name) => !COMPONENT_FILES.includes(`${name}.vue`))
    expect(missing).toEqual([])
  })

  it('every component file is exported from the barrel', () => {
    const barrel = readFileSync(join(UI_DIR, 'index.ts'), 'utf8')
    const unexported = COMPONENT_FILES.filter((f) => !barrel.includes(`./${f}`))
    expect(unexported).toEqual([])
  })

  it('every component file is documented in the registry, so /ui shows it', () => {
    const documented = new Set(UI_COMPONENTS.map((c) => c.name))
    const undocumented = COMPONENT_FILES.map((f) => f.replace('.vue', '')).filter(
      (n) => !documented.has(n),
    )
    expect(undocumented).toEqual([])
  })

  // A primitive with no props at all. Named rather than inferred: "documented
  // as having no props" and "nobody wrote the props down" look identical to a
  // length check, so the exception is a decision somebody made on purpose.
  const PROPLESS = ['IconSprite']

  it('every registry entry has a summary, props and a copyable snippet', () => {
    for (const doc of UI_COMPONENTS) {
      expect(doc.summary.length, doc.name).toBeGreaterThan(10)
      if (!PROPLESS.includes(doc.name)) expect(doc.props.length, doc.name).toBeGreaterThan(0)
      expect(doc.snippet, doc.name).toContain(`<${doc.name}`)
    }
  })

  it('sorts every component into a group the page renders', () => {
    const grouped = UI_GROUPS.flatMap((g) => componentsIn(g)).length
    expect(grouped).toBe(UI_COMPONENTS.length)
  })
})

describe('no component is implemented twice (acceptance 78)', () => {
  const appComponents = readdirSync(join(process.cwd(), 'src/components')).filter((f) =>
    f.endsWith('.vue'),
  )

  it('a library component name does not also exist outside ui/', () => {
    const clashes = appComponents.filter((f) => COMPONENT_FILES.includes(f))
    expect(clashes).toEqual([])
  })

  it('the superseded one-offs are gone, not merely unused', () => {
    for (const gone of ['ProgressRing.vue', 'LinkProgressBar.vue', 'DragHandle.vue']) {
      expect(appComponents, gone).not.toContain(gone)
    }
  })
})

describe('components are tokens-only', () => {
  // The rule from 16a/16b: a component styles itself from theme tokens, never
  // from a literal colour, so a new theme restyles it without an edit.
  const LITERAL_COLOR = /(?:^|[^-\w])(?:rgba?\(|#[0-9a-fA-F]{3,8}\b)/

  it('no ui/ component hardcodes an rgba or hex colour', () => {
    const offenders = COMPONENT_FILES.filter((file) => {
      const style = readFileSync(join(UI_DIR, file), 'utf8').split('<style')[1] ?? ''
      return LITERAL_COLOR.test(style)
    })
    expect(offenders).toEqual([])
  })
})

describe('components render in their documented states', () => {
  it('Button renders each variant and its loading state', () => {
    setActivePinia(createPinia())
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const wrapper = mount(Button, { props: { variant }, slots: { default: 'Go' } })
      expect(wrapper.classes()).toContain(`ui-btn--${variant}`)
    }
    const loading = mount(Button, { props: { loading: true } })
    expect(loading.attributes('aria-busy')).toBe('true')
    expect(loading.attributes('disabled')).toBeDefined()
  })

  it('Badge carries a glyph as well as a colour, so tone survives a mono theme', () => {
    const danger = mount(Badge, { props: { tone: 'danger', label: 'Failed' } })
    expect(danger.text()).toContain('Failed')
    expect(danger.get('.ui-badge__glyph').text()).toBe('×')
    expect(mount(Badge, { props: { tone: 'success', label: 'ok' } }).text()).toContain('✓')
  })

  it('ProgressBar clamps its fill and exposes progressbar semantics', () => {
    const over = mount(ProgressBar, { props: { value: 40, max: 10, label: 'x' } })
    expect(over.get('.ui-progress__fill').attributes('style')).toContain('width: 100%')
    expect(over.get('[role="progressbar"]').attributes('aria-valuemax')).toBe('10')
  })

  it('EmptyState renders its action slot', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Nothing here' },
      slots: { action: '<button>New</button>' },
    })
    expect(wrapper.text()).toContain('Nothing here')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('Tabs marks only the active tab as a tab stop', () => {
    const wrapper = mount(Tabs, {
      props: {
        modelValue: 'b',
        tabs: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0].attributes('tabindex')).toBe('-1')
    expect(tabs[1].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('aria-selected')).toBe('true')
  })
})
