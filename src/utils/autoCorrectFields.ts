// Typo and sentence correction for every text field in the app, installed once
// from main.ts. It listens at the window, so a raw <input>, an AutoTextarea row
// editor and the TextInput/TextArea components all get it without a call site
// knowing.
//
// What it does:
// - after a pause in typing (or when the field loses focus) the text is sent to
//   `correctTypos` and the fix is written back into the field;
// - Enter, and a click on a button, wait briefly for the check (MAX_WAIT_MS)
//   before they go through, so what gets submitted is the corrected text —
//   but never when the AI has just been slow or unreachable, and a second
//   Enter during the wait goes through at once;
// - the progress ("Correcting…", what changed, Undo) is published on
//   `autoCorrectState`, which AutoCorrectBadge draws next to the field.
//
// What keeps it from fighting the person typing:
// - an answer is used only if the field still holds exactly what was sent;
// - text it has already checked, or produced, is not sent again;
// - the swap goes through the browser's edit command where it can, so Ctrl+Z
//   puts the original back, and it fires `input`, which is what v-model reads.
//
// A field opts out with `data-autocorrect="off"` on it or on an ancestor, or
// with `spellcheck="false"`. Only plain text inputs and textareas take part:
// never password, email, url, number, search, tel, or a combobox.

import { reactive } from 'vue'
import { correctTypos, isCorrectable } from '@/utils/autoCorrect'

const PAUSE_MS = 1200
// How long Enter or a button click is held for the check. Short on purpose:
// a held Enter that does nothing for seconds reads as a broken Enter.
const MAX_WAIT_MS = 1000
// A check slower than this (or one that failed) means the AI is slow or
// unreachable right now; for SLOW_FOR_MS after, Enter and clicks are not held.
const SLOW_MS = 1500
const SLOW_FOR_MS = 60_000
let slowUntil = 0
const aiIsSlow = () => Date.now() < slowUntil
const markSlow = () => (slowUntil = Date.now() + SLOW_FOR_MS)
const DONE_SHOW_MS = 4500
const CLEAN_SHOW_MS = 1200

type Field = HTMLInputElement | HTMLTextAreaElement

export interface WordChange {
  from: string
  to: string
}

/** What AutoCorrectBadge shows. One field at a time — the one being worked on. */
export const autoCorrectState = reactive({
  el: null as Field | null,
  phase: 'idle' as 'idle' | 'checking' | 'fixed' | 'clean',
  changes: [] as WordChange[],
  original: '',
  fixed: '',
})

// Shared across fields: a value checked in one field is not re-sent from another.
const checked = new Set<string>()
function remember(t: string) {
  if (checked.size > 500) checked.clear()
  checked.add(t)
}

interface FieldState {
  timer?: ReturnType<typeof setTimeout>
  abort?: AbortController
  /** The check in flight, and the value it was sent with. */
  pending?: Promise<void>
  sent?: string
}
const fields = new WeakMap<Field, FieldState>()
function stateOf(el: Field): FieldState {
  let s = fields.get(el)
  if (!s) fields.set(el, (s = {}))
  return s
}

/** The field the person last typed in — the one a button click may submit. */
let lastField: Field | null = null
/** Set while this module writes into a field, so its own `input` is ignored. */
let applying = false
/** Set while a held-back Enter or click is replayed. */
let replaying = false
let hideTimer: ReturnType<typeof setTimeout> | undefined

const TEXT_TYPES = new Set(['text', ''])

export function isAutoCorrectField(target: EventTarget | null): target is Field {
  let el: Field
  if (target instanceof HTMLTextAreaElement) el = target
  else if (target instanceof HTMLInputElement && TEXT_TYPES.has(target.getAttribute('type') ?? ''))
    el = target
  else return false
  if (el.disabled || el.readOnly) return false
  if (el.getAttribute('spellcheck') === 'false') return false
  if (el.closest('[data-autocorrect="off"]')) return false
  const role = el.getAttribute('role')
  if (role === 'combobox' || role === 'searchbox') return false
  const mode = el.getAttribute('inputmode')
  if (mode && mode !== 'text') return false
  return true
}

