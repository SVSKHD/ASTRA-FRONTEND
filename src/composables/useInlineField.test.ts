// An inline field's contract (section 18a): debounced autosave, Escape reverts
// that field, and a remote change never lands on a half-typed sentence.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { INLINE_SAVE_MS, useInlineField } from '@/composables/useInlineField'

type Field = ReturnType<typeof useInlineField>

// Mounted in a component so onBeforeUnmount is wired the way it is in use.
function harness(options: Parameters<typeof useInlineField>[0]) {
  let field!: Field
  const wrapper = mount(
    defineComponent({
      setup() {
        field = useInlineField(options)
        return () => h('input', { value: field.draft.value })
      },
    }),
  )
  return { field: field!, wrapper }
}

function typed(value: string): Event {
  return { target: { value } } as unknown as Event
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('autosave', () => {
  it('starts from the stored value', () => {
    const { field } = harness({ value: () => 'Quarter plan', commit: vi.fn() })
    expect(field.draft.value).toBe('Quarter plan')
  })

  it('waits for typing to stop before writing', () => {
    const commit = vi.fn()
    const { field } = harness({ value: () => 'a', commit })
    field.onInput(typed('ab'))
    field.onInput(typed('abc'))
    vi.advanceTimersByTime(INLINE_SAVE_MS - 1)
    expect(commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith('abc')
  })

  it('writes on blur rather than making the reader wait', () => {
    const commit = vi.fn()
    const { field } = harness({ value: () => 'a', commit })
    field.onInput(typed('ab'))
    field.onBlur()
    expect(commit).toHaveBeenCalledWith('ab')
  })

  it('does not write a value that did not change', () => {
    const commit = vi.fn()
    const { field } = harness({ value: () => 'a', commit })
    field.onInput(typed('a'))
    vi.advanceTimersByTime(INLINE_SAVE_MS)
    expect(commit).not.toHaveBeenCalled()
  })

  it('saves on the way out rather than dropping a pending edit', () => {
    const commit = vi.fn()
    const { field, wrapper } = harness({ value: () => 'a', commit })
    field.onInput(typed('ab'))
    wrapper.unmount()
    expect(commit).toHaveBeenCalledWith('ab')
  })
})

describe('the unsaved flag the close guard reads', () => {
  it('is raised while a write is pending and cleared once it lands', () => {
    const seen: boolean[] = []
    const { field } = harness({ value: () => 'a', commit: vi.fn(), onDirty: (d) => seen.push(d) })
    expect(field.dirty.value).toBe(false)
    field.onInput(typed('ab'))
    expect(field.dirty.value).toBe(true)
    vi.advanceTimersByTime(INLINE_SAVE_MS)
    expect(field.dirty.value).toBe(false)
    expect(seen).toEqual([true, false])
  })

  it('is cleared by an explicit flush', () => {
    const { field } = harness({ value: () => 'a', commit: vi.fn() })
    field.onInput(typed('ab'))
    field.flush()
    expect(field.dirty.value).toBe(false)
  })
})

describe('Escape', () => {
  it('puts the stored value back and cancels the pending write', () => {
    const commit = vi.fn()
    const { field } = harness({ value: () => 'Quarter plan', commit })
    field.onInput(typed('Quarter pl'))
    field.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(field.draft.value).toBe('Quarter plan')
    vi.advanceTimersByTime(INLINE_SAVE_MS)
    expect(commit).not.toHaveBeenCalled()
    expect(field.dirty.value).toBe(false)
  })

  it('stops there, so the dialog does not also close', () => {
    const { field } = harness({ value: () => 'a', commit: vi.fn() })
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    const stop = vi.spyOn(event, 'stopPropagation')
    field.onKeydown(event)
    expect(stop).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves other keys alone', () => {
    const { field } = harness({ value: () => 'a', commit: vi.fn() })
    const event = new KeyboardEvent('keydown', { key: 'j', cancelable: true })
    field.onKeydown(event)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('a remote change arriving', () => {
  it('is adopted while the field is settled', async () => {
    const stored = ref('a')
    const { field } = harness({ value: () => stored.value, commit: vi.fn() })
    stored.value = 'their edit'
    await nextTick()
    expect(field.draft.value).toBe('their edit')
  })

  it('is not allowed to yank a half-typed sentence away', async () => {
    const stored = ref('a')
    const { field } = harness({ value: () => stored.value, commit: vi.fn() })
    field.onInput(typed('my edit'))
    stored.value = 'their edit'
    await nextTick()
    expect(field.draft.value).toBe('my edit')
  })

  it('is not adopted into a focused but unchanged field either', async () => {
    const stored = ref('a')
    const { field } = harness({ value: () => stored.value, commit: vi.fn() })
    field.onFocus()
    stored.value = 'their edit'
    await nextTick()
    expect(field.draft.value).toBe('a')
  })
})

describe('editors that hand back a value rather than an event', () => {
  it('schedule the same write', () => {
    const commit = vi.fn()
    const { field } = harness({ value: () => 'a', commit })
    field.set('from the markdown editor')
    vi.advanceTimersByTime(INLINE_SAVE_MS)
    expect(commit).toHaveBeenCalledWith('from the markdown editor')
  })
})
