// Section 25c, acceptance 130. The timing rules, which are the part people
// notice and the part that was different in every form.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ASYNC_VALIDATE_MS, useForm } from '@/composables/useForm'
import { taskFormSchema } from '@/utils/formSchemas'

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a task name.'),
  email: z.union([z.literal(''), z.string().email('Enter an address like name@example.com.')]),
})

const make = (over: Partial<{ title: string; email: string }> = {}, onSubmit = vi.fn()) =>
  useForm({ initial: { title: '', email: '', ...over }, schema, onSubmit })

describe('when a field is allowed to complain', () => {
  it('says nothing about a field nobody has reached', () => {
    const form = make()
    form.validate()
    expect(form.errors.value.title).toBe('Enter a task name.')
    // The error exists; the field is simply not showing it yet.
    expect(form.errorFor('title')).toBe('')
  })

  it('speaks up once the field has been left', () => {
    const form = make()
    form.blur('title')
    expect(form.errorFor('title')).toBe('Enter a task name.')
  })

  it('stays quiet on the first keystrokes of an untouched field', () => {
    // Telling somebody their half-typed email is invalid is telling them
    // something they know, in a tone that reads as arguing.
    const form = make()
    form.values.email = 'a'
    form.change('email')
    expect(form.errorFor('email')).toBe('')
  })

  it('follows a touched field on every change, so a fix clears immediately', () => {
    const form = make()
    form.blur('title')
    expect(form.errorFor('title')).toBeTruthy()
    form.values.title = 'Ship it'
    form.change('title')
    expect(form.errorFor('title')).toBe('')
  })

  it('shows everything once submit has been attempted, visited or not', async () => {
    const form = make()
    await form.submit()
    expect(form.errorFor('title')).toBe('Enter a task name.')
  })
})

describe('submitting', () => {
  it('refuses and reports the count when anything is wrong', async () => {
    const form = make({ email: 'nope' })
    expect(await form.submit()).toBe(false)
    expect(form.invalidCount.value).toBe(2)
  })

  it('calls through with a snapshot once everything passes', async () => {
    const onSubmit = vi.fn()
    const form = make({ title: 'Ship it' }, onSubmit)
    expect(await form.submit()).toBe(true)
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Ship it', email: '' })
  })

  it('hands a rejection to the form, not to a field', async () => {
    // A toast about why a save failed fades while the reader is still looking
    // at the form working out what to fix.
    const form = make(
      { title: 'Ship it' },
      vi.fn().mockRejectedValue(new Error('The repository could not be reached.')),
    )
    expect(await form.submit()).toBe(false)
    expect(form.formError.value).toBe('The repository could not be reached.')
    expect(form.errors.value.title).toBeUndefined()
  })

  it('clears a stale form error before trying again', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const form = make({ title: 'Ship it' }, onSubmit)
    await form.submit()
    expect(form.formError.value).toBe('boom')
    await form.submit()
    expect(form.formError.value).toBe('')
  })

  it('flags submitting only while it is submitting', async () => {
    let release = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const form = make({ title: 'Ship it' }, vi.fn().mockReturnValue(gate))
    const running = form.submit()
    expect(form.submitting.value).toBe(true)
    release()
    await running
    expect(form.submitting.value).toBe(false)
  })

  it('focuses and scrolls to the first bad field', async () => {
    document.body.innerHTML = `
      <div data-field="title"><input id="t" /></div>
      <div data-field="email"><input id="e" /></div>`
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const form = make({ email: 'nope' })
    await form.submit()
    // Focus alone is not enough: on a long form the bad field is often above
    // the fold and the caret ends up somewhere nobody can see.
    expect(document.activeElement?.id).toBe('t')
    expect(scrollIntoView).toHaveBeenCalled()
    document.body.innerHTML = ''
  })
})

describe('dirty', () => {
  it('is false until something actually differs from where it started', () => {
    const form = make({ title: 'Ship it' })
    expect(form.dirty.value).toBe(false)
    form.values.title = 'Ship it now'
    expect(form.dirty.value).toBe(true)
    form.values.title = 'Ship it'
    expect(form.dirty.value).toBe(false)
  })
})