/** Whether the field holds text that still needs a check. */
function isDirty(el: Field): boolean {
  return !checked.has(el.value) && isCorrectable(el.value)
}

function show(el: Field, phase: typeof autoCorrectState.phase, ms = 0) {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = undefined
  autoCorrectState.el = el
  autoCorrectState.phase = phase
  if (ms) hideTimer = setTimeout(hide, ms)
}

export function hide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = undefined
  autoCorrectState.phase = 'idle'
  autoCorrectState.el = null
  autoCorrectState.changes = []
}

/** Write `next` into the field so the page's v-model sees it. */
function write(el: Field, next: string) {
  applying = true
  try {
    if (document.activeElement === el) {
      const caret = el.selectionStart ?? el.value.length
      const atEnd = caret >= el.value.length
      el.select()
      // execCommand keeps the edit on the undo stack and fires `input`. Fall
      // back to a plain assignment where it is gone.
      const ok =
        typeof document.execCommand === 'function' && document.execCommand('insertText', false, next)
      if (!ok || el.value !== next) {
        el.value = next
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      const pos = atEnd ? next.length : Math.min(caret, next.length)
      el.setSelectionRange(pos, pos)
    } else {
      el.value = next
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  } finally {
    applying = false
  }
}

/** The words that changed between two versions of a text, for the badge. */
export function wordChanges(before: string, after: string): WordChange[] {
  const a = before.split(/\s+/).filter(Boolean)
  const b = after.split(/\s+/).filter(Boolean)
  if (a.length > 400 || b.length > 400) return []
  // Longest common subsequence over words; whatever is left between two
  // matches is one change.
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: WordChange[] = []
  let i = 0
  let j = 0
  let from: string[] = []
  let to: string[] = []
  const flush = () => {
    if (from.length || to.length) out.push({ from: from.join(' '), to: to.join(' ') })
    from = []
    to = []
  }
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush()
      i++
      j++
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      to.push(b[j++])
    } else {
      from.push(a[i++])
    }
  }
  flush()
  return out
}

/** Run the check now. Resolves once the field holds the corrected text, or it gave up. */
function checkNow(el: Field): Promise<void> {
  const s = stateOf(el)
  if (s.timer) clearTimeout(s.timer)
  s.timer = undefined
  const sent = el.value
  if (s.pending && s.sent === sent) return s.pending
  s.abort?.abort()
  if (!isDirty(el)) return Promise.resolve()
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve()

  const abort = (s.abort = new AbortController())
  show(el, 'checking')
  const run = (async () => {
    const started = Date.now()
    try {
      const fixed = await correctTypos(sent, abort.signal)
      if (Date.now() - started > SLOW_MS) markSlow()
      if (abort.signal.aborted) return
      remember(sent)
      if (!fixed || !el.isConnected || el.value !== sent) {
        if (autoCorrectState.el === el && el.value === sent) show(el, 'clean', CLEAN_SHOW_MS)
        else if (autoCorrectState.el === el) hide()
        return
      }
      remember(fixed)
      write(el, fixed)
      autoCorrectState.original = sent
      autoCorrectState.fixed = fixed
      autoCorrectState.changes = wordChanges(sent, fixed)
      show(el, 'fixed', DONE_SHOW_MS)
    } catch {
      // Aborted or offline — the text stays as typed.
      if (!abort.signal.aborted) markSlow()
      if (!abort.signal.aborted && autoCorrectState.el === el) hide()
    } finally {
      if (s.abort === abort) {
        s.abort = undefined
        s.pending = undefined
        s.sent = undefined
      }
    }
  })()
  s.pending = run
  s.sent = sent
  return run
}

/** Wait for the field's check, but never longer than MAX_WAIT_MS. */
function settle(el: Field): Promise<void> {
  let timedOut = false
  return Promise.race([
    checkNow(el),
    new Promise<void>((r) =>
      setTimeout(() => {
        timedOut = true
        r()
      }, MAX_WAIT_MS),
    ),
  ]).then(() => {
    if (timedOut) markSlow()
  })
}

