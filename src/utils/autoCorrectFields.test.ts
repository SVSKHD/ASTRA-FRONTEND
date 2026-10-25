// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const correct = vi.fn<(text: string) => Promise<string | null>>()
vi.mock('@/utils/autoCorrect', async (orig) => ({
  ...(await orig<typeof import('@/utils/autoCorrect')>()),
  correctTypos: (text: string) => correct(text),
}))

import { installAutoCorrect } from '@/utils/autoCorrectFields'

beforeAll(() => installAutoCorrect())
afterEach(() => {
  document.body.innerHTML = ''
  correct.mockReset()
})

/** The sub-todo box: a form whose Enter submits it. */
function subForm() {
  const form = document.createElement('form')
  const input = document.createElement('input')
  input.type = 'text'
  form.appendChild(input)
  document.body.appendChild(form)
  const submitted: string[] = []
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    submitted.push(input.value)
  })
  input.focus()
  return { input, submitted }
}

function type(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const enter = (el: Element) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

describe('Enter in a field with unchecked text', () => {
  it('submits the form once the check is back, with the corrected text', async () => {
    correct.mockResolvedValue('Buy the milk')
    const { input, submitted } = subForm()
    type(input, 'Buy teh milk')
    enter(input)
    await vi.waitFor(() => expect(submitted).toEqual(['Buy the milk']))
  })

  it('still submits when there is nothing to fix', async () => {
    correct.mockResolvedValue(null)
    const { input, submitted } = subForm()
    type(input, 'Buy milk today')
    enter(input)
    await vi.waitFor(() => expect(submitted).toEqual(['Buy milk today']))
  })

  // These two leave the AI marked as slow, so they run after the ones above.
  it('lets a second Enter through at once, and drops the held one', async () => {
    correct.mockReturnValue(new Promise(() => {})) // an AI that never answers
    const { input, submitted } = subForm()
    type(input, 'Call the dentist')
    expect(enter(input)).toBe(false) // held
    expect(enter(input)).toBe(true) // passes straight through
    // The held press, released after the wait, does not submit a second time.
    await new Promise((r) => setTimeout(r, 1200))
    expect(submitted).toEqual([])
  })

  it('does not hold Enter at all while the AI is slow', () => {
    const { input } = subForm()
    type(input, 'Water the plants')
    expect(enter(input)).toBe(true)
  })
})
