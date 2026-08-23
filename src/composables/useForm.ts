// One validation pattern for the whole app (section 25c).
//
// Every form here validated differently. Some checked on submit, some on every
// keystroke, one showed "Invalid" under a field before it had been reached. The
// timing is the part people notice: an error that appears while you are still
// typing the first three characters of a name reads as the app arguing with
// you, and an error that only appears on submit makes you fix things one round
// trip at a time.
//
// The rule, applied uniformly:
//
//   - A field is silent until it has been *left* once. First pass validates on
//     blur.
//   - After that it validates on change, so correcting a mistake clears the
//     message as soon as it is correct rather than on the next blur.
//   - Submit validates everything, including the fields never visited.
//
// The schema is Zod so the messages live beside the types rather than inside a
// template. "Enter a date on or after the start date" is written once, in the
// place that knows what the constraint is.

import { computed, reactive, ref, type Ref } from 'vue'
import type { ZodType } from 'zod'

/** How long an async check waits after the last keystroke. */
export const ASYNC_VALIDATE_MS = 400

export type Errors<T> = Partial<Record<keyof T & string, string>>

export interface AsyncCheck<T> {
  /** The field the result attaches to. */
  field: keyof T & string
  /** Resolves to an error message, or null when the value is fine. */
  run: (value: T) => Promise<string | null>
}

export interface UseFormOptions<T extends object> {
  initial: T
  schema: ZodType<unknown>
  /** Checks that need the network. Debounced, never blocking. */
  async?: AsyncCheck<T>[]
  onSubmit: (values: T) => Promise<void> | void
}

export interface UseForm<T extends object> {
  values: T
  errors: Ref<Errors<T>>
  touched: Ref<Set<string>>
  submitting: Ref<boolean>
  /** Set when the *form* failed rather than a field — a server rejection. */
  formError: Ref<string>
  dirty: Ref<boolean>
  /** Fields with an async check in flight. */
  pending: Ref<Set<string>>
  /** True once a submit has been attempted; makes every field show its errors. */
  submitted: Ref<boolean>
  /** The error to display for a field — empty until the field has earned one. */
  errorFor: (field: keyof T & string) => string
  /** Call from a control's blur. Starts that field validating. */
  blur: (field: keyof T & string) => void
  /** Call when a value changes. Validates only if the field has been touched. */
  change: (field: keyof T & string) => void
  validate: () => boolean
  submit: () => Promise<boolean>
  reset: (next?: Partial<T>) => void
  /** For the aria-live region: how many fields are wrong after a submit. */
  invalidCount: Ref<number>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function useForm<T extends object>(options: UseFormOptions<T>): UseForm<T> {
  const initial = clone(options.initial)
  const values = reactive(clone(options.initial)) as T
  const errors = ref({}) as Ref<Errors<T>>
  const touched = ref(new Set<string>())
  const submitting = ref(false)
  const submitted = ref(false)
  const formError = ref('')
  const pending = ref(new Set<string>())
  const invalidCount = ref(0)

  // Async results are kept apart from the synchronous ones. Merging them would
  // mean a schema pass wiping out "that repo does not exist" every time an
  // unrelated field changed.
  const asyncErrors = ref({}) as Ref<Errors<T>>
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const dirty = computed(() => JSON.stringify(values) !== JSON.stringify(initial))

  function runSchema(): Errors<T> {
    const result = options.schema.safeParse(values)
    if (result.success) return {}
    const next: Errors<T> = {}
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '') as keyof T & string
      // First message per field. A field with three broken rules gets the first
      // thing to fix, not a paragraph.
      if (key && !next[key]) next[key] = issue.message
    }
    return next
  }

  function refresh() {
    const sync = runSchema()
    errors.value = { ...asyncErrors.value, ...sync }
  }

  function scheduleAsync(field: keyof T & string) {
    const checks = (options.async ?? []).filter((c) => c.field === field)
    if (!checks.length) return
    clearTimeout(timers.get(field))
    // Debounced, and never in the way: the field stays editable while this runs
    // and the result lands whenever it lands.
    timers.set(
      field,
      setTimeout(async () => {
        pending.value = new Set(pending.value).add(field)
        const snapshot = clone(values)
        try {
          for (const check of checks) {
            const message = await check.run(snapshot)
            // The value moved on while we were waiting — this answer is about
            // a value nobody is looking at any more.
            if (JSON.stringify(snapshot) !== JSON.stringify(values)) return
            asyncErrors.value = { ...asyncErrors.value, [field]: message ?? undefined }
            if (message) break
          }
          refresh()
        } finally {
          const next = new Set(pending.value)
          next.delete(field)
          pending.value = next
        }
      }, ASYNC_VALIDATE_MS),
    )
  }

  function errorFor(field: keyof T & string): string {
    // The whole timing rule, in one expression: a field that has not been left
    // and a form that has not been submitted have nothing to say.
    if (!submitted.value && !touched.value.has(field)) return ''
    return errors.value[field] ?? ''
  }

  function blur(field: keyof T & string) {
    touched.value = new Set(touched.value).add(field)
    refresh()
    scheduleAsync(field)
  }

  function change(field: keyof T & string) {
    // Only after the field has been left once. Validating on the first
    // keystroke tells somebody their half-typed email is invalid, which they
    // knew.
    if (touched.value.has(field) || submitted.value) refresh()
    if (touched.value.has(field)) scheduleAsync(field)
  }

  function validate(): boolean {
    refresh()
    invalidCount.value = Object.keys(errors.value).filter(
      (k) => errors.value[k as keyof T & string],
    ).length
    return invalidCount.value === 0
  }

  async function submit(): Promise<boolean> {
    submitted.value = true
    formError.value = ''
    if (!validate()) {
      focusFirstInvalid()
      return false
    }
    submitting.value = true
    try {
      await options.onSubmit(clone(values))
      return true
    } catch (error) {
      // A server rejection is a form-level error. It goes in an Alert above the
      // actions rather than a toast: a toast about why a save failed disappears
      // while the reader is still looking at the form trying to work it out.
      formError.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      submitting.value = false
    }
  }

  // Focus *and* scroll: on a long form the first bad field is often above the
  // fold, and focus alone moves the caret somewhere nobody can see.
  function focusFirstInvalid() {
    if (typeof document === 'undefined') return
    for (const key of Object.keys(errors.value)) {
      if (!errors.value[key as keyof T & string]) continue
      const el = document.querySelector<HTMLElement>(`[data-field="${key}"]`)
      const focusable =
        el?.matches('input, textarea, select, button') === true
          ? el
          : el?.querySelector<HTMLElement>('input, textarea, select, button')
      if (focusable) {
        focusable.focus()
        focusable.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
    }
  }

  function reset(next?: Partial<T>) {
    Object.assign(values, clone(options.initial), next ?? {})
    errors.value = {}
    asyncErrors.value = {}
    touched.value = new Set()
    submitted.value = false
    formError.value = ''
    invalidCount.value = 0
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
  }

  return {
    values,
    errors,
    touched,
    submitting,
    submitted,
    formError,
    dirty,
    pending,
    invalidCount,
    errorFor,
    blur,
    change,
    validate,
    submit,
    reset,
  }
}