// Fields whose Enter or click is being held right now. Pressing again while
// held means "go now": that press passes straight through.
const holding = new WeakSet<Field>()
/** Whether to hold this Enter / click for a typo check. */
function shouldHold(el: Field): boolean {
  if (holding.has(el)) return false
  return isDirty(el) && !aiIsSlow()
}

/** Put back what was typed before the last correction. */
export function undoCorrection() {
  const el = autoCorrectState.el
  if (!el || autoCorrectState.phase !== 'fixed') return
  if (el.value === autoCorrectState.fixed) {
    remember(autoCorrectState.original)
    write(el, autoCorrectState.original)
  }
  hide()
  el.focus()
}

function onInput(event: Event) {
  if (applying || replaying) return
  const el = event.target
  if (!isAutoCorrectField(el)) return
  lastField = el
  const s = stateOf(el)
  s.abort?.abort()
  if (s.timer) clearTimeout(s.timer)
  if (autoCorrectState.el === el) hide()
  s.timer = setTimeout(() => void checkNow(el), PAUSE_MS)
}

function onBlur(event: FocusEvent) {
  const el = event.target
  if (!isAutoCorrectField(el) || !isDirty(el)) return
  void checkNow(el)
}

function onKeydown(event: KeyboardEvent) {
  if (replaying || event.key !== 'Enter' || event.isComposing) return
  const el = event.target
  if (!isAutoCorrectField(el)) return
  // In a form's multi-line field a plain Enter is a newline, not a submit.
  if (el instanceof HTMLTextAreaElement && event.shiftKey) return
  const plainEnter = !event.ctrlKey && !event.metaKey && !event.altKey
  if (el.classList.contains('ui-ta__input') && plainEnter) return
  if (holding.has(el)) {
    // A second press while held: let this one through now, and drop the
    // held one so the item is not added twice.
    holding.delete(el)
    return
  }
  if (!shouldHold(el)) return

  holding.add(el)
  event.preventDefault()
  event.stopImmediatePropagation()
  const init: KeyboardEventInit = {
    key: event.key,
    code: event.code,
    keyCode: 13,
    which: 13,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    bubbles: true,
    cancelable: true,
  } as KeyboardEventInit
  void settle(el).then(() => {
    // Released by a second press in the meantime, which already went through.
    if (!holding.has(el)) return
    holding.delete(el)
    if (!el.isConnected) return
    replaying = true
    let handled: boolean
    try {
      handled = !el.dispatchEvent(new KeyboardEvent('keydown', init))
    } finally {
      replaying = false
    }
    if (handled) return
    // Nobody took the Enter: do what the browser would have done.
    if (el instanceof HTMLInputElement) el.form?.requestSubmit()
    else if (plainEnter) document.execCommand('insertText', false, '\n')
  })
}

// Buttons that throw the text away gain nothing from waiting for a fix.
const SKIP_BUTTON = /\b(cancel|close|discard|delete|remove|clear|back|undo|dismiss)\b/i

function onClick(event: MouseEvent) {
  if (replaying) return
  const field = lastField
  if (!field || !field.isConnected || !isAutoCorrectField(field) || !shouldHold(field)) return
  const target = event.target as Element | null
  const button = target?.closest?.('button, [role="button"], input[type="submit"]') as HTMLElement | null
  if (!button || button.contains(field) || button.closest('[data-autocorrect="off"]')) return
  if ((button as HTMLButtonElement).disabled) return
  const name = `${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`
  if (SKIP_BUTTON.test(name)) return

  event.preventDefault()
  event.stopImmediatePropagation()
  void settle(field).then(() => {
    if (!button.isConnected) return
    replaying = true
    try {
      button.click()
    } finally {
      replaying = false
    }
  })
}

let installed = false
export function installAutoCorrect() {
  if (installed || typeof window === 'undefined') return
  installed = true
  // Capture phase at the window: these run before any handler in the page, so
  // an Enter or a click can be held back until the text is corrected.
  window.addEventListener('input', onInput, true)
  window.addEventListener('blur', onBlur as EventListener, true)
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('click', onClick, true)
}
