// Section 26b, acceptance 134 — every row readable, clamped to two lines,
// never clipped.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import UnscheduledPanel from '@/components/UnscheduledPanel.vue'
import { SOURCE_COLOR } from '@/utils/calendarEvents'
import type { Task, Todo } from '@/types'

const SOURCE = readFileSync(resolve(__dirname, 'UnscheduledPanel.vue'), 'utf8')
const rule = (selector: string) => {
  const at = SOURCE.indexOf(`${selector} {`)
  return at < 0 ? '' : SOURCE.slice(at, SOURCE.indexOf('}', at)).replace(/\s+/g, ' ')
}

const task = (id: number, title: string) => ({ id, title }) as Task
const todo = (id: number, text: string) => ({ id, text }) as Todo

const make = (tasks: Task[] = [], todos: Todo[] = []) =>
  mount(UnscheduledPanel, { props: { tasks, todos } })

describe('the colour', () => {
  it('puts the type colour on a bar and never on the text', () => {
    // The bug: the rows took their hue from the item's type — the same value
    // the event chips tint with — and drew it as full-strength text on a dark
    // panel. A panel row is not a chip.
    const w = make([task(1, 'Renew the domain')])
    const row = w.find('.unsched__row')
    expect(row.attributes('style')).toContain(SOURCE_COLOR.task)
    expect(rule('.unsched__row')).toContain('border-left: 3px solid var(--row-bar)')
    expect(rule('.unsched__row')).toContain('color: var(--text-primary')
    expect(rule('.unsched__row')).toContain('background: var(--bg-elevated')
  })

  it('distinguishes a task from a todo by the bar alone', () => {
    const w = make([task(1, 'A')], [todo(2, 'B')])
    const bars = w.findAll('.unsched__row').map((r) => r.attributes('style'))
    expect(bars[0]).toContain(SOURCE_COLOR.task)
    expect(bars[1]).toContain(SOURCE_COLOR.todo)
    expect(bars[0]).not.toBe(bars[1])
  })

  it('keeps the text token off the row style, so no row can be tinted by data', () => {
    const w = make([task(1, 'A')])
    expect(w.find('.unsched__row').attributes('style')).not.toMatch(/(^|;)\s*color:/)
  })
})

describe('the box', () => {
  it('clamps to two lines rather than cutting mid-word', () => {
    const text = rule('.unsched__text')
    expect(text).toContain('-webkit-line-clamp: 2')
    expect(text).toContain('overflow-wrap: anywhere')
    expect(text).toContain('min-width: 0')
  })

  it('renders a long unbroken title without widening anything', () => {
    // A pasted URL has no break opportunity in it; `anywhere` is the only thing
    // that lets it wrap at all.
    const w = make([task(1, 'https://example.com/a/very/long/path/with/no/spaces/at/all/in/it')])
    expect(w.find('.unsched__text').text()).toContain('https://example.com')
    expect(rule('.unsched__text')).toContain('overflow-wrap: anywhere')
  })

  it('gives the panel its own scroll and a header that survives it', () => {
    expect(rule('.unsched')).toContain('overflow-y: auto')
    expect(rule('.unsched')).toContain('min-width: 0')
    expect(rule('.unsched__head')).toContain('position: sticky')
  })

  it('spaces the rows on the 8px step', () => {
    expect(rule('.unsched__list')).toContain('gap: var(--sp-2)')
  })
})

describe('the rows', () => {
  it('lists tasks and todos together, tasks first', () => {
    const w = make([task(1, 'A task')], [todo(2, 'A todo')])
    expect(w.findAll('.unsched__text').map((t) => t.text())).toEqual(['A task', 'A todo'])
  })

  it('keeps the drag payload FullCalendar reads off the element', () => {
    // The panel is bound as a Draggable and the drop handler reads the item
    // back out of the dataset; losing these attributes breaks scheduling with
    // nothing thrown.
    const row = make([task(7, 'Renew the domain')]).find('.unsched-item')
    expect(row.attributes('data-type')).toBe('task')
    expect(row.attributes('data-id')).toBe('7')
    expect(row.attributes('data-title')).toBe('Renew the domain')
  })

  it('shows the grip on hover but keeps it reachable by keyboard', () => {
    // opacity rather than v-if: a grip that is not in the DOM until hover is a
    // grip a keyboard user never gets.
    const w = make([task(1, 'A')])
    expect(w.find('.unsched__grip').exists()).toBe(true)
    expect(rule('.unsched__grip')).toContain('opacity: 0')
    expect(SOURCE).toContain('.unsched__row:focus-within .unsched__grip')
  })

  it('says so in a sentence when there is nothing to schedule', () => {
    const w = make()
    expect(w.find('.unsched__empty').text()).toBe('Everything is scheduled.')
    expect(w.findAll('.unsched__row')).toHaveLength(0)
  })

  it('counts what is in it', () => {
    expect(
      make([task(1, 'A')], [todo(2, 'B')])
        .find('.unsched__count')
        .text(),
    ).toBe('2')
  })
})

describe('the container it sits in', () => {
  const view = readFileSync(resolve(__dirname, 'views/CalendarView.vue'), 'utf8')

  it('is a 260px grid track with min-width: 0 on both columns', () => {
    expect(view).toContain("gridTemplateColumns: withPanel ? '260px minmax(0, 1fr)'")
  })

  it('exposes its element, because Draggable binds to a node not a component', () => {
    expect(SOURCE).toContain('defineExpose({ el: root })')
    expect(view).toContain('panelRef.value?.el')
  })

  it('rebinds the drag when the panel is reopened', () => {
    // The panel is v-if'd, so reopening it makes a new node; a Draggable still
    // holding the old one leaves the rows looking draggable and doing nothing.
    expect(view).toMatch(/watch\(\s*panelEl,/)
    expect(view).toContain('draggable?.destroy()')
  })
})
