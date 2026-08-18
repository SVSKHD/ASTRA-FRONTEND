import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useMarkdownPaste } from '@/composables/useMarkdownPaste'

function textarea(value: string, start: number, end = start): HTMLTextAreaElement {
  const el = document.createElement('textarea')
  el.value = value
  document.body.appendChild(el)
  el.setSelectionRange(start, end)
  return el
}

function pasteEvent(flavours: { text?: string; html?: string }): ClipboardEvent {
  const event = new Event('paste') as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) =>
        type === 'text/plain' ? (flavours.text ?? '') : (flavours.html ?? ''),
    },
  })
  return event
}

function harness(initial: string, start: number, end = start) {
  const el = ref<HTMLTextAreaElement | null>(textarea(initial, start, end))
  const state = { value: initial, caret: start }
  const notify = vi.fn()
  const { onPaste } = useMarkdownPaste({
    el,
    getValue: () => state.value,
    setValue: (value, caret) => {
      state.value = value
      state.caret = caret
      if (el.value) el.value.value = value
    },
    notify,
  })
  return { onPaste, state, notify, el }
}

describe('pasting into the source', () => {
  it('splices markdown at the caret and reports where it lands', async () => {
    const { onPaste, state } = harness('start\n', 6)
    await onPaste(pasteEvent({ text: '# Title\n\n- a' }))
    expect(state.value).toBe('start\n# Title\n\n- a')
    expect(state.caret).toBe(18)
  })

  it('replaces the selection rather than appending', async () => {
    const { onPaste, state } = harness('keep DROP end', 5, 9)
    await onPaste(pasteEvent({ text: '**new**' }))
    expect(state.value).toBe('keep **new** end')
  })

  it('prevents the browser default so nothing is inserted twice', async () => {
    const { onPaste } = harness('', 0)
    const event = pasteEvent({ text: 'plain words' })
    const spy = vi.spyOn(event, 'preventDefault')
    await onPaste(event)
    expect(spy).toHaveBeenCalled()
  })

  it('ignores an empty clipboard entirely', async () => {
    const { onPaste, state } = harness('unchanged', 0)
    const event = pasteEvent({})
    const spy = vi.spyOn(event, 'preventDefault')
    await onPaste(event)
    expect(spy).not.toHaveBeenCalled()
    expect(state.value).toBe('unchanged')
  })

  it('converts a rich HTML paste on the way in', async () => {
    const { onPaste, state } = harness('', 0)
    await onPaste(pasteEvent({ html: '<h2>Title</h2><ul><li>one</li></ul>' }))
    expect(state.value).toContain('## Title')
    expect(state.value).toContain('- one')
  })

  it('links the selection when a bare URL is pasted over it', async () => {
    const { onPaste, state } = harness('see the docs here', 4, 12)
    await onPaste(pasteEvent({ text: 'https://example.com' }))
    expect(state.value).toBe('see [the docs](https://example.com) here')
  })
})

describe('the reversal toast', () => {
  it('offers a one-click plain-text paste after a conversion', async () => {
    const { onPaste, notify } = harness('', 0)
    await onPaste(pasteEvent({ text: 'Title', html: '<h1>Title</h1><ul><li>a</li></ul>' }))
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toBe('Converted to markdown')
    expect(notify.mock.calls[0][2]).toBe('Paste as plain text')
  })

  it('says nothing for an ordinary plain paste', async () => {
    const { onPaste, notify } = harness('', 0)
    await onPaste(pasteEvent({ text: 'just words' }))
    expect(notify).not.toHaveBeenCalled()
  })

  it('reverses exactly the range the paste filled', async () => {
    const { onPaste, notify, state } = harness('before ', 7)
    await onPaste(pasteEvent({ text: 'Title', html: '<h1>Title</h1><ul><li>a</li></ul>' }))
    expect(state.value).toContain('# Title')
    notify.mock.calls[0][1]()
    expect(state.value).toBe('before Title')
  })

  it('declines to reverse once the pasted text has been edited away', async () => {
    const { onPaste, notify, state } = harness('', 0)
    await onPaste(pasteEvent({ text: 'Title', html: '<h1>Title</h1><ul><li>a</li></ul>' }))
    state.value = 'something else entirely'
    notify.mock.calls[0][1]()
    expect(state.value).toBe('something else entirely')
  })
})
