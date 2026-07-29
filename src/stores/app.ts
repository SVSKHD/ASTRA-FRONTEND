import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { AUREON_COLLECTION, auth, db, defaultLockMinutes, firebaseEnabled } from '@/firebase'
import { onAuthStateChanged, type User as FbUser } from 'firebase/auth'
import { isThemeSetting, type ThemeSetting } from '@/themes'
import { isFirebaseUserAllowed } from '@/stores/auth'
import { mockGithub } from '@/utils/github'
import { buildShareUrl, copyToClipboard, parseSharedFromLocation } from '@/utils/share'
import { createShare } from '@/utils/shares'
import {
  CalendarAuthError,
  createEvent,
  deleteEvent,
  hasCalendarToken,
  updateEvent,
} from '@/utils/gcal'
import { useAuthStore } from '@/stores/auth'
import { occurrences } from '@/utils/reminders'
import { stampOnDay, ymd } from '@/utils/dayGroups'
import { isBlankNote } from '@/utils/notes'
import {
  DEFAULT_TAGS,
  normalizeTag,
  sameTag,
  sanitizeTags,
  withTag,
  withoutTag,
} from '@/utils/tags'
import { STATUS_CYCLE, isStatus, statusFromDone } from '@/types'
import type {
  ActiveNotif,
  Deadline,
  EditingState,
  Finance,
  GithubCacheEntry,
  Idea,
  ItemDialogState,
  ItemStatus,
  ItemType,
  ListKey,
  Note,
  Stock,
  Priority,
  PullRequest,
  Reminder,
  Repeat,
  RepeatType,
  SecuritySettings,
  SharedView,
  Task,
  Timestamped,
  Toast,
  Todo,
  Trip,
  TripPlace,
  TripStatus,
} from '@/types'

function rel(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'normal' || value === 'high'
}

function emptySecurity(): SecuritySettings {
  return {
    pinHash: '',
    pinSalt: '',
    autoLockEnabled: true,
    lockTimeoutMinutes: defaultLockMinutes,
  }
}