describe('async checks', () => {
  beforeEach(() => vi.useFakeTimers())

  it('waits for a pause, and does not block the field meanwhile', async () => {
    const run = vi.fn().mockResolvedValue('No repository by that name.')
    const form = useForm({
      initial: { title: 'x', email: '' },
      schema,
      async: [{ field: 'title', run }],
      onSubmit: vi.fn(),
    })
    form.blur('title')
    expect(run).not.toHaveBeenCalled()
    // The field is editable the whole time this is pending.
    form.values.title = 'xy'
    vi.advanceTimersByTime(ASYNC_VALIDATE_MS)
    await vi.runAllTimersAsync()
    expect(run).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('reports which field is waiting, so the control can show it', async () => {
    let settle: (v: string | null) => void = () => {}
    const run = vi.fn().mockReturnValue(new Promise<string | null>((r) => (settle = r)))
    const form = useForm({
      initial: { title: 'x', email: '' },
      schema,
      async: [{ field: 'title', run }],
      onSubmit: vi.fn(),
    })
    form.blur('title')
    await vi.advanceTimersByTimeAsync(ASYNC_VALIDATE_MS)
    expect(form.pending.value.has('title')).toBe(true)
    settle(null)
    await vi.runAllTimersAsync()
    expect(form.pending.value.has('title')).toBe(false)
    vi.useRealTimers()
  })

  it('drops an answer about a value that has since changed', async () => {
    let settle: (v: string | null) => void = () => {}
    const run = vi.fn().mockReturnValue(new Promise<string | null>((r) => (settle = r)))
    const form = useForm({
      initial: { title: 'x', email: '' },
      schema,
      async: [{ field: 'title', run }],
      onSubmit: vi.fn(),
    })
    form.blur('title')
    await vi.advanceTimersByTimeAsync(ASYNC_VALIDATE_MS)
    form.values.title = 'something else'
    settle('No repository by that name.')
    await vi.runAllTimersAsync()
    // Answering about a value nobody is looking at any more is worse than not
    // answering: the message names a repository that is no longer in the field.
    expect(form.errors.value.title).toBeUndefined()
    vi.useRealTimers()
  })

  it('keeps an async error alive across an unrelated schema pass', async () => {
    const form = useForm({
      initial: { title: 'x', email: '' },
      schema,
      async: [{ field: 'title', run: vi.fn().mockResolvedValue('No repository by that name.') }],
      onSubmit: vi.fn(),
    })
    form.blur('title')
    await vi.advanceTimersByTimeAsync(ASYNC_VALIDATE_MS)
    await vi.runAllTimersAsync()
    expect(form.errorFor('title')).toBe('No repository by that name.')
    form.blur('email')
    expect(form.errorFor('title')).toBe('No repository by that name.')
    vi.useRealTimers()
  })
})

describe('reset', () => {
  it('puts everything back, including what the reader had been told', async () => {
    const form = make()
    await form.submit()
    form.values.title = 'half typed'
    form.reset()
    expect(form.values.title).toBe('')
    expect(form.errorFor('title')).toBe('')
    expect(form.formError.value).toBe('')
    expect(form.dirty.value).toBe(false)
  })
})

describe('the schemas say what to do (section 25c)', () => {
  it('names the fix rather than the failure', () => {
    const result = taskFormSchema.safeParse({
      title: '',
      deadline: '',
      startAt: '',
      project: '',
      estimateMins: null,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Enter a task name.')
      // Not "Required", not "Invalid".
      expect(result.error.issues[0].message).not.toMatch(/^(Required|Invalid)$/)
    }
  })

  it('puts a two-field error on the field the reader was editing', () => {
    // An error on startAt would point at the value they set first and are
    // least likely to want to change.
    const result = taskFormSchema.safeParse({
      title: 'Ship it',
      startAt: '2026-11-30',
      deadline: '2026-01-01',
      project: '',
      estimateMins: null,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['deadline'])
      expect(result.error.issues[0].message).toBe('Enter a due date on or after the start date.')
    }
  })

  it('every message in the app ends in a full stop and says what to do', async () => {
    const { goalFormSchema, reminderFormSchema, repoLinkSchema } =
      await import('@/utils/formSchemas')
    const messages: string[] = []
    for (const s of [taskFormSchema, goalFormSchema, reminderFormSchema, repoLinkSchema]) {
      const r = s.safeParse({})
      if (!r.success) messages.push(...r.error.issues.map((i) => i.message))
    }
    expect(messages.length).toBeGreaterThan(0)
    for (const m of messages) {
      expect(m, m).toMatch(/\.$/)
      expect(m, m).not.toMatch(/^(Required|Invalid|Invalid input)/)
    }
  })
})