export const useAppStore = defineStore('app', () => {
  const todos = ref<Todo[]>([])
  const tasks = ref<Task[]>([])
  const deadlines = ref<Deadline[]>([])
  const finances = ref<Finance[]>([])
  const notes = ref<Note[]>([])
  const reminders = ref<Reminder[]>([])
  const trips = ref<Trip[]>([])
  const ideas = ref<Idea[]>([])
  const stocks = ref<Stock[]>([])
  // The shared tag vocabulary behind both pickers. Seeded for a new workspace;
  // a hydrate replaces it, and any tag typed anywhere joins it.
  const tags = ref<string[]>(DEFAULT_TAGS.slice())
  const security = ref<SecuritySettings>(emptySecurity())
  // Theme is a per-user preference, so it rides along in the workspace doc and
  // is restored on refresh once the document lands. The ui store reads it.
  const themeSetting = ref<ThemeSetting>('auto')
  const cloudReady = ref(false)
  const cloudError = ref('')
  const syncState = ref<'idle' | 'saving' | 'synced' | 'error'>('idle')

  const editing = ref<EditingState>({ type: null, id: null })
  const draft = ref<Record<string, unknown>>({})
  const toast = ref<Toast | null>(null)
  const burst = ref<number | null>(null)

  // Which item dialog is open. One slot rather than a ref per type: only one
  // dialog is ever on screen, and per-type refs drifted out of sync (opening a
  // reminder used to leave a stale task id behind).
  //
  // `create` edits `dialogDraft` and commits on save; `edit` writes through to
  // the stored item on every keystroke, so its save button only dismisses.
  const itemDialog = ref<ItemDialogState | null>(null)
  const dialogDraft = ref<Record<string, unknown>>({})
  const dialogClosing = ref(false)
  const taskViewId = ref<number | null>(null)
  // The note open in the full-screen reader/editor. It stays up until it is
  // closed, so it is a slot of its own rather than a mode of the drawer. A null
  // id in edit mode is a note that has not been saved yet.
  const noteView = ref<{ id: number | null; mode: 'read' | 'edit' } | null>(null)
  const noteViewClosing = ref(false)

  const githubCache = ref<Record<number, GithubCacheEntry>>({})
  const approvedPRs = ref<Record<string, boolean>>({})
  const draggingId = ref<number | null>(null)
  const draggingTodoId = ref<number | null>(null)

  const activeNotif = ref<ActiveNotif | null>(null)
  const notifPermission = ref<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const sharedView = ref<SharedView | null>(parseSharedFromLocation())
  // The item awaiting a public/private choice in the share dialog.
  const pendingShare = ref<{ type: ItemType; item: { id: number } } | null>(null)
  const shareBusy = ref(false)
  // Set when a calendar call comes back 401 — the access token is ~1h and
  // Firebase issues no browser refresh token, so re-consent is the only fix.
  const calendarNeedsAuth = ref(false)

  let nid = 100
  const id = () => ++nid
  let dragId: number | null = null
  let todoDragId: number | null = null
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  // --- id counter bootstrap: keep above any existing ids ------------------
  function bumpNid() {
    const maxId = Math.max(
      0,
      ...todos.value.map((t) => t.id),
      ...tasks.value.map((t) => t.id),
      ...deadlines.value.map((t) => t.id),
      ...finances.value.map((t) => t.id),
      ...notes.value.map((t) => t.id),
      ...reminders.value.map((t) => t.id),
      ...trips.value.map((t) => t.id),
      ...ideas.value.map((t) => t.id),
      ...stocks.value.map((t) => t.id),
    )
    if (maxId >= nid) nid = maxId + 1
  }

  // ---- Timestamps ---------------------------------------------------------
  // Every create stamps both fields; every mutation bumps updatedAt. Kept in
  // one place so a new action cannot quietly forget to age its item.
  function stamps(): { createdAt: number; updatedAt: number } {
    const ts = Date.now()
    return { createdAt: ts, updatedAt: ts }
  }
  function touched<T>(item: T): T {
    return { ...item, updatedAt: Date.now() }
  }

  // ---- Tags ---------------------------------------------------------------
  // Every path that writes a tag funnels through here, so a tag typed into a
  // row's edit field joins the vocabulary exactly like one created in a picker.
  function registerTag(raw: string): string {
    const tag = normalizeTag(raw)
    if (!tag) return ''
    const next = withTag(tags.value, tag)
    if (next !== tags.value) tags.value = next
    // Reuse the stored spelling so "office" does not shadow "Office".
    return tags.value.find((t) => sameTag(t, tag)) ?? tag
  }
  function addTag(raw: string) {
    return registerTag(raw)
  }
  // Removing a tag from the vocabulary leaves items that use it alone — their
  // tag is still their tag, it is just no longer offered in the pickers.
  function removeTag(raw: string) {
    tags.value = withoutTag(tags.value, raw)
  }

  // ---- Status -------------------------------------------------------------
  // One lifecycle for todos and tasks. `done` is written from `status` here and
  // nowhere else, so the two can never drift apart.
  function withStatus<T extends { status: ItemStatus; done: boolean }>(
    item: T,
    next: ItemStatus,
  ): T {
    return touched({ ...item, status: next, done: next === 'done' })
  }
  function nextStatus(cur: ItemStatus): ItemStatus {
    const i = STATUS_CYCLE.indexOf(cur)
    return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length]
  }
  // The done-burst is a todo-only flourish; fire it whenever a todo lands on
  // done, whichever control moved it there.
  function fireBurst(tid: number) {
    burst.value = tid
    setTimeout(() => {
      if (burst.value === tid) burst.value = null
    }, 650)
  }

  // ---- Todos --------------------------------------------------------------
  function addTodo(text: string, tag = '', description = '') {
    const t = text.trim()
    if (!t) return
    todos.value = [
      ...todos.value,
      {
        id: id(),
        text: t,
        done: false,
        status: 'pending',
        tag: registerTag(tag),
        description: description.trim(),
        ...stamps(),
      },
    ]
  }
  function updateTodo(tid: number, fields: Partial<Todo>) {
    const next =
      'tag' in fields ? { ...fields, tag: registerTag(String(fields.tag ?? '')) } : fields
    todos.value = todos.value.map((t) => (t.id === tid ? touched({ ...t, ...next }) : t))
  }
  function setTodoStatus(tid: number, next: ItemStatus) {
    const cur = todos.value.find((t) => t.id === tid)
    if (!cur || cur.status === next) return
    todos.value = todos.value.map((t) => (t.id === tid ? withStatus(t, next) : t))
    if (next === 'done') fireBurst(tid)
  }
  function cycleTodoStatus(tid: number) {
    const cur = todos.value.find((t) => t.id === tid)
    if (cur) setTodoStatus(tid, nextStatus(cur.status))
  }
  function toggleTodo(tid: number) {
    const cur = todos.value.find((t) => t.id === tid)
    if (cur) setTodoStatus(tid, cur.done ? 'pending' : 'done')
  }

  // ---- Tasks --------------------------------------------------------------
  function addTask(title: string, tag: string, fields: Partial<Task> = {}) {
    const t = title.trim()
    if (!t) return
    tasks.value = [
      ...tasks.value,
      {
        id: id(),
        title: t,
        tag: registerTag(tag),
        done: false,
        status: 'pending',
        deadline: '',
        notes: '',
        repo: '',
        ...fields,
        ...stamps(),
      },
    ]
  }
  function setTaskStatus(tid: number, next: ItemStatus) {
    tasks.value = tasks.value.map((t) => (t.id === tid ? withStatus(t, next) : t))
  }
  function cycleTaskStatus(tid: number) {
    const cur = tasks.value.find((t) => t.id === tid)
    if (cur) setTaskStatus(tid, nextStatus(cur.status))
  }
  function toggleTask(tid: number) {
    const cur = tasks.value.find((t) => t.id === tid)
    if (cur) setTaskStatus(tid, cur.done ? 'pending' : 'done')
  }
  function updateTask(tid: number, field: keyof Task, value: string) {
    const v = field === 'tag' ? registerTag(value) : value
    tasks.value = tasks.value.map((t) => (t.id === tid ? touched({ ...t, [field]: v }) : t))
  }

  // ---- Deadlines ----------------------------------------------------------
  function addDeadline(title: string, due: string) {
    const t = title.trim()
    if (!t || !due) return
    deadlines.value = [...deadlines.value, { id: id(), title: t, due, ...stamps() }]
  }
  function updateDeadline(did: number, fields: Partial<Deadline>) {
    deadlines.value = deadlines.value.map((d) => (d.id === did ? touched({ ...d, ...fields }) : d))
  }

  // ---- Finances -----------------------------------------------------------
  function addFinance(amountStr: string, category: string, note: string, date = rel(0)) {
    const a = parseFloat(amountStr)
    if (!a || a <= 0) return
    finances.value = [
      ...finances.value,
      { id: id(), amount: a, category, note: note.trim(), date: date || rel(0), ...stamps() },
    ]
  }
  function updateFinance(fid: number, fields: Partial<Finance>) {
    finances.value = finances.value.map((f) => (f.id === fid ? touched({ ...f, ...fields }) : f))
  }

  // ---- Trips --------------------------------------------------------------
  // A trip is a titled plan with an ordered list of places (each with its own
  // map pin, visited date/time, notes and photos). Create takes the essentials;
  // places, photos and the map are filled in from the detail dialog afterwards.
  function addTrip(fields: {
    title: string
    date?: string
    status?: TripStatus
    description?: string
    tag?: string
  }): number | undefined {
    const title = fields.title.trim()
    if (!title) return undefined
    const newId = id()
    trips.value = [
      ...trips.value,
      {
        id: newId,
        title,
        status: fields.status ?? 'tovisit',
        date: fields.date || rel(0),
        visitedDate: '',
        description: (fields.description ?? '').trim(),
        tag: registerTag(fields.tag ?? ''),
        photos: [],
        places: [],
        noteIds: [],
        // Legacy mirror so old share/render paths still find a location string.
        location: title,
        ...stamps(),
      },
    ]
    return newId
  }
  function updateTrip(tid: number, fields: Partial<Trip>) {
    const next =
      'tag' in fields ? { ...fields, tag: registerTag(String(fields.tag ?? '')) } : fields
    trips.value = trips.value.map((t) => (t.id === tid ? touched({ ...t, ...next }) : t))
  }
  function tripById(tid: number): Trip | undefined {
    return trips.value.find((t) => t.id === tid)
  }
  function blankPlace(): TripPlace {
    return {
      id: id(),
      name: '',
      address: '',
      lat: null,
      lng: null,
      visitedAt: '',
      notes: '',
      photos: [],
    }
  }
  function addTripPlace(tid: number, place?: Partial<TripPlace>): number | undefined {
    const trip = tripById(tid)
    if (!trip) return undefined
    const created = { ...blankPlace(), ...place }
    updateTrip(tid, { places: [...trip.places, created] })
    return created.id
  }
  function updateTripPlace(tid: number, placeId: number, fields: Partial<TripPlace>) {
    const trip = tripById(tid)
    if (!trip) return
    updateTrip(tid, {
      places: trip.places.map((p) => (p.id === placeId ? { ...p, ...fields } : p)),
    })
  }
  function removeTripPlace(tid: number, placeId: number) {
    const trip = tripById(tid)
    if (!trip) return
    updateTrip(tid, { places: trip.places.filter((p) => p.id !== placeId) })
  }
  // Reorder places to an explicit id order — drag-to-reorder in the dialog.
  function reorderTripPlaces(tid: number, orderedIds: number[]) {
    const trip = tripById(tid)
    if (!trip) return
    const byId = new Map(trip.places.map((p) => [p.id, p]))
    const next = orderedIds.map((pid) => byId.get(pid)).filter((p): p is TripPlace => !!p)
    // Keep any place the caller forgot to mention, appended in its old order.
    for (const p of trip.places) if (!orderedIds.includes(p.id)) next.push(p)
    updateTrip(tid, { places: next })
  }
  // One-tap To Visit -> Done, recording when it happened.
  function moveTripToDone(tid: number, visitedDate: string) {
    updateTrip(tid, { status: 'done', visitedDate: visitedDate || rel(0) })
  }
  function moveTripToVisit(tid: number) {
    updateTrip(tid, { status: 'tovisit' })
  }

  // ---- Ideas --------------------------------------------------------------
  function addIdea(title: string, tag: string, fields: Partial<Idea> = {}) {
    const t = title.trim()
    if (!t) return
    ideas.value = [
      ...ideas.value,
      {
        id: id(),
        title: t,
        description: '',
        deadline: '',
        ideaType: 'feature',
        tag: registerTag(tag),
        noteIds: [],
        ...fields,
        ...stamps(),
      },
    ]
  }
  function updateIdea(iid: number, fields: Partial<Idea>) {
    const next =
      'tag' in fields ? { ...fields, tag: registerTag(String(fields.tag ?? '')) } : fields
    ideas.value = ideas.value.map((i) => (i.id === iid ? touched({ ...i, ...next }) : i))
  }

  // ---- Stocks -------------------------------------------------------------
  function addStock(symbol: string, tag: string, fields: Partial<Stock> = {}) {
    const s = symbol.trim().toUpperCase()
    if (!s) return
    stocks.value = [
      ...stocks.value,
      {
        id: id(),
        symbol: s,
        name: '',
        why: '',
        targetPrice: 0,
        watchPrice: 0,
        tag: registerTag(tag),
        noteIds: [],
        ...fields,
        ...stamps(),
      },
    ]
  }
  function updateStock(sid: number, fields: Partial<Stock>) {
    const next =
      'tag' in fields ? { ...fields, tag: registerTag(String(fields.tag ?? '')) } : fields
    stocks.value = stocks.value.map((st) => (st.id === sid ? touched({ ...st, ...next }) : st))
  }

  // ---- Note attachment (ideas + stocks) -----------------------------------
  // Notes are referenced by id, never copied. One note can hang off many items;
  // detaching only drops the reference, the note itself lives on in the drawer.
  function currentNoteIds(type: ItemType, itemId: number): number[] {
    const list = type === 'idea' ? ideas.value : type === 'trip' ? trips.value : stocks.value
    const found = list.find((i) => i.id === itemId)
    return found ? ((found as { noteIds?: number[] }).noteIds?.slice() ?? []) : []
  }
  function writeNoteIds(type: 'idea' | 'stock' | 'trip', itemId: number, noteIds: number[]) {
    if (type === 'idea') updateIdea(itemId, { noteIds })
    else if (type === 'trip') updateTrip(itemId, { noteIds })
    else updateStock(itemId, { noteIds })
  }
  function attachNote(type: 'idea' | 'stock' | 'trip', itemId: number, noteId: number) {
    const ids = currentNoteIds(type, itemId)
    if (ids.includes(noteId)) return
    writeNoteIds(type, itemId, [...ids, noteId])
  }
  function detachNote(type: 'idea' | 'stock' | 'trip', itemId: number, noteId: number) {
    writeNoteIds(
      type,
      itemId,
      currentNoteIds(type, itemId).filter((n) => n !== noteId),
    )
  }

  // ---- Editing / drafts ---------------------------------------------------
  function startEdit<T extends { id: number | null }>(type: ItemType, item: T) {
    editing.value = { type, id: item.id }
    draft.value = { ...item } as Record<string, unknown>
  }
  // ---- Notes: the full-screen reader / rich-text editor -------------------
  // Every note now opens in its own dialog — reading it, then editing it in
  // place — instead of the drawer swapping itself out for an editor. The drawer
  // is the index; this is the document.
  const openNote = computed<Note | null>(() => {
    const v = noteView.value
    if (!v || v.id == null) return null
    return notes.value.find((n) => n.id === v.id) ?? null
  })

  function newNote() {
    noteView.value = { id: null, mode: 'edit' }
    noteViewClosing.value = false
    draft.value = { text: '' }
  }
  function openNoteView(noteId: number) {
    noteView.value = { id: noteId, mode: 'read' }
    noteViewClosing.value = false
  }
  function editNoteView(noteId?: number) {
    const target = noteId ?? noteView.value?.id ?? null
    noteView.value = { id: target, mode: 'edit' }
    noteViewClosing.value = false
    draft.value = { text: target == null ? '' : (openNote.value?.text ?? '') }
  }
  // Commit the editor's HTML. A note whose markup carries no text at all is
  // dropped rather than saved — an empty <div> would be an unreadable row.
  function saveNoteView(html: string) {
    const v = noteView.value
    if (!v) return
    const text = html
    if (isBlankNote(text)) {
      if (v.id == null) return closeNoteView()
      deleteWithUndo('notes', 'note', v.id)
      return closeNoteView()
    }
    if (v.id == null) {
      const newId = id()
      notes.value = [...notes.value, { id: newId, text, ts: Date.now(), ...stamps() }]
      noteView.value = { id: newId, mode: 'read' }
    } else {
      const target = v.id
      notes.value = notes.value.map((n) => (n.id === target ? touched({ ...n, text }) : n))
      noteView.value = { id: target, mode: 'read' }
    }
    draft.value = {}
  }
  function closeNoteView() {
    if (!noteView.value) return
    noteViewClosing.value = true
    setTimeout(() => {
      noteView.value = null
      noteViewClosing.value = false
      draft.value = {}
    }, 220)
  }
  // A checkbox ticked in the reader writes straight back, so the note is the
  // checklist rather than a picture of one.
  function setNoteText(noteId: number, html: string) {
    notes.value = notes.value.map((n) => (n.id === noteId ? touched({ ...n, text: html }) : n))
  }
  // Autosave while editing: persist the draft in place without leaving edit
  // mode. A new note is created on its first non-blank keystroke and the view
  // rebinds to it, so subsequent autosaves update rather than duplicate. Blank
  // markup is ignored — an empty note is not worth a row until it has content.
  function autosaveNoteDraft(html: string) {
    const v = noteView.value
    if (!v || v.mode !== 'edit') return
    if (isBlankNote(html)) return
    if (v.id == null) {
      const newId = id()
      notes.value = [...notes.value, { id: newId, text: html, ts: Date.now(), ...stamps() }]
      noteView.value = { id: newId, mode: 'edit' }
    } else {
      const target = v.id
      notes.value = notes.value.map((n) => (n.id === target ? touched({ ...n, text: html }) : n))
    }
  }
  function cancelEdit() {
    editing.value = { type: null, id: null }
    draft.value = {}
  }
  function setDraft(field: string, value: unknown) {
    draft.value = { ...draft.value, [field]: value }
  }
  // Notes are the only inline-edited item left — every other type creates and
  // updates through its own dialog, so those branches went with the inline rows.
  function saveEdit() {
    const { type, id: eid } = editing.value
    const d = draft.value
    if (type === 'note') {
      if (eid == null) {
        notes.value = [
          ...notes.value,
          { id: id(), text: (d.text as string) || '', ts: Date.now(), ...stamps() },
        ]
      } else {
        notes.value = notes.value.map((t) =>
          t.id === eid ? touched({ ...t, text: d.text as string }) : t,
        )
      }
    }
    editing.value = { type: null, id: null }
    draft.value = {}
  }

  // ---- Delete + undo ------------------------------------------------------
  const LIST_MAP: Record<ListKey, () => { get: () => unknown[]; set: (v: unknown[]) => void }> = {
    todos: () => ({ get: () => todos.value, set: (v) => (todos.value = v as Todo[]) }),
    tasks: () => ({ get: () => tasks.value, set: (v) => (tasks.value = v as Task[]) }),
    deadlines: () => ({
      get: () => deadlines.value,
      set: (v) => (deadlines.value = v as Deadline[]),
    }),
    finances: () => ({ get: () => finances.value, set: (v) => (finances.value = v as Finance[]) }),
    notes: () => ({ get: () => notes.value, set: (v) => (notes.value = v as Note[]) }),
    reminders: () => ({
      get: () => reminders.value,
      set: (v) => (reminders.value = v as Reminder[]),
    }),
    trips: () => ({ get: () => trips.value, set: (v) => (trips.value = v as Trip[]) }),
    ideas: () => ({ get: () => ideas.value, set: (v) => (ideas.value = v as Idea[]) }),
    stocks: () => ({ get: () => stocks.value, set: (v) => (stocks.value = v as Stock[]) }),
  }

  function deleteWithUndo(listKey: ListKey, type: ItemType, itemId: number) {
    const accessor = LIST_MAP[listKey]()
    const list = accessor.get() as { id: number; [k: string]: unknown }[]
    const idx = list.findIndex((x) => x.id === itemId)
    if (idx < 0) return
    const item = list[idx]
    const label =
      type === 'todo'
        ? (item.text as string)
        : type === 'task'
          ? (item.title as string)
          : type === 'deadline'
            ? (item.title as string)
            : type === 'finance'
              ? (item.note as string) || (item.category as string)
              : type === 'reminder'
                ? (item.title as string)
                : type === 'trip'
                  ? (item.title as string) || (item.location as string)
                  : type === 'idea'
                    ? (item.title as string)
                    : type === 'stock'
                      ? (item.symbol as string)
                      : (item.text as string)
    const short = label && label.length > 28 ? label.slice(0, 28) + '…' : label
    accessor.set(list.filter((x) => x.id !== itemId))
    // Deleting a reminder must also remove its Google Calendar event, otherwise
    // the event outlives the reminder with nothing left pointing at it. Undo
    // re-creates the event and stores the new id (Google does not resurrect the
    // old one), which is why the id is cleared from the retained copy.
    if (type === 'reminder') {
      const eventId = (item as unknown as Reminder).calEventId
      if (eventId) {
        void deleteEvent(eventId).catch((error) => {
          if (error instanceof CalendarAuthError) calendarNeedsAuth.value = true
          console.error('[Aureon] Calendar delete on reminder delete failed:', error)
        })
      }
    }
    toast.value = { message: 'Deleted "' + short + '"', undo: true, listKey, item, idx }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (toast.value) toast.value = null
    }, 5000)
  }
  function undoDelete() {
    const t = toast.value
    if (!t || t.listKey == null || t.item == null || t.idx == null) return
    const accessor = LIST_MAP[t.listKey]()
    const list = [...accessor.get()]
    // The calendar event was already deleted; Google will not restore it under
    // the old id, so the restored reminder starts unsynced and re-creates the
    // event, picking up a fresh id.
    const wasSynced = t.listKey === 'reminders' && !!(t.item as Reminder).calEventId
    const restored = wasSynced
      ? { ...(t.item as Reminder), calEventId: null, calSync: 'local' as const }
      : t.item
    list.splice(Math.min(t.idx, list.length), 0, restored)
    accessor.set(list)
    toast.value = null
    clearTimeout(toastTimer)
    if (wasSynced) void syncCalendar((restored as Reminder).id)
  }
  function showToastMsg(message: string) {
    toast.value = { message, undo: false }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (toast.value) toast.value = null
    }, 3000)
  }
  function closeToast() {
    clearTimeout(toastTimer)
    toast.value = null
  }

  // ---- Sharing ------------------------------------------------------------
  // share() only opens the chooser; the document is written by createShareLink
  // once the visibility is picked. Keeping the entry point synchronous means
  // every ↗ button in the views stays a plain `app.share(type, item)` call.
  function share(type: ItemType, item: { id: number }) {
    if (!uid) {
      showToastMsg('Sign in to share')
      return
    }
    pendingShare.value = { type, item }
  }
  function cancelShare() {
    pendingShare.value = null
    shareBusy.value = false
  }
  // Writes a frozen snapshot and copies its page URL. `isPublic` is what the
  // Firestore rule on aureon-shares reads — visibility is enforced there, not
  // here, so a private link cannot be opened by guessing the URL.
  async function createShareLink(isPublic: boolean) {
    const pending = pendingShare.value
    if (!pending || !uid || shareBusy.value) return
    shareBusy.value = true
    try {
      const shareId = await createShare(uid, pending.type, pending.item, isPublic)
      if (!shareId) {
        showToastMsg('Sharing needs Firebase configured')
        return
      }
      await copyToClipboard(buildShareUrl(pending.type, shareId))
      showToastMsg(isPublic ? 'Public link copied' : 'Private link copied')
    } catch (error) {
      console.error('[Aureon] Share failed:', error)
      showToastMsg('Could not create the share link')
    } finally {
      shareBusy.value = false
      pendingShare.value = null
    }
  }
  function dismissShared() {
    sharedView.value = null
    try {
      history.replaceState(null, '', '/')
    } catch {
      /* ignore */
    }
  }
  function addSharedItem() {
    const sv = sharedView.value
    if (!sv || !sv.type) return
    const it = sv.item || {}
    const nidNew = id()
    if (sv.type === 'todo')
      todos.value = [
        ...todos.value,
        {
          id: nidNew,
          text: (it.text as string) || 'Shared todo',
          done: false,
          status: 'pending',
          tag: (it.tag as string) || '',
          description: (it.description as string) || '',
          ...stamps(),
        },
      ]
    else if (sv.type === 'task')
      tasks.value = [
        ...tasks.value,
        {
          id: nidNew,
          title: (it.title as string) || 'Shared task',
          tag: (it.tag as string) || '',
          done: false,
          status: 'pending',
          deadline: (it.deadline as string) || '',
          notes: (it.notes as string) || '',
          repo: (it.repo as string) || '',
          ...stamps(),
        },
      ]
    else if (sv.type === 'deadline')
      deadlines.value = [
        ...deadlines.value,
        {
          id: nidNew,
          title: (it.title as string) || 'Shared deadline',
          due: (it.due as string) || rel(3),
          ...stamps(),
        },
      ]
    else if (sv.type === 'finance')
      finances.value = [
        ...finances.value,
        {
          id: nidNew,
          amount: (it.amount as number) || 0,
          category: (it.category as string) || 'Other',
          note: (it.note as string) || '',
          date: rel(0),
          ...stamps(),
        },
      ]
    else if (sv.type === 'idea')
      ideas.value = [
        ...ideas.value,
        {
          id: nidNew,
          title: (it.title as string) || 'Shared idea',
          description: (it.description as string) || '',
          deadline: (it.deadline as string) || '',
          ideaType: (it.ideaType as string) || 'feature',
          tag: (it.tag as string) || '',
          // A shared snapshot cannot bring the owner's private notes with it.
          noteIds: [],
          ...stamps(),
        },
      ]
    else if (sv.type === 'stock')
      stocks.value = [
        ...stocks.value,
        {
          id: nidNew,
          symbol: (it.symbol as string) || 'SHARED',
          name: (it.name as string) || '',
          why: (it.why as string) || '',
          targetPrice: (it.targetPrice as number) || 0,
          watchPrice: (it.watchPrice as number) || 0,
          tag: (it.tag as string) || '',
          noteIds: [],
          ...stamps(),
        },
      ]
    else if (sv.type === 'note')
      notes.value = [
        ...notes.value,
        { id: nidNew, text: (it.text as string) || '', ts: Date.now(), ...stamps() },
      ]
    else if (sv.type === 'trip') {
      const sharedPlaces = Array.isArray(it.places) ? (it.places as TripPlace[]) : []
      const title = (it.title as string) || (it.location as string) || 'Shared trip'
      trips.value = [
        ...trips.value,
        {
          id: nidNew,
          title,
          status: it.status === 'done' ? 'done' : 'tovisit',
          date: (it.date as string) || rel(0),
          visitedDate: (it.visitedDate as string) || '',
          description: (it.description as string) || '',
          tag: (it.tag as string) || '',
          photos: Array.isArray(it.photos) ? (it.photos as string[]) : [],
          // Give each imported place a fresh id in this workspace's id space.
          places: sharedPlaces.map((p) => ({ ...p, id: id() })),
          // A shared snapshot cannot bring the owner's private notes with it.
          noteIds: [],
          location: (it.location as string) || title,
          ...stamps(),
        },
      ]
    }
    dismissShared()
  }

  // ---- GitHub (mock) ------------------------------------------------------
  function fetchGithub(taskId: number, repo: string) {
    githubCache.value = { ...githubCache.value, [taskId]: { status: 'loading' } }
    setTimeout(
      () => {
        const data = mockGithub(repo)
        githubCache.value = { ...githubCache.value, [taskId]: { status: 'ready', data } }
      },
      800 + Math.random() * 600,
    )
  }
  function attachRepo(taskId: number, repo: string) {
    if (!repo || !repo.trim()) return
    fetchGithub(taskId, repo.trim())
  }
  function approvePR(pr: PullRequest) {
    approvedPRs.value = { ...approvedPRs.value, [pr.id]: true }
    showToastMsg('Approved PR #' + pr.num)
    // GitHub review API: POST /repos/{owner}/{repo}/pulls/{num}/reviews { event: 'APPROVE' }
  }
  function importIssue(
    repo: { name: string; full: string },
    issue: { num: number; title: string },
  ) {
    tasks.value = [
      ...tasks.value,
      {
        id: id(),
        title: issue.title,
        tag: repo.name,
        done: false,
        status: 'pending',
        deadline: '',
        notes: 'Imported from ' + repo.full + ' #' + issue.num,
        repo: repo.full,
        ...stamps(),
      },
    ]
    showToastMsg(
      'Imported "' + (issue.title.length > 24 ? issue.title.slice(0, 24) + '…' : issue.title) + '"',
    )
  }

  // ---- Drag & drop (tasks) ------------------------------------------------
  function setDragId(v: number | null) {
    dragId = v
    draggingId.value = v
  }
  // A task that lands on a different day has been re-planned, so it ages.
  function reday(t: Task, dateStr: string): Task {
    return (t.deadline || '') === dateStr ? t : touched({ ...t, deadline: dateStr })
  }
  function dropOnTask(targetId: number) {
    if (dragId == null || dragId === targetId) {
      draggingId.value = null
      return
    }
    const arr = tasks.value.slice()
    const di = arr.findIndex((t) => t.id === dragId)
    if (di < 0) {
      draggingId.value = null
      dragId = null
      return
    }
    let drag = { ...arr[di] }
    arr.splice(di, 1)
    const ti = arr.findIndex((t) => t.id === targetId)
    if (ti < 0) {
      arr.push(drag)
    } else {
      drag = reday(drag, arr[ti].deadline || '')
      arr.splice(ti, 0, drag)
    }
    tasks.value = arr
    draggingId.value = null
    dragId = null
  }
  function dropOnGroup(dateStr: string) {
    if (dragId == null) {
      draggingId.value = null
      return
    }
    const arr = tasks.value.slice()
    const di = arr.findIndex((t) => t.id === dragId)
    if (di < 0) {
      draggingId.value = null
      dragId = null
      return
    }
    const drag = reday(arr[di], dateStr)
    arr.splice(di, 1)
    let lastIdx = -1
    arr.forEach((t, i) => {
      if ((t.deadline || '') === dateStr) lastIdx = i
    })
    if (lastIdx >= 0) arr.splice(lastIdx + 1, 0, drag)
    else arr.push(drag)
    tasks.value = arr
    draggingId.value = null
    dragId = null
  }

  // ---- Drag & drop (todos) ------------------------------------------------
  // Todos have no deadline: their day *is* their createdAt stamp. Dropping one
  // on another day therefore rewrites that stamp — keeping the time of day —
  // which is what moves the row between the accordion's day cards.
  function setTodoDragId(v: number | null) {
    todoDragId = v
    draggingTodoId.value = v
  }
  function endTodoDrag() {
    draggingTodoId.value = null
    todoDragId = null
  }
  function moveTodoToDay(arr: Todo[], idx: number, dateStr: string): Todo {
    const cur = arr[idx]
    const next = stampOnDay(dateStr, cur.createdAt)
    return next === cur.createdAt ? cur : touched({ ...cur, createdAt: next })
  }
  function dropTodoOnDay(dateStr: string) {
    if (todoDragId == null) return endTodoDrag()
    const arr = todos.value.slice()
    const di = arr.findIndex((t) => t.id === todoDragId)
    if (di < 0) return endTodoDrag()
    const drag = moveTodoToDay(arr, di, dateStr)
    arr.splice(di, 1)
    arr.push(drag)
    todos.value = arr
    endTodoDrag()
  }
  // Dropping onto a row adopts that row's day and slots in above it, so a drag
  // reorders within a day as well as moving between days.
  function dropTodoOnTodo(targetId: number) {
    if (todoDragId == null || todoDragId === targetId) return endTodoDrag()
    const arr = todos.value.slice()
    const di = arr.findIndex((t) => t.id === todoDragId)
    const target = arr.find((t) => t.id === targetId)
    if (di < 0 || !target) return endTodoDrag()
    const drag = moveTodoToDay(arr, di, target.createdAt > 0 ? ymd(new Date(target.createdAt)) : '')
    arr.splice(di, 1)
    const ti = arr.findIndex((t) => t.id === targetId)
    if (ti < 0) arr.push(drag)
    else arr.splice(ti, 0, drag)
    todos.value = arr
    endTodoDrag()
  }

  // ---- Dialogs / task view ------------------------------------------------
  // Fields a create form starts from. Dates default to today so the common case
  // is one field away from valid.
  function blankDraft(type: ItemType): Record<string, unknown> {
    if (type === 'todo') return { text: '', description: '', tag: '' }
    if (type === 'task') return { title: '', tag: '', deadline: '', notes: '', repo: '' }
    if (type === 'deadline') return { title: '', due: rel(0) }
    if (type === 'finance') return { amount: '', category: 'Food', note: '', date: rel(0) }
    if (type === 'trip')
      return { title: '', date: rel(0), description: '', tag: '', status: 'tovisit' }
    if (type === 'idea')
      return { title: '', description: '', deadline: '', ideaType: 'feature', tag: '', noteIds: [] }
    if (type === 'stock')
      return {
        symbol: '',
        name: '',
        why: '',
        targetPrice: '',
        watchPrice: '',
        tag: '',
        noteIds: [],
      }
    if (type === 'reminder')
      return {
        title: '',
        note: '',
        start: '',
        repeatType: 'none',
        repeatN: 1,
        weekdays: [],
        priority: 'normal',
        addToCalendar: false,
      }
    return {}
  }
  // The task and reminder dialogs predate the generic one and address it by
  // type-specific name. They are views onto the same single dialog slot rather
  // than state of their own, so only one dialog can ever be open.
  const dialogTaskId = computed(() =>
    itemDialog.value?.type === 'task' && itemDialog.value.mode === 'edit'
      ? itemDialog.value.id
      : null,
  )
  const dialogReminderId = computed(() =>
    itemDialog.value?.type === 'reminder' && itemDialog.value.mode === 'edit'
      ? itemDialog.value.id
      : null,
  )
  function openCreate(type: ItemType) {
    itemDialog.value = { type, mode: 'create', id: null }
    dialogDraft.value = blankDraft(type)
    dialogClosing.value = false
  }
  function openEdit(type: ItemType, itemId: number) {
    itemDialog.value = { type, mode: 'edit', id: itemId }
    dialogDraft.value = {}
    dialogClosing.value = false
  }
  // Generic read/write for the one dialog that edits every type. Edit mode
  // writes through on each keystroke, so there is no draft to reconcile — these
  // two are all it needs from a type it does not know the shape of.
  function itemById(type: ItemType, itemId: number): Record<string, unknown> | undefined {
    const lists: Partial<Record<ItemType, { id: number }[]>> = {
      todo: todos.value,
      task: tasks.value,
      deadline: deadlines.value,
      finance: finances.value,
      trip: trips.value,
      reminder: reminders.value,
      note: notes.value,
      idea: ideas.value,
      stock: stocks.value,
    }
    return lists[type]?.find((i) => i.id === itemId) as Record<string, unknown> | undefined
  }
  function updateItem(type: ItemType, itemId: number, field: string, value: unknown) {
    if (type === 'todo') updateTodo(itemId, { [field]: value } as Partial<Todo>)
    else if (type === 'task') updateTask(itemId, field as keyof Task, String(value))
    else if (type === 'deadline') updateDeadline(itemId, { [field]: value } as Partial<Deadline>)
    else if (type === 'finance')
      updateFinance(itemId, {
        [field]: field === 'amount' ? Number(value) || 0 : value,
      } as Partial<Finance>)
    else if (type === 'trip') updateTrip(itemId, { [field]: value } as Partial<Trip>)
    else if (type === 'idea') updateIdea(itemId, { [field]: value } as Partial<Idea>)
    else if (type === 'stock')
      updateStock(itemId, {
        [field]: field === 'targetPrice' || field === 'watchPrice' ? Number(value) || 0 : value,
      } as Partial<Stock>)
    else if (type === 'reminder') updateReminder(itemId, field as keyof Reminder, value)
  }

  function openTaskDialog(tid: number) {
    openEdit('task', tid)
  }
  function openReminderDialog(rid: number) {
    openEdit('reminder', rid)
  }
  function closeItemDialog() {
    if (!itemDialog.value) return
    dialogClosing.value = true
    setTimeout(() => {
      itemDialog.value = null
      dialogDraft.value = {}
      dialogClosing.value = false
    }, 220)
  }
  function setDialogDraft(field: string, value: unknown) {
    dialogDraft.value = { ...dialogDraft.value, [field]: value }
  }
  // Commits a create-mode dialog. Returns false and leaves the dialog open when
  // the draft is incomplete, so a mistyped entry is not silently discarded.
  function commitCreate(): boolean {
    const state = itemDialog.value
    if (!state || state.mode !== 'create') return false
    const d = dialogDraft.value
    const str = (k: string) => String(d[k] ?? '').trim()
    const fail = (msg: string) => {
      showToastMsg(msg)
      return false
    }

    if (state.type === 'todo') {
      if (!str('text')) return fail('Give the todo a title')
      addTodo(str('text'), str('tag'), str('description'))
    } else if (state.type === 'task') {
      if (!str('title')) return fail('Give the task a title')
      addTask(str('title'), str('tag'), {
        deadline: str('deadline'),
        notes: str('notes'),
        repo: str('repo'),
      })
    } else if (state.type === 'deadline') {
      if (!str('title')) return fail('Give the deadline a title')
      if (!str('due')) return fail('Pick a due date')
      addDeadline(str('title'), str('due'))
    } else if (state.type === 'finance') {
      const amount = parseFloat(str('amount'))
      if (!amount || amount <= 0) return fail('Enter an amount above zero')
      addFinance(str('amount'), str('category') || 'Other', str('note'), str('date'))
    } else if (state.type === 'trip') {
      if (!str('title')) return fail('Give the trip a name')
      const newId = addTrip({
        title: str('title'),
        date: str('date'),
        description: str('description'),
        tag: str('tag'),
        status: (str('status') || 'tovisit') as TripStatus,
      })
      // Switch straight to the fresh trip's detail dialog so places and the map
      // can be added at once. openEdit resets the shared dialog slot in place —
      // no closeItemDialog first, whose timer would later null the new dialog.
      if (newId != null) openEdit('trip', newId)
      else closeItemDialog()
      return true
    } else if (state.type === 'idea') {
      if (!str('title')) return fail('Give the idea a title')
      addIdea(str('title'), str('tag'), {
        description: str('description'),
        deadline: str('deadline'),
        ideaType: str('ideaType') || 'feature',
        noteIds: Array.isArray(d.noteIds) ? (d.noteIds as number[]) : [],
      })
    } else if (state.type === 'stock') {
      if (!str('symbol')) return fail('Give the stock a symbol')
      addStock(str('symbol'), str('tag'), {
        name: str('name'),
        why: str('why'),
        targetPrice: parseFloat(str('targetPrice')) || 0,
        watchPrice: parseFloat(str('watchPrice')) || 0,
        noteIds: Array.isArray(d.noteIds) ? (d.noteIds as number[]) : [],
      })
    } else if (state.type === 'reminder') {
      if (!str('title')) return fail('Give the reminder a title')
      if (!str('start')) return fail('Pick a start date and time')
      const repeatType = (str('repeatType') || 'none') as RepeatType
      const repeat: Repeat =
        repeatType === 'weekdays'
          ? { type: 'weekdays', weekdays: ((d.weekdays as number[]) || []).slice() }
          : { type: repeatType, n: Number(d.repeatN) || 1 }
      if (repeat.type === 'weekdays' && !(repeat.weekdays || []).length)
        return fail('Pick at least one weekday')
      addReminder({
        title: str('title'),
        note: str('note'),
        start: str('start'),
        repeat,
        priority: (str('priority') || 'normal') as Priority,
        addToCalendar: d.addToCalendar === true,
      })
    } else {
      return false
    }

    closeItemDialog()
    return true
  }
  function openTaskView(tid: number) {
    try {
      history.pushState({ taskView: tid }, '', '/tasks/' + tid + '/view')
    } catch {
      /* ignore */
    }
    taskViewId.value = tid
    itemDialog.value = null
    dialogClosing.value = false
  }
  function closeTaskView() {
    taskViewId.value = null
    try {
      if (history.state && history.state.taskView != null) history.back()
      else history.replaceState(null, '', '/')
    } catch {
      /* ignore */
    }
  }

  // ---- Reminders ----------------------------------------------------------
  function addReminder(payload: {
    title: string
    note: string
    start: string
    repeat: Repeat
    priority?: Priority
    addToCalendar?: boolean
  }) {
    const t = payload.title.trim()
    if (!t || !payload.start) return
    const created: Reminder = {
      id: id(),
      title: t,
      note: payload.note.trim(),
      start: payload.start,
      repeat: payload.repeat,
      priority: payload.priority || 'normal',
      calSync: 'local',
      calEventId: null,
      lastFiredOcc: null,
      ...stamps(),
    }
    reminders.value = [...reminders.value, created]
    requestNotifPermission()
    if (payload.addToCalendar) void syncCalendar(created.id)
    return created.id
  }
  function updateReminder(rid: number, field: keyof Reminder, value: unknown) {
    reminders.value = reminders.value.map((r) =>
      r.id === rid ? touched({ ...r, [field]: value }) : r,
    )
  }
  function toggleWeekday(rid: number, day: number) {
    reminders.value = reminders.value.map((r) => {
      if (r.id !== rid) return r
      const wd = (r.repeat.weekdays || []).slice()
      const i = wd.indexOf(day)
      if (i === -1) wd.push(day)
      else wd.splice(i, 1)
      return { ...r, repeat: { ...r.repeat, weekdays: wd } }
    })
  }
  function patchReminder(rid: number, patch: Partial<Reminder>) {
    reminders.value = reminders.value.map((r) => (r.id === rid ? { ...r, ...patch } : r))
  }

  // Creates the event if the reminder has none, otherwise patches the existing
  // one — so pressing Sync twice does not litter the calendar with duplicates.
  async function syncCalendar(rid: number) {
    const target = reminders.value.find((r) => r.id === rid)
    if (!target) return
    if (!hasCalendarToken()) {
      calendarNeedsAuth.value = true
      patchReminder(rid, { calSync: 'error' })
      showToastMsg('Connect Google Calendar to sync')
      return
    }
    patchReminder(rid, { calSync: 'pending' })
    try {
      if (target.calEventId) {
        await updateEvent(target.calEventId, target)
        patchReminder(rid, { calSync: 'synced' })
      } else {
        const eventId = await createEvent(target)
        patchReminder(rid, { calSync: 'synced', calEventId: eventId })
      }
    } catch (error) {
      patchReminder(rid, { calSync: 'error' })
      if (error instanceof CalendarAuthError) {
        calendarNeedsAuth.value = true
        showToastMsg('Google Calendar access expired')
      } else {
        console.error('[Aureon] Calendar sync failed:', error)
        showToastMsg('Could not sync to Google Calendar')
      }
    }
  }
  async function syncAllCalendar() {
    for (const r of [...reminders.value]) await syncCalendar(r.id)
  }
  // Removes the Google Calendar event and forgets its id, leaving the reminder
  // itself in place.
  async function unsyncCalendar(rid: number) {
    const target = reminders.value.find((r) => r.id === rid)
    if (!target?.calEventId) return
    try {
      await deleteEvent(target.calEventId)
      patchReminder(rid, { calSync: 'local', calEventId: null })
      showToastMsg('Removed from Google Calendar')
    } catch (error) {
      if (error instanceof CalendarAuthError) calendarNeedsAuth.value = true
      console.error('[Aureon] Calendar remove failed:', error)
      showToastMsg('Could not remove the calendar event')
    }
  }
  async function reconnectCalendar(): Promise<boolean> {
    const authStore = useAuthStore()
    const ok = await authStore.reconnectCalendar()
    calendarNeedsAuth.value = !ok
    return ok
  }
  function requestNotifPermission() {
    if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      Notification.requestPermission().then(() => {
        notifPermission.value = Notification.permission
      })
    }
  }
  function fireReminder(r: Reminder) {
    activeNotif.value = { id: r.id, title: r.title, note: r.note }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(r.title, { body: r.note || 'Reminder due' })
      } catch {
        /* ignore */
      }
    }
  }
  function checkReminders() {
    const now = Date.now()
    let fired = false
    const updated = reminders.value.map((r) => {
      const { last } = occurrences(r, now)
      if (last && now - last < 90000 && r.lastFiredOcc !== last) {
        fired = true
        fireReminder(r)
        return { ...r, lastFiredOcc: last }
      }
      return r
    })
    if (fired) reminders.value = updated
  }
  function snoozeNotif(mins: number) {
    const n = activeNotif.value
    if (!n) return
    const when = new Date(Date.now() + mins * 60000).toISOString().slice(0, 16)
    reminders.value = [
      ...reminders.value,
      {
        id: id(),
        title: n.title,
        note: n.note,
        start: when,
        repeat: { type: 'none' },
        priority: 'normal',
        calSync: 'local',
        calEventId: null,
        lastFiredOcc: null,
        ...stamps(),
      },
    ]
    activeNotif.value = null
  }
  function dismissNotif() {
    activeNotif.value = null
  }

  // ---- Firestore persistence ---------------------------------------------
  let uid: string | null = null
  let cloudUnsub: Unsubscribe | null = null
  let hydrating = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function snapshotData() {
    return {
      todos: todos.value,
      tasks: tasks.value,
      deadlines: deadlines.value,
      finances: finances.value,
      notes: notes.value,
      reminders: reminders.value,
      trips: trips.value,
      ideas: ideas.value,
      stocks: stocks.value,
      tags: tags.value,
      security: security.value,
      themeSetting: themeSetting.value,
      approvedPRs: approvedPRs.value,
    }
  }
  function resetData() {
    hydrating = true
    todos.value = []
    tasks.value = []
    deadlines.value = []
    finances.value = []
    notes.value = []
    reminders.value = []
    trips.value = []
    ideas.value = []
    stocks.value = []
    tags.value = DEFAULT_TAGS.slice()
    approvedPRs.value = {}
    security.value = emptySecurity()
    themeSetting.value = 'auto'
    editing.value = { type: null, id: null }
    draft.value = {}
    noteView.value = null
    noteViewClosing.value = false
    nid = 100
    setTimeout(() => {
      hydrating = false
    }, 0)
  }
  function applyData(data: Record<string, unknown>) {
    hydrating = true
    // Items written before timestamps existed carry neither stamp. They are
    // backfilled to 0 rather than Date.now(), so the UI reports them as
    // "Unknown" instead of claiming every legacy item changed at hydrate time.
    const stamped = <T extends Partial<Timestamped>>(list: unknown): T[] =>
      Array.isArray(list)
        ? (list as T[]).map((it) => ({
            ...it,
            createdAt: typeof it.createdAt === 'number' ? it.createdAt : 0,
            updatedAt: typeof it.updatedAt === 'number' ? it.updatedAt : 0,
          }))
        : []

    // Items written before status existed only carry `done`; derive the status
    // from it so nothing loads as an unknown state.
    const statused = <T extends { done?: boolean; status?: ItemStatus }>(it: T): T => ({
      ...it,
      status: isStatus(it.status) ? it.status : statusFromDone(it.done),
      done: isStatus(it.status) ? it.status === 'done' : it.done === true,
    })

    // Todos written before tag/description existed lack those fields; fill them
    // in on read so the rest of the app can treat them as required.
    todos.value = stamped<Todo>(data.todos).map((t) => ({
      ...statused(t),
      tag: typeof t.tag === 'string' ? t.tag : '',
      description: typeof t.description === 'string' ? t.description : '',
    }))
    tasks.value = stamped<Task>(data.tasks).map(statused)
    deadlines.value = stamped<Deadline>(data.deadlines)
    finances.value = stamped<Finance>(data.finances)
    notes.value = stamped<Note>(data.notes)
    // Reminders written before priority/calEventId existed lack those fields;
    // fill them in on read so the rest of the app can treat them as required.
    reminders.value = stamped<Reminder>(data.reminders).map((r) => ({
      ...r,
      priority: isPriority(r.priority) ? r.priority : 'normal',
      calEventId: typeof r.calEventId === 'string' ? r.calEventId : null,
    }))
    // Trips gained a title, status, places, photos and attached notes after the
    // first release; older trips carry only { date, location }. Backfill each
    // field so the rest of the app can treat them as required, seeding the
    // title from the old location and wrapping that location as a first place.
    trips.value = stamped<Trip>(data.trips).map((t) => {
      const legacyLoc = typeof t.location === 'string' ? t.location : ''
      const places: TripPlace[] = Array.isArray(t.places)
        ? (t.places as TripPlace[]).map((p) => ({
            id: typeof p.id === 'number' ? p.id : id(),
            name: typeof p.name === 'string' ? p.name : '',
            address: typeof p.address === 'string' ? p.address : '',
            lat: typeof p.lat === 'number' ? p.lat : null,
            lng: typeof p.lng === 'number' ? p.lng : null,
            visitedAt: typeof p.visitedAt === 'string' ? p.visitedAt : '',
            notes: typeof p.notes === 'string' ? p.notes : '',
            photos: Array.isArray(p.photos) ? p.photos.filter((x) => typeof x === 'string') : [],
          }))
        : []
      return {
        ...t,
        title: typeof t.title === 'string' && t.title ? t.title : legacyLoc,
        status: t.status === 'done' ? 'done' : 'tovisit',
        date: typeof t.date === 'string' ? t.date : '',
        visitedDate: typeof t.visitedDate === 'string' ? t.visitedDate : '',
        description: typeof t.description === 'string' ? t.description : '',
        tag: typeof t.tag === 'string' ? t.tag : '',
        photos: Array.isArray(t.photos) ? t.photos.filter((x) => typeof x === 'string') : [],
        places,
        noteIds: Array.isArray(t.noteIds) ? t.noteIds.filter((n) => typeof n === 'number') : [],
        location: legacyLoc,
      }
    })
    // Ideas/stocks are newer than the first release, so every legacy field is
    // backfilled on read — including noteIds, which older items never had.
    ideas.value = stamped<Idea>(data.ideas).map((i) => ({
      ...i,
      description: typeof i.description === 'string' ? i.description : '',
      deadline: typeof i.deadline === 'string' ? i.deadline : '',
      ideaType: typeof i.ideaType === 'string' && i.ideaType ? i.ideaType : 'feature',
      tag: typeof i.tag === 'string' ? i.tag : '',
      noteIds: Array.isArray(i.noteIds) ? i.noteIds.filter((n) => typeof n === 'number') : [],
    }))
    stocks.value = stamped<Stock>(data.stocks).map((st) => ({
      ...st,
      name: typeof st.name === 'string' ? st.name : '',
      why: typeof st.why === 'string' ? st.why : '',
      targetPrice: typeof st.targetPrice === 'number' ? st.targetPrice : 0,
      watchPrice: typeof st.watchPrice === 'number' ? st.watchPrice : 0,
      tag: typeof st.tag === 'string' ? st.tag : '',
      noteIds: Array.isArray(st.noteIds) ? st.noteIds.filter((n) => typeof n === 'number') : [],
    }))
    // Workspaces written before tags existed have none stored. Rather than
    // leaving the pickers empty, seed them from the tags already in use and
    // fall back to the defaults for a workspace that has none of those either.
    const stored = sanitizeTags(data.tags)
    let vocab = stored.length ? stored : DEFAULT_TAGS.slice()
    for (const item of [...todos.value, ...tasks.value, ...ideas.value, ...stocks.value])
      vocab = withTag(vocab, item.tag || '')
    tags.value = vocab
    approvedPRs.value =
      data.approvedPRs && typeof data.approvedPRs === 'object'
        ? (data.approvedPRs as Record<string, boolean>)
        : {}
    security.value =
      data.security && typeof data.security === 'object'
        ? { ...emptySecurity(), ...(data.security as Partial<SecuritySettings>) }
        : emptySecurity()
    // Guard the stored value: a theme key removed in a later release must not
    // leave the ui store indexing THEMES with a key that no longer exists.
    themeSetting.value = isThemeSetting(data.themeSetting) ? data.themeSetting : 'auto'
    bumpNid()
    // Release the hydration guard after the reactive writes settle.
    setTimeout(() => {
      hydrating = false
    }, 0)
  }
  function saveCloud() {
    if (!firebaseEnabled || !db || !uid || hydrating || !cloudReady.value) return
    const ref = doc(db, AUREON_COLLECTION, uid)
    syncState.value = 'saving'
    setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() }, { merge: true })
      .then(() => {
        syncState.value = 'synced'
      })
      .catch((error) => {
        syncState.value = 'error'
        cloudError.value = 'Could not save changes to Firebase.'
        console.error('[Aureon] Cloud save failed:', error)
      })
  }
  function scheduleSave() {
    // Snapshot hydration updates every reactive list. Do not turn those remote
    // changes into another write, otherwise the realtime listener can loop.
    if (hydrating) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveCloud, 600)
  }

  async function connectCloud(u: FbUser | null) {
    if (cloudUnsub) {
      cloudUnsub()
      cloudUnsub = null
    }
    clearTimeout(saveTimer)
    cloudReady.value = false
    cloudError.value = ''
    syncState.value = 'idle'
    uid = u && isFirebaseUserAllowed(u) ? u.uid : null
    resetData()
    if (!uid || !db) return
    const ref = doc(db, AUREON_COLLECTION, uid)
    try {
      const snap = await getDoc(ref)
      if (snap.exists()) applyData(snap.data())
      else {
        await setDoc(ref, { ...snapshotData(), ownerId: uid, updatedAt: Date.now() })
      }
      cloudReady.value = true
      syncState.value = 'synced'
    } catch (error) {
      cloudError.value = 'Could not load your Firebase data.'
      syncState.value = 'error'
      console.error('[Aureon] Cloud load failed:', error)
      return
    }
    // Live updates from other devices.
    cloudUnsub = onSnapshot(
      ref,
      (s) => {
        if (s.exists() && s.metadata.hasPendingWrites === false) {
          applyData(s.data())
          cloudReady.value = true
          syncState.value = 'synced'
        }
      },
      (error) => {
        cloudError.value = 'Firebase realtime sync was interrupted.'
        syncState.value = 'error'
        console.error('[Aureon] Cloud listener failed:', error)
      },
    )
  }

  // Re-run the connect for whoever is currently signed in, so a transient
  // Firestore failure does not strand the user on the error card.
  async function retryCloud() {
    await connectCloud(auth?.currentUser ?? null)
  }

  if (firebaseEnabled && auth && db) {
    onAuthStateChanged(auth, connectCloud)

    watch(
      [
        todos,
        tasks,
        deadlines,
        finances,
        notes,
        reminders,
        trips,
        ideas,
        stocks,
        security,
        themeSetting,
        approvedPRs,
      ],
      scheduleSave,
      { deep: true },
    )
  }

  function updateSecurity(patch: Partial<SecuritySettings>) {
    if (!uid || !cloudReady.value) return
    security.value = { ...security.value, ...patch }
  }

  bumpNid()

  return {
    // state
    todos,
    tasks,
    deadlines,
    finances,
    notes,
    reminders,
    trips,
    ideas,
    stocks,
    tags,
    security,
    themeSetting,
    cloudReady,
    cloudError,
    syncState,
    editing,
    draft,
    toast,
    burst,
    itemDialog,
    dialogDraft,
    dialogClosing,
    taskViewId,
    noteView,
    noteViewClosing,
    openNote,
    githubCache,
    approvedPRs,
    draggingId,
    draggingTodoId,
    activeNotif,
    notifPermission,
    sharedView,
    // actions
    addTag,
    removeTag,
    registerTag,
    addTodo,
    updateTodo,
    toggleTodo,
    setTodoStatus,
    cycleTodoStatus,
    addTask,
    toggleTask,
    setTaskStatus,
    cycleTaskStatus,
    updateTask,
    addDeadline,
    updateDeadline,
    addFinance,
    updateFinance,
    addTrip,
    updateTrip,
    tripById,
    addTripPlace,
    updateTripPlace,
    removeTripPlace,
    reorderTripPlaces,
    moveTripToDone,
    moveTripToVisit,
    addIdea,
    updateIdea,
    addStock,
    updateStock,
    attachNote,
    detachNote,
    updateSecurity,
    startEdit,
    newNote,
    openNoteView,
    editNoteView,
    saveNoteView,
    closeNoteView,
    setNoteText,
    autosaveNoteDraft,
    cancelEdit,
    setDraft,
    saveEdit,
    deleteWithUndo,
    undoDelete,
    showToastMsg,
    closeToast,
    share,
    pendingShare,
    shareBusy,
    cancelShare,
    createShareLink,
    dismissShared,
    addSharedItem,
    attachRepo,
    approvePR,
    importIssue,
    setDragId,
    dropOnTask,
    dropOnGroup,
    setTodoDragId,
    endTodoDrag,
    dropTodoOnDay,
    dropTodoOnTodo,
    openCreate,
    openEdit,
    closeItemDialog,
    setDialogDraft,
    commitCreate,
    itemById,
    updateItem,
    dialogTaskId,
    dialogReminderId,
    openTaskDialog,
    openReminderDialog,
    // The two named dialogs close the one shared slot.
    closeDialog: closeItemDialog,
    closeReminderDialog: closeItemDialog,
    openTaskView,
    closeTaskView,
    addReminder,
    updateReminder,
    toggleWeekday,
    syncCalendar,
    syncAllCalendar,
    unsyncCalendar,
    reconnectCalendar,
    calendarNeedsAuth,
    retryCloud,
    requestNotifPermission,
    checkReminders,
    snoozeNotif,
    dismissNotif,
  }
})
