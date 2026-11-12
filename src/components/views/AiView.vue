<script setup lang="ts">
// AI tab: a chat that knows your app. Three panes inside the stage — the chat
// list, the thread, and "What Aureon sees" (the exact data block sent with each
// turn) — with a pinned header (model, "Use my data") and a pinned composer. On a
// phone it is one pane at a time: the list, or the thread with a back button.
//
// The send loop lives in useAiChat, outside this component, so a reply keeps
// streaming (and the chat dock follows it) after the tab is left. The OpenRouter key
// never touches the client — see netlify/functions/ai.ts.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import ListToolbar from '@/components/ListToolbar.vue'
import SearchField from '@/components/ui/SearchField.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Switch from '@/components/ui/Switch.vue'
import Icon from '@/components/ui/Icon.vue'
import Badge from '@/components/ui/Badge.vue'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import AiActionDialog from '@/components/AiActionDialog.vue'
import AiTypoFixDialog from '@/components/AiTypoFixDialog.vue'
import type { IconName } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useDraft } from '@/composables/useDraft'
import { useConnectivity } from '@/composables/useConnectivity'
import { useSpeechInput } from '@/composables/useSpeechInput'
import {
  aiContextInput,
  focusInfo,
  planTargetFor,
  resolveParent,
  resolveUpdateTarget,
  useAiChat,
  type AiCreated,
  type AiFocus,
} from '@/composables/useAiChat'
import AiFocusPicker from '@/components/AiFocusPicker.vue'
import ScrollArrows from '@/components/ScrollArrows.vue'
import AiQuickLook from '@/components/AiQuickLook.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import AiSubTree from '@/components/ai/AiSubTree.vue'
import { AI_PROVIDERS, aiModelLabel, type AiChat, type AiItemRef, type AiMessage } from '@/types'
import { chatTarget } from '@/utils/aiSettings'
import AiModelPicker from '@/components/AiModelPicker.vue'
import AgentPicker from '@/components/AgentPicker.vue'
import ThinkingSteps from '@/components/ai/ThinkingSteps.vue'
import { aiTraces, traceKey } from '@/ai/steps'
import { agentFor, agentLabel, aiBackend, usd } from '@/ai/aureonChat'
import { aiHelpersAvailable } from '@/utils/aiAsk'
import {
  SUGGESTION_CHIPS,
  aiContextSections,
  buildAiContext,
  estimateTokens,
  parseAiReply,
  plainAiReply,
  AI_ACTION_KINDS,
  AI_ACTION_META,
  type AiActionKind,
  type AiContextKey,
  type AiItemUpdate,
  type AiNewItem,
  type AiNewKind,
  AI_NEW_KINDS,
  countSubs,
  type AiPlan,
  type AiUpdateKind,
} from '@/utils/ai'
import { renderMarkdown } from '@/utils/markdown'

/** The AI tab talks to Claude through Aureon (VITE_AI_BACKEND=aureon, the default). */
const onAureon = aiBackend() === 'aureon'
/** Typo fix and the other one-off helpers: only where a cheap model runs them (utils/aiAsk). */
const helpers = aiHelpersAvailable()

const app = useAppStore()
const { panelStyle, isMobile } = useStyles()
const { aiChats, activeAiChat, aiActiveChatId, aiUseData } = storeToRefs(app)
const { now } = storeToRefs(useUiStore())
const { isOnline } = useConnectivity()
const ai = useAiChat()
const { streaming, run } = ai

defineExpose({ focus: () => composerRef.value?.focus() })

// "Fix typos in my items": proofread existing todos, tasks, goals, reminders.
const typoOpen = ref(false)

// On a phone the list and the thread take turns.
const mobilePane = ref<'list' | 'thread'>('thread')
// The chat history pane folds away on a wide screen too (the header's left
// button), remembered per device like the context pane.
const LIST_KEY = 'aureon.ai.chatList'
function readListPref(): boolean {
  try {
    return localStorage.getItem(LIST_KEY) !== '0'
  } catch {
    return true
  }
}
const listOpen = ref(readListPref())
function toggleList() {
  listOpen.value = !listOpen.value
  try {
    localStorage.setItem(LIST_KEY, listOpen.value ? '1' : '0')
  } catch {
    /* private window — the toggle still works for this visit */
  }
}
const showList = computed(() => (isMobile.value ? mobilePane.value === 'list' : listOpen.value))
// Today / Yesterday / Earlier fold too; folded groups are remembered per device.
const GROUPS_KEY = 'aureon.ai.foldedGroups'
function readFolded(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const foldedGroups = ref<string[]>(readFolded())
function toggleGroup(label: string) {
  foldedGroups.value = foldedGroups.value.includes(label)
    ? foldedGroups.value.filter((g) => g !== label)
    : [...foldedGroups.value, label]
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(foldedGroups.value))
  } catch {
    /* private window */
  }
}
// A search shows every match, folded or not.
const isFolded = (label: string) => !search.value.trim() && foldedGroups.value.includes(label)
const showThread = computed(() => !isMobile.value || mobilePane.value === 'thread')

// "What Aureon sees" — open by default on a wide screen, remembered per device.
const CTX_KEY = 'aureon.ai.contextPanel'
function readCtxPref(): boolean {
  try {
    return localStorage.getItem(CTX_KEY) !== '0'
  } catch {
    return true
  }
}
const ctxOpen = ref(readCtxPref())
function toggleCtx() {
  ctxOpen.value = !ctxOpen.value
  try {
    localStorage.setItem(CTX_KEY, ctxOpen.value ? '1' : '0')
  } catch {
    /* private window — the toggle still works for this visit */
  }
}

// --- chat list --------------------------------------------------------------
const search = ref('')
const filteredChats = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q ? aiChats.value.filter((ch) => ch.title.toLowerCase().includes(q)) : aiChats.value
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
})
const startOfToday = () => {
  const d = new Date(now.value)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function groupOf(ch: AiChat): 'Pinned' | 'Today' | 'Yesterday' | 'Earlier' {
  if (ch.pinned) return 'Pinned'
  const t0 = startOfToday()
  if (ch.updatedAt >= t0) return 'Today'
  if (ch.updatedAt >= t0 - 86_400_000) return 'Yesterday'
  return 'Earlier'
}
const groupedChats = computed(() => {
  const groups: { label: string; chats: AiChat[] }[] = []
  for (const label of ['Pinned', 'Today', 'Yesterday', 'Earlier'] as const) {
    const chats = filteredChats.value.filter((ch) => groupOf(ch) === label)
    if (chats.length) groups.push({ label, chats })
  }
  return groups
})
// The second line of a row: the latest reply, as plain words.
function previewOf(ch: AiChat): string {
  for (let i = ch.messages.length - 1; i >= 0; i--) {
    const m = ch.messages[i]
    const t = (m.role === 'assistant' ? plainAiReply(m.content) : m.content)
      .replace(/\s+/g, ' ')
      .trim()
    if (t) return t
  }
  return 'No messages yet'
}

function newChat() {
  app.newAiChat()
  mobilePane.value = 'thread'
  void nextTick(() => composerRef.value?.focus())
}
function selectChat(id: number) {
  app.selectAiChat(id)
  mobilePane.value = 'thread'
}

// --- composer + draft -------------------------------------------------------
const composerRef = ref<InstanceType<typeof TextArea> | null>(null)
const threadRef = ref<HTMLElement | null>(null)
// The chat list and the context pane scroll on their own too; their arrows
// (ScrollArrows) need the elements.
const listScrollRef = ref<HTMLElement | null>(null)
const ctxScrollRef = ref<HTMLElement | null>(null)
const form = ref<Record<string, unknown>>({ text: '' })
const draftId = computed(() => aiActiveChatId.value)
useDraft('aiChat', draftId, form, {
  isEmpty: (p) => !String(p.text ?? '').trim(),
})
const text = computed({
  get: () => String(form.value.text ?? ''),
  set: (v: string) => (form.value = { ...form.value, text: v }),
})

// The mic: dictate into the composer; Send stays a separate, deliberate tap.
const mic = useSpeechInput({
  current: () => text.value,
  onText: (t) => (text.value = t),
  onError: (msg) => app.showToastMsg(msg),
})
function toggleMic() {
  mic.toggle()
  composerRef.value?.focus()
}

// Scrolling follows the reader. A new turn glides to the bottom; a reply that
// is still growing is followed only while the reader is already at the bottom,
// so scrolling up to reread something is not yanked back down every token.
const atBottom = ref(true)
const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
function onThreadScroll() {
  const el = threadRef.value
  if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
function scrollToEnd(smooth: boolean) {
  void nextTick(() => {
    const el = threadRef.value
    if (!el) return
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' })
    } else el.scrollTop = el.scrollHeight
    atBottom.value = true
  })
}
watch(aiActiveChatId, () => scrollToEnd(false), { immediate: true })

// Only turns that arrive while you watch animate in — opening an old chat shows
// its history at rest. The second of slack covers a chat that a send has just
// created, whose first turns land in the same tick as the switch.
const freshSince = ref(Date.now())
watch(aiActiveChatId, () => (freshSince.value = Date.now() - 1000))
const isFresh = (m: AiMessage) => m.createdAt >= freshSince.value
watch(
  () => activeAiChat.value?.messages.length ?? 0,
  (n, prev) => {
    if (n > (prev ?? 0)) scrollToEnd(true)
  },
)
watch(
  () => {
    const msgs = activeAiChat.value?.messages
    return msgs?.length ? msgs[msgs.length - 1].content.length : 0
  },
  () => {
    if (atBottom.value) scrollToEnd(false)
  },
)

// Seeing the finished reply here is what the dock was waiting for.
watch(
  () => [run.value?.status, run.value?.chatId, aiActiveChatId.value] as const,
  ([status, chatId, activeId]) => {
    if (status && status !== 'streaming' && chatId === activeId) ai.dismiss()
  },
  { immediate: true },
)

// The cursor belongs to the message being streamed, in whichever chat it is.
const isStreamingMsg = (msgId: number) => streaming.value && run.value?.msgId === msgId

function send(prompt?: string) {
  const body = (prompt ?? text.value).trim()
  if (!body || streaming.value || !isOnline.value) return
  if (prompt == null) text.value = ''
  mobilePane.value = 'thread'
  void ai.send(body)
}
// The whole composer card is the text field: a tap anywhere on it that is not
// one of its buttons puts the caret in the box.
function focusComposer(e: MouseEvent) {
  if ((e.target as HTMLElement | null)?.closest('button, textarea')) return
  composerRef.value?.focus()
}
// The chat a reply is streaming into — its row in the list wears a spinner.
const streamingChatId = computed(() => (streaming.value ? (run.value?.chatId ?? null) : null))
function onComposerKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

// --- thread -----------------------------------------------------------------
// The proxy's provider and model are picked in the bar under the header
// (AiModelPicker); on Aureon that bar picks the agent (AgentPicker). The phone
// header repeats the choice: on Aureon, the agent that wrote the chat's latest
// reply, else the chat's pick.
const lastReply = computed(() =>
  [...(activeAiChat.value?.messages ?? [])]
    .reverse()
    .find((m) => m.role === 'assistant' && m.agent),
)
const chosenLabel = computed(() => {
  if (!onAureon) return aiModelLabel(chatTarget().model)
  const answered = lastReply.value?.agent
  if (answered) return `Claude · ${agentLabel(answered)}`
  const pick = agentFor(activeAiChat.value ? String(activeAiChat.value.id) : null)
  return pick === 'auto' ? 'Claude · Auto' : `Claude · ${agentLabel(pick)}`
})
const modelTitle = computed(() => {
  if (onAureon) return 'Claude, through the Aureon server'
  const { provider, model } = chatTarget()
  return `${model} through ${AI_PROVIDERS[provider].label}`
})
const msgTokens = (m: AiMessage) => (m.tokensIn || 0) + (m.tokensOut || 0)
// The count is the model's own, reported when a reply finishes: what it read (the
// instructions, your data block and the whole conversation so far) plus what it
// wrote. Reading grows every turn, which is why later replies cost more.
function tokenTitle(m: AiMessage): string {
  const read = (m.tokensIn || 0).toLocaleString()
  const wrote = (m.tokensOut || 0).toLocaleString()
  return `${read} read (instructions, ${m.usedData ? 'your data, ' : ''}the conversation so far) + ${wrote} written`
}
const tokenTotal = computed(
  () => activeAiChat.value?.messages.reduce((sum, m) => sum + msgTokens(m), 0) ?? 0,
)
const threadMeta = computed(() => {
  const n = activeAiChat.value?.messages.length ?? 0
  const parts = [`${n} message${n === 1 ? '' : 's'}`]
  if (tokenTotal.value) parts.push(`${tokenTotal.value.toLocaleString()} tokens`)
  return parts.join(' · ')
})

// Each assistant message, parsed once per change rather than per render pass.
const parsed = computed(() => {
  const out = new Map<number, ReturnType<typeof parseAiReply>>()
  for (const m of activeAiChat.value?.messages ?? []) {
    if (m.role === 'assistant') out.set(m.id, parseAiReply(m.content))
  }
  return out
})
// Follow-ups only under the latest reply, and only once it has finished.
const lastAssistantId = computed(() => {
  const msgs = activeAiChat.value?.messages ?? []
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant') return msgs[i].id
  return null
})
function followupsOf(m: AiMessage): string[] {
  if (m.id !== lastAssistantId.value || isStreamingMsg(m.id)) return []
  return parsed.value.get(m.id)?.followups ?? []
}

// Plan cards: the n-th plan in a message, its target, and whether it was added.
function planIndex(m: AiMessage, partIndex: number): number {
  const parts = parsed.value.get(m.id)?.parts ?? []
  return parts.slice(0, partIndex).filter((p) => p.kind === 'plan').length
}
function planLabel(m: AiMessage, plan: AiPlan): string {
  const n = plan.steps.length
  const target = planTargetFor(app, m, plan)
  const sub = target?.collection === 'tasks' ? 'subtask' : 'sub-todo'
  return target
    ? `Add ${n} ${sub}${n === 1 ? '' : 's'} to “${target.label}”`
    : `Add a todo with ${n} sub-todo${n === 1 ? '' : 's'}`
}

// ---- the item the chat works on ---------------------------------------------
const focusPickerOpen = ref(false)
const working = computed(() => (ai.focus.value ? focusInfo(app, ai.focus.value) : null))
const workingKids = ref(false) // the sub-item list, open or folded
const WORKING_SHOWN = 6
const shownKids = computed(() =>
  workingKids.value
    ? (working.value?.children ?? [])
    : (working.value?.children ?? []).slice(0, WORKING_SHOWN),
)
function pickFocus(f: AiFocus) {
  ai.setFocus(f)
  focusPickerOpen.value = false
  composerRef.value?.focus()
}
function openWorking() {
  const w = working.value
  if (!w) return
  if (w.collection === 'tasks') app.openTaskDialog(w.id)
  else app.openEdit('todo', w.id)
}
// One-tap asks about the picked item.
function askAboutWorking(kind: 'split' | 'missing' | 'list') {
  const w = working.value
  if (!w) return
  const sub = w.collection === 'tasks' ? 'subtasks' : 'sub-todos'
  send(
    kind === 'split'
      ? `Break “${w.title}” into ${sub}.`
      : kind === 'missing'
        ? `What's missing from “${w.title}”? Suggest new ${sub} for it.`
        : `What ${sub} are under “${w.title}”, and which are done?`,
  )
}
function planApplied(m: AiMessage, idx: number): boolean {
  return (m.appliedPlans ?? []).includes(idx)
}
function addPlan(m: AiMessage, idx: number, plan: AiPlan) {
  const chat = activeAiChat.value
  if (!chat || planApplied(m, idx)) return
  if (!ai.applyPlan(chat.id, m.id, idx, plan)) return
  // A quick look at where the steps landed: the item, with them under it.
  const made = app.aiChatById(chat.id)?.messages.find((x) => x.id === m.id)?.made ?? []
  const last = made[made.length - 1]
  if (last) openLook([last])
}

// Description-update cards: the n-th in a message, each row's live item, and
// whether the card was applied. A row whose ref matches nothing is shown but
// skipped, so a hallucinated id can never write anywhere.
const UPDATE_KIND_LABEL: Record<AiUpdateKind, string> = {
  todo: 'Todo',
  task: 'Task',
  idea: 'Idea',
  goal: 'Goal',
  trip: 'Trip',
  reminder: 'Reminder',
  stock: 'Stock',
}
function updatesIndex(m: AiMessage, partIndex: number): number {
  const parts = parsed.value.get(m.id)?.parts ?? []
  return parts.slice(0, partIndex).filter((p) => p.kind === 'updates').length
}
const updateTarget = (u: AiItemUpdate) => resolveUpdateTarget(app, u)
function updatesApplied(m: AiMessage, idx: number): boolean {
  return (m.appliedUpdates ?? []).includes(idx)
}
function updatesLabel(updates: AiItemUpdate[]): string {
  const n = updates.filter((u) => updateTarget(u)).length
  return n ? `Update ${n} description${n === 1 ? '' : 's'}` : 'Nothing to update'
}
function applyUpdates(m: AiMessage, idx: number, updates: AiItemUpdate[]) {
  if (!activeAiChat.value || updatesApplied(m, idx)) return
  ai.applyUpdates(activeAiChat.value.id, m.id, idx, updates)
}

// New-item cards: todos, tasks and goals the reply proposes from what was
// discussed. Every row starts ticked; untick what you do not want, then Create.
// Afterwards a pop-up lists what was made, with Open and Undo.
const NEW_KIND_LABEL: Record<AiNewKind, string> = {
  todo: 'Todo',
  task: 'Task',
  goal: 'Milestone',
  idea: 'Idea',
  deadline: 'Deadline',
  reminder: 'Reminder',
  note: 'Note',
  trip: 'Trip',
  stock: 'Stock',
  expense: 'Expense',
  income: 'Income',
}
const NEW_SUB_LABEL: Partial<Record<AiNewKind, string>> = {
  todo: 'sub-todo',
  task: 'subtask',
  idea: 'sub-idea',
  goal: 'step',
}
// Where a new item lands when the model put it under an existing one.
const PARENT_LABEL = { todo: 'todo', task: 'task', idea: 'idea', goal: 'milestone' } as const
function createIndex(m: AiMessage, partIndex: number): number {
  const parts = parsed.value.get(m.id)?.parts ?? []
  return parts.slice(0, partIndex).filter((p) => p.kind === 'create').length
}
function createApplied(m: AiMessage, idx: number): boolean {
  return (m.appliedCreates ?? []).includes(idx)
}
// Rows unticked on each card, keyed by message and card.
const unticked = ref<Record<string, number[]>>({})
const cardKey = (m: AiMessage, idx: number) => `${m.id}:${idx}`
function isTicked(m: AiMessage, idx: number, row: number): boolean {
  return !(unticked.value[cardKey(m, idx)] ?? []).includes(row)
}
function setTicked(m: AiMessage, idx: number, row: number, on: boolean) {
  const key = cardKey(m, idx)
  const rest = (unticked.value[key] ?? []).filter((r) => r !== row)
  unticked.value = { ...unticked.value, [key]: on ? rest : [...rest, row] }
}
function tickedItems(m: AiMessage, idx: number, items: AiNewItem[]): AiNewItem[] {
  return items.filter((_, row) => isTicked(m, idx, row))
}
function createLabel(items: AiNewItem[]): string {
  if (!items.length) return 'Nothing ticked'
  const counts = AI_NEW_KINDS.map((k) => [k, items.filter((i) => i.kind === k).length] as const)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`)
  return `Create ${counts.join(', ')}`
}
function subLine(it: AiNewItem): string {
  const parts: string[] = []
  if (it.parent) {
    const p = resolveParent(app, it.parent)
    const sub =
      it.parent.kind === 'goal' ? 'as a step of' : `as a ${NEW_SUB_LABEL[it.kind] ?? 'sub-item'} of`
    parts.push(
      p
        ? `${sub} ${PARENT_LABEL[p.kind]} “${p.title}”`
        : `its ${PARENT_LABEL[it.parent.kind]} is gone — will be added at the top level`,
    )
  }
  if (it.amount) parts.push(`₹${it.amount.toLocaleString('en-IN')}`)
  if (it.category) parts.push(it.category)
  if (it.when) parts.push(`at ${it.when.replace('T', ' ')}`)
  if (it.due) {
    const word =
      it.kind === 'goal'
        ? 'target'
        : it.kind === 'trip' || it.kind === 'expense' || it.kind === 'income'
          ? 'on'
          : 'due'
    parts.push(`${word} ${it.due}`)
  }
  if (it.tag) parts.push(`#${it.tag}`)
  const n = countSubs(it.items)
  const label = NEW_SUB_LABEL[it.kind]
  if (n && label) parts.push(`${n} ${label}${n === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

// ---- quick look ----------------------------------------------------------------
// Whatever the chat makes — a card's items, a plan's parent, "Add to" — opens
// in a quick look straight away, and stays one tap away under its reply.
const look = ref<{
  items: AiItemRef[]
  // After a "New items" card: what Undo takes back.
  undo?: { chatId: number; msgId: number; idx: number; made: AiCreated[] }
} | null>(null)
const lookOpen = ref(false)
function openLook(items: AiItemRef[], undo?: NonNullable<typeof look.value>['undo']) {
  if (!items.length) return
  look.value = { items, ...(undo ? { undo } : {}) }
  lookOpen.value = true
}
function closeLook() {
  lookOpen.value = false
}

function runCreate(m: AiMessage, idx: number, items: AiNewItem[]) {
  const chat = activeAiChat.value
  if (!chat || createApplied(m, idx)) return
  const made = ai.createItems(chat.id, m.id, idx, tickedItems(m, idx, items))
  if (!made.length) return
  openLook(
    made.map((c) => c.ref),
    { chatId: chat.id, msgId: m.id, idx, made },
  )
}
function undoCreate() {
  const u = look.value?.undo
  lookOpen.value = false
  if (!u) return
  ai.undoCreated(u.chatId, u.msgId, u.idx, u.made)
  look.value = null
  app.showToastMsg('Removed the new items')
}
// The chips under a reply: what it made, still there.
const MADE_LABEL: Record<AiItemRef['kind'], string> = {
  todo: 'Todo',
  task: 'Task',
  goal: 'Goal',
  reminder: 'Reminder',
  note: 'Note',
  idea: 'Idea',
  deadline: 'Deadline',
  trip: 'Trip',
  stock: 'Stock',
  txn: 'Money',
}
function madeTitle(r: AiItemRef): string | null {
  const hit = <T extends { id: number }>(list: T[]) => list.find((x) => x.id === r.id)
  switch (r.kind) {
    case 'todo':
      return hit(app.todos)?.text ?? null
    case 'task':
      return hit(app.tasks)?.title ?? null
    case 'goal':
      return hit(app.goals)?.title ?? null
    case 'reminder':
      return hit(app.reminders)?.title ?? null
    case 'note': {
      const n = hit(app.notes)
      return n ? n.title || 'Note' : null
    }
    case 'idea':
      return hit(app.ideas)?.title ?? null
    case 'deadline':
      return hit(app.deadlines)?.title ?? null
    case 'trip':
      return hit(app.trips)?.title ?? null
    case 'stock':
      return hit(app.stocks)?.symbol ?? null
    case 'txn': {
      const t = hit(app.transactions)
      return t ? t.note || t.category : null
    }
  }
  return null
}
function madeOf(m: AiMessage) {
  return (m.made ?? [])
    .map((r) => ({ ref: r, title: madeTitle(r) }))
    .filter((x): x is { ref: AiItemRef; title: string } => x.title != null)
}

// A source chip's fallback name: the site.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// --- add from a reply ---------------------------------------------------------
const action = ref<{ kind: AiActionKind; reply: string; msgId: number } | null>(null)
function openAction(m: AiMessage, kind: AiActionKind) {
  action.value = { kind, reply: m.content, msgId: m.id }
}
const suggestedKinds = (m: AiMessage) => (parsed.value.get(m.id)?.actions ?? []).map((a) => a.kind)

const copiedId = ref<number | null>(null)
async function copyMsg(m: AiMessage) {
  try {
    await navigator.clipboard.writeText(plainAiReply(m.content))
    copiedId.value = m.id
    setTimeout(() => {
      if (copiedId.value === m.id) copiedId.value = null
    }, 1500)
  } catch {
    /* clipboard blocked — nothing to undo */
  }
}

// Read a reply aloud with the browser's own speech — no extra AI call. One
// reply speaks at a time; pressing the speaker again (or on another reply)
// stops it. Markdown marks are stripped so they are not read out.
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
const speakingId = ref<number | null>(null)
function stopSpeaking() {
  if (canSpeak) window.speechSynthesis.cancel()
  speakingId.value = null
}
function toggleSpeak(m: AiMessage) {
  if (!canSpeak) return
  const wasThis = speakingId.value === m.id
  stopSpeaking()
  if (wasThis) return
  const words = plainAiReply(m.content)
    .replace(/[*_`#>~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
  if (!words) return
  const say = new SpeechSynthesisUtterance(words)
  say.onend = say.onerror = () => {
    if (speakingId.value === m.id) speakingId.value = null
  }
  speakingId.value = m.id
  window.speechSynthesis.speak(say)
}
watch(aiActiveChatId, stopSpeaking)
onBeforeUnmount(stopSpeaking)

// --- what Aureon sees -------------------------------------------------------
const ctxInput = computed(() => aiContextInput(app))
const ctxSections = computed(() => aiContextSections(ctxInput.value))
const ctxTokens = computed(() => estimateTokens(buildAiContext(ctxInput.value)))
const CTX_ICONS: Record<AiContextKey, IconName> = {
  todos: 'square-check-big',
  tasks: 'list-checks',
  calendar: 'calendar',
  ideas: 'lightbulb',
  goals: 'target',
  stocks: 'trending-up',
  reminders: 'bell',
  money: 'indian-rupee',
  trips: 'plane',
  notes: 'sticky-note',
  bots: 'bot',
}
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="AI" new-label="New chat" @new="newChat" />
    <AiActionDialog
      :open="!!action"
      :kind="action?.kind ?? 'todo'"
      :reply="action?.reply ?? ''"
      :chat-title="activeAiChat?.title ?? ''"
      :from="action && activeAiChat ? { chatId: activeAiChat.id, msgId: action.msgId } : undefined"
      @close="action = null"
      @created="openLook([$event])"
    />
    <AiTypoFixDialog :open="typoOpen" @close="typoOpen = false" />
    <AiFocusPicker
      :open="focusPickerOpen"
      :current="ai.focus.value"
      @close="focusPickerOpen = false"
      @pick="pickFocus"
    />
    <AiQuickLook
      :open="lookOpen"
      :items="look?.items ?? []"
      :undoable="!!look?.undo"
      @close="closeLook"
      @undo="undoCreate"
    />
    <div class="ai" :class="{ 'ai--phone': isMobile }">
      <!-- chat list -->
      <Transition name="ai-listpane">
        <aside v-if="showList" class="ai-list" aria-label="Chats">
          <div class="ai-list__top">
            <h2 class="ai-list__title">Chats</h2>
            <IconButton v-if="!isMobile" size="sm" label="Hide chat history" @click="toggleList">
              <Icon name="panel-left" />
            </IconButton>
          </div>
          <SearchField v-model="search" placeholder="Search chats" size="md" label="Search chats" />
          <ScrollArrows :target="listScrollRef" />
          <div ref="listScrollRef" class="ai-list__scroll scroll-arrows-target">
            <template v-for="g in groupedChats" :key="g.label">
              <button
                type="button"
                class="ai-list__group"
                :aria-expanded="!isFolded(g.label)"
                @click="toggleGroup(g.label)"
              >
                <Icon
                  name="chevron-down"
                  size="xs"
                  class="ai-list__fold"
                  :class="{ 'is-folded': isFolded(g.label) }"
                />
                <span>{{ g.label }}</span>
                <span class="ai-list__group-n">{{ g.chats.length }}</span>
              </button>
              <TransitionGroup
                v-if="!isFolded(g.label)"
                tag="div"
                name="ai-rows"
                class="ai-list__rows"
              >
                <div
                  v-for="ch in g.chats"
                  :key="ch.id"
                  class="ai-row"
                  :class="{ 'is-active': ch.id === aiActiveChatId && !isMobile }"
                  role="button"
                  tabindex="0"
                  @click="selectChat(ch.id)"
                  @keydown.enter.prevent="selectChat(ch.id)"
                >
                  <div class="ai-row__text">
                    <span class="ai-row__title">{{ ch.title }}</span>
                    <span class="ai-row__preview">{{ previewOf(ch) }}</span>
                  </div>
                  <ProgressRing
                    v-if="ch.id === streamingChatId"
                    class="ai-row__busy"
                    indeterminate
                    hide-value
                    :size="16"
                    :stroke="2"
                    label="Replying"
                  />
                  <IconButton
                    size="sm"
                    :label="ch.pinned ? 'Unpin' : 'Pin'"
                    :active="ch.pinned"
                    :class="{ 'ai-row__pinned': ch.pinned }"
                    @click.stop="app.toggleAiChatPin(ch.id)"
                  >
                    <Icon name="pin" />
                  </IconButton>
                  <IconButton
                    size="sm"
                    tone="danger"
                    label="Delete"
                    @click.stop="app.deleteAiChat(ch.id)"
                  >
                    <Icon name="trash-2" />
                  </IconButton>
                </div>
              </TransitionGroup>
            </template>
            <div v-if="!aiChats.length" class="ai-list__empty">No chats yet.</div>
            <div v-else-if="!groupedChats.length" class="ai-list__empty">No chats match.</div>
          </div>
        </aside>
      </Transition>

      <!-- thread -->
      <section v-if="showThread" class="ai-main">
        <header v-if="isMobile" class="ai-head ai-head--phone">
          <IconButton size="lg" variant="outline" label="All chats" @click="mobilePane = 'list'">
            <Icon name="arrow-left" />
          </IconButton>
          <div class="ai-head__titles ai-head__titles--center">
            <h2 class="ai-head__title">{{ activeAiChat?.title ?? 'New chat' }}</h2>
            <span class="ai-head__model ai-head__model--bare" :title="modelTitle">{{
              chosenLabel
            }}</span>
          </div>
          <IconButton
            v-if="helpers"
            size="lg"
            variant="outline"
            label="Fix typos in my items"
            :disabled="!isOnline"
            @click="typoOpen = true"
          >
            <Icon name="spell-check" />
          </IconButton>
          <IconButton size="lg" variant="solid" label="New chat" @click="newChat">
            <Icon name="square-pen" />
          </IconButton>
        </header>
        <header v-else class="ai-head">
          <IconButton
            v-if="!listOpen"
            variant="outline"
            label="Show chat history"
            @click="toggleList"
          >
            <Icon name="panel-left" />
          </IconButton>
          <Transition name="ai-fade" mode="out-in">
            <div :key="aiActiveChatId ?? 'none'" class="ai-head__titles">
              <h2 class="ai-head__title">{{ activeAiChat?.title ?? 'New chat' }}</h2>
              <span class="ai-head__meta">{{ threadMeta }}</span>
            </div>
          </Transition>
          <Switch
            v-if="!onAureon"
            :model-value="aiUseData"
            label="Use my data"
            @update:model-value="app.setAiUseData($event)"
          />
          <IconButton
            v-if="helpers"
            variant="outline"
            label="Fix typos in my items"
            :disabled="!isOnline"
            @click="typoOpen = true"
          >
            <Icon name="spell-check" />
          </IconButton>
          <IconButton
            v-if="!onAureon"
            class="ai-head__ctx"
            variant="outline"
            :label="ctxOpen ? 'Hide what Aureon sees' : 'Show what Aureon sees'"
            :active="ctxOpen"
            @click="toggleCtx"
          >
            <Icon name="panel-right" />
          </IconButton>
        </header>

        <!-- Provider switch and model, under the header on every screen size. -->
        <div class="ai-modelbar">
          <AgentPicker v-if="onAureon" :disabled="streaming" />
          <AiModelPicker v-else :disabled="streaming" />
        </div>

        <button
          v-if="isMobile && !onAureon"
          type="button"
          class="ai-datapill"
          :class="{ 'is-off': !aiUseData }"
          :aria-pressed="aiUseData"
          @click="app.setAiUseData(!aiUseData)"
        >
          <Icon name="database" size="xs" />{{
            aiUseData ? 'Using your data' : 'Not using your data'
          }}
        </button>

        <ScrollArrows :target="threadRef" />
        <Transition name="ai-fade" mode="out-in" @enter="scrollToEnd(false)">
          <div
            v-if="!activeAiChat || !activeAiChat.messages.length"
            :key="'empty-' + (aiActiveChatId ?? 'none')"
            class="ai-empty"
          >
            <span class="ai-avatar ai-avatar--lg"><Icon name="sparkles" size="lg" /></span>
            <p class="ai-empty__lead">
              Ask about your todos, money, reminders, or bots — or paste a link to turn it into
              todos, tasks and goals.
            </p>
            <div class="ai-empty__chips">
              <button
                v-for="(chip, ci) in SUGGESTION_CHIPS"
                :key="chip"
                type="button"
                class="ai-chip"
                :style="{ '--i': ci }"
                @click="send(chip)"
              >
                {{ chip }}
              </button>
              <button
                v-if="helpers"
                type="button"
                class="ai-chip"
                :style="{ '--i': SUGGESTION_CHIPS.length }"
                :disabled="!isOnline"
                @click="typoOpen = true"
              >
                Fix typos in my todos, tasks, milestones &amp; events
              </button>
            </div>
          </div>

          <div
            v-else
            :key="'thread-' + activeAiChat.id"
            ref="threadRef"
            class="ai-thread scroll-arrows-target"
            @scroll.passive="onThreadScroll"
          >
            <template v-for="m in activeAiChat.messages" :key="m.id">
              <div v-if="m.role === 'user'" class="ai-user" :class="{ 'is-new': isFresh(m) }">
                <div class="ai-user__bubble">{{ m.content }}</div>
              </div>

              <div v-else class="ai-reply" :class="{ 'is-new': isFresh(m) }">
                <span v-if="!isMobile" class="ai-avatar"><Icon name="sparkles" /></span>
                <div class="ai-reply__body">
                  <ThinkingSteps
                    v-if="onAureon && aiTraces[traceKey(activeAiChat.id, m.id)]"
                    :trace="aiTraces[traceKey(activeAiChat.id, m.id)]"
                  />
                  <template v-for="(part, pi) in parsed.get(m.id)?.parts ?? []" :key="pi">
                    <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes everything first -->
                    <div
                      v-if="part.kind === 'text'"
                      class="ai-reply__text"
                      v-html="renderMarkdown(part.text)"
                    ></div>
                    <div
                      v-else-if="part.kind === 'updates'"
                      class="ai-plan"
                      :class="{ 'is-applied': updatesApplied(m, updatesIndex(m, pi)) }"
                    >
                      <ul class="ai-plan__steps">
                        <li
                          v-for="(u, ui) in part.updates"
                          :key="ui"
                          class="ai-plan__step"
                          :class="{ 'is-missing': !updateTarget(u) }"
                          :style="{ '--i': ui }"
                        >
                          <span class="ai-plan__ring" aria-hidden="true"
                            ><Icon name="check" size="xs"
                          /></span>
                          <span class="ai-plan__text"
                            >{{ UPDATE_KIND_LABEL[u.kind] }} ·
                            {{ updateTarget(u)?.title ?? 'item not found — skipped'
                            }}<span class="ai-plan__notes">{{ u.description }}</span></span
                          >
                        </li>
                      </ul>
                      <button
                        type="button"
                        class="ai-plan__add"
                        :disabled="
                          updatesApplied(m, updatesIndex(m, pi)) ||
                          isStreamingMsg(m.id) ||
                          !part.updates.some((u) => updateTarget(u))
                        "
                        @click="applyUpdates(m, updatesIndex(m, pi), part.updates)"
                      >
                        <Transition name="ai-swap" mode="out-in">
                          <span
                            v-if="updatesApplied(m, updatesIndex(m, pi))"
                            key="done"
                            class="ai-plan__label"
                          >
                            <Icon name="check" />Updated
                          </span>
                          <span v-else key="add" class="ai-plan__label">
                            <Icon name="pencil" />{{ updatesLabel(part.updates) }}
                          </span>
                        </Transition>
                      </button>
                    </div>
                    <div
                      v-else-if="part.kind === 'create'"
                      class="ai-plan ai-create"
                      :class="{ 'is-applied': createApplied(m, createIndex(m, pi)) }"
                    >
                      <p class="ai-create__head">
                        <Icon name="sparkles" size="xs" />New items from this chat
                      </p>
                      <ul class="ai-plan__steps">
                        <li
                          v-for="(it, ri) in part.items"
                          :key="ri"
                          class="ai-plan__step ai-create__row"
                          :class="{ 'is-off': !isTicked(m, createIndex(m, pi), ri) }"
                          :style="{ '--i': ri }"
                        >
                          <Checkbox
                            :model-value="isTicked(m, createIndex(m, pi), ri)"
                            :aria-label="`Create ${NEW_KIND_LABEL[it.kind]}: ${it.title}`"
                            :disabled="createApplied(m, createIndex(m, pi)) || isStreamingMsg(m.id)"
                            @update:model-value="setTicked(m, createIndex(m, pi), ri, $event)"
                          />
                          <span class="ai-plan__text">
                            <span class="ai-create__kind" :data-kind="it.kind">{{
                              NEW_KIND_LABEL[it.kind]
                            }}</span>
                            {{ it.title }}
                            <span v-if="subLine(it)" class="ai-create__meta">{{
                              subLine(it)
                            }}</span>
                            <span v-if="it.notes" class="ai-plan__notes">{{ it.notes }}</span>
                            <AiSubTree v-if="it.items?.length" :items="it.items" />
                          </span>
                        </li>
                      </ul>
                      <button
                        type="button"
                        class="ai-plan__add"
                        :disabled="
                          createApplied(m, createIndex(m, pi)) ||
                          isStreamingMsg(m.id) ||
                          !tickedItems(m, createIndex(m, pi), part.items).length
                        "
                        @click="runCreate(m, createIndex(m, pi), part.items)"
                      >
                        <Transition name="ai-swap" mode="out-in">
                          <span
                            v-if="createApplied(m, createIndex(m, pi))"
                            key="done"
                            class="ai-plan__label"
                          >
                            <Icon name="check" />Created
                          </span>
                          <span v-else key="add" class="ai-plan__label">
                            <Icon name="plus" />{{
                              createLabel(tickedItems(m, createIndex(m, pi), part.items))
                            }}
                          </span>
                        </Transition>
                      </button>
                    </div>
                    <div
                      v-else-if="part.kind === 'plan'"
                      class="ai-plan"
                      :class="{ 'is-applied': planApplied(m, planIndex(m, pi)) }"
                    >
                      <ul class="ai-plan__steps">
                        <li
                          v-for="(s, si) in part.plan.steps"
                          :key="si"
                          class="ai-plan__step"
                          :style="{ '--i': si }"
                        >
                          <span class="ai-plan__ring" aria-hidden="true"
                            ><Icon name="check" size="xs"
                          /></span>
                          <span class="ai-plan__text"
                            >{{ s.text
                            }}<span v-if="s.notes" class="ai-plan__notes">{{ s.notes }}</span></span
                          >
                          <span v-if="s.mins" class="ai-plan__mins">{{ s.mins }}m</span>
                        </li>
                      </ul>
                      <button
                        type="button"
                        class="ai-plan__add"
                        :disabled="planApplied(m, planIndex(m, pi)) || isStreamingMsg(m.id)"
                        @click="addPlan(m, planIndex(m, pi), part.plan)"
                      >
                        <Transition name="ai-swap" mode="out-in">
                          <span
                            v-if="planApplied(m, planIndex(m, pi))"
                            key="done"
                            class="ai-plan__label"
                          >
                            <Icon name="check" />Added
                          </span>
                          <span v-else key="add" class="ai-plan__label">
                            <Icon name="plus" />{{ planLabel(m, part.plan) }}
                          </span>
                        </Transition>
                      </button>
                    </div>
                  </template>
                  <div
                    v-if="isStreamingMsg(m.id) && !m.content.trim()"
                    class="ai-thinking"
                    role="status"
                  >
                    <ProgressRing indeterminate hide-value :size="18" :stroke="2.5" />
                    Thinking…
                  </div>
                  <span
                    v-else-if="isStreamingMsg(m.id)"
                    class="ai-cursor"
                    aria-hidden="true"
                  ></span>

                  <!-- What this reply made: a tap is a quick look at it. -->
                  <div v-if="madeOf(m).length" class="ai-made">
                    <span class="ai-sources__label">Made from this reply</span>
                    <button
                      v-for="x in madeOf(m)"
                      :key="x.ref.kind + x.ref.id"
                      type="button"
                      class="ai-source ai-made__chip"
                      :title="'Quick look: ' + x.title"
                      @click="openLook([x.ref])"
                    >
                      <span class="ai-made__kind">{{ MADE_LABEL[x.ref.kind] }}</span>
                      <span class="ai-source__name">{{ x.title }}</span>
                    </button>
                    <button
                      v-if="madeOf(m).length > 1"
                      type="button"
                      class="ai-source ai-made__all"
                      @click="openLook(madeOf(m).map((x) => x.ref))"
                    >
                      Look at all {{ madeOf(m).length }}
                    </button>
                  </div>

                  <!-- The pages this reply read, from links in the message. -->
                  <div v-if="m.sources?.length" class="ai-sources">
                    <span class="ai-sources__label">Read from</span>
                    <a
                      v-for="s in m.sources"
                      :key="s.url"
                      class="ai-source"
                      :class="{ 'is-failed': !s.ok }"
                      :href="s.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      :title="s.ok ? s.url : `Could not read ${s.url}`"
                    >
                      <Icon :name="s.ok ? 'globe' : 'alert-circle'" size="xs" />
                      <span class="ai-source__name">{{ s.title || hostOf(s.url) }}</span>
                    </a>
                  </div>

                  <!-- Writes the agent asked for: nothing happens until approved. -->
                  <GlassPanel
                    v-for="a in m.approvals ?? []"
                    :key="a.id"
                    padding="sm"
                    class="ai-approval"
                    data-testid="approval-card"
                  >
                    <Badge tone="warning" label="Awaiting your approval" />
                    <span class="ai-approval__summary">{{ a.summary }}</span>
                    <RouterLink
                      class="ai-approval__link"
                      :to="{ path: '/dev/ai-approvals', query: { id: a.id } }"
                      >Review</RouterLink
                    >
                  </GlassPanel>

                  <div v-if="!isStreamingMsg(m.id) || m.agent" class="ai-meta">
                    <!-- Claude: the agent that answered THIS reply, and what it cost. -->
                    <span
                      v-if="m.agent"
                      class="ai-meta__route is-external"
                      data-testid="agent-badge"
                      :title="`Answered by Claude as the ${agentLabel(m.agent)} agent`"
                      ><Icon name="sparkles" size="xs" />{{ agentLabel(m.agent) }}</span
                    >
                    <span
                      v-if="!isStreamingMsg(m.id) && usd(m.costUsd)"
                      class="ai-meta__tok"
                      data-testid="reply-cost"
                      title="What this turn cost (Claude, all steps)"
                      >{{ usd(m.costUsd) }}</span
                    >
                    <!-- The proxy (and replies saved before Claude): the model that wrote it. -->
                    <span
                      v-else-if="!isStreamingMsg(m.id) && !m.agent && !onAureon"
                      class="ai-meta__model"
                      data-testid="reply-model"
                      :title="m.model || 'The server did not report the model'"
                      >{{ m.model ? aiModelLabel(m.model) : 'Model not reported' }}</span
                    >
                    <span
                      v-if="!isStreamingMsg(m.id) && msgTokens(m)"
                      class="ai-meta__tok"
                      :title="tokenTitle(m)"
                      >{{ msgTokens(m).toLocaleString() }} tok</span
                    >
                    <span
                      v-if="!isStreamingMsg(m.id) && m.usedData && !isMobile"
                      class="ai-meta__data"
                    >
                      <Icon name="database" size="xs" />From your data
                    </span>
                    <IconButton
                      v-if="!isStreamingMsg(m.id) && !isMobile"
                      class="ai-meta__copy"
                      :class="{ 'is-shown': copiedId === m.id }"
                      size="sm"
                      :label="copiedId === m.id ? 'Copied' : 'Copy reply'"
                      @click="copyMsg(m)"
                    >
                      <Transition name="ai-swap" mode="out-in">
                        <Icon
                          :key="copiedId === m.id ? 'ok' : 'copy'"
                          :name="copiedId === m.id ? 'check' : 'copy'"
                          size="xs"
                        />
                      </Transition>
                    </IconButton>
                    <IconButton
                      v-if="canSpeak && m.content.trim()"
                      class="ai-meta__copy"
                      :class="{ 'is-shown': speakingId === m.id }"
                      size="sm"
                      :active="speakingId === m.id"
                      :label="speakingId === m.id ? 'Stop reading' : 'Read aloud'"
                      @click="toggleSpeak(m)"
                    >
                      <Transition name="ai-swap" mode="out-in">
                        <Icon
                          :key="speakingId === m.id ? 'stop' : 'speak'"
                          :name="speakingId === m.id ? 'square' : 'volume-2'"
                          size="xs"
                        />
                      </Transition>
                    </IconButton>
                  </div>

                  <div
                    v-if="!isStreamingMsg(m.id) && m.content.trim()"
                    class="ai-actions"
                    :class="{ 'is-latest': m.id === lastAssistantId }"
                    role="group"
                    aria-label="Add from this reply"
                  >
                    <span class="ai-actions__label">Add to</span>
                    <button
                      v-for="(k, ki) in AI_ACTION_KINDS"
                      :key="k"
                      type="button"
                      class="ai-action"
                      :class="{ 'is-suggested': suggestedKinds(m).includes(k) }"
                      :style="{ '--i': ki }"
                      @click="openAction(m, k)"
                    >
                      <Icon :name="AI_ACTION_META[k].icon" size="xs" />{{ AI_ACTION_META[k].label }}
                    </button>
                  </div>

                  <div v-if="followupsOf(m).length" class="ai-followups">
                    <button
                      v-for="(f, fi) in followupsOf(m)"
                      :key="f"
                      type="button"
                      class="ai-chip ai-chip--follow"
                      :style="{ '--i': fi }"
                      :disabled="!isOnline"
                      @click="send(f)"
                    >
                      <Icon v-if="!isMobile" name="corner-down-right" size="xs" />{{ f }}
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </Transition>

        <!-- The item the chat works on: its sub-items, live, with what the
             chat just added marked new; what is discussed next lands under it. -->
        <div v-if="!onAureon && working" class="ai-work" aria-label="Working on">
          <div class="ai-work__head">
            <Icon
              :name="working.collection === 'tasks' ? 'list-checks' : 'check-square'"
              size="sm"
            />
            <span class="ai-work__label">Working on</span>
            <button type="button" class="ai-work__title" title="Open it" @click="openWorking">
              {{ working.title }}
            </button>
            <span class="ai-work__count"
              >{{ working.children.length }}
              {{ working.collection === 'tasks' ? 'subtask' : 'sub-todo'
              }}{{ working.children.length === 1 ? '' : 's' }}</span
            >
            <button
              type="button"
              class="ai-work__x"
              aria-label="Change the item"
              title="Pick another"
              @click="focusPickerOpen = true"
            >
              <Icon name="pencil" size="xs" />
            </button>
            <button
              type="button"
              class="ai-work__x"
              aria-label="Stop working on it"
              title="Stop working on it"
              @click="ai.setFocus(null)"
            >
              <Icon name="x" size="xs" />
            </button>
          </div>
          <ul v-if="working.children.length" class="ai-work__kids">
            <li
              v-for="c in shownKids"
              :key="c.id"
              class="ai-work__kid"
              :class="{ 'is-done': c.done, 'is-fresh': c.fresh }"
            >
              <Icon :name="c.done ? 'check' : 'corner-down-right'" size="xs" />
              <span class="ai-work__kid-text">{{ c.title }}</span>
              <span v-if="c.fresh" class="ai-work__new">new</span>
            </li>
          </ul>
          <p v-else class="ai-work__empty">Nothing under it yet — ask the AI to break it down.</p>
          <div class="ai-work__actions">
            <button
              v-if="working.children.length > WORKING_SHOWN"
              type="button"
              class="ai-chip"
              @click="workingKids = !workingKids"
            >
              {{ workingKids ? 'Show fewer' : `Show all ${working.children.length}` }}
            </button>
            <button
              type="button"
              class="ai-chip"
              :disabled="streaming || !isOnline"
              @click="askAboutWorking('split')"
            >
              Break it down
            </button>
            <button
              type="button"
              class="ai-chip"
              :disabled="streaming || !isOnline"
              @click="askAboutWorking('missing')"
            >
              What’s missing?
            </button>
          </div>
        </div>
        <button
          v-else-if="!onAureon"
          type="button"
          class="ai-work-pick"
          @click="focusPickerOpen = true"
        >
          <Icon name="corner-down-right" size="xs" /> Work on an existing todo or task…
        </button>

        <!-- composer -->
        <!-- The whole card is the field: no border of its own or round the box.
             While a reply streams the next message can be typed but waits — the
             spinner holds its place, and a tap on it stops the reply. -->
        <div class="ai-composer" :class="{ 'is-busy': streaming }" @click="focusComposer">
          <TextArea
            ref="composerRef"
            class="ai-composer__field"
            :model-value="text"
            :disabled="!isOnline"
            :placeholder="
              !isOnline
                ? 'AI needs internet'
                : streaming
                  ? 'Aureon is replying — your next message will wait…'
                  : 'Message…'
            "
            :rows="isMobile ? 1 : 2"
            max-height="30vh"
            @update:model-value="text = $event"
            @keydown="onComposerKey"
          />
          <button
            v-if="mic.supported"
            type="button"
            class="ai-mic"
            :class="{ 'is-on': mic.listening.value }"
            :aria-pressed="mic.listening.value"
            :aria-label="mic.listening.value ? 'Stop dictating' : 'Dictate'"
            :title="mic.listening.value ? 'Listening — click to stop' : 'Speak your message'"
            :disabled="!isOnline"
            @click.stop="toggleMic"
          >
            <Icon :name="mic.listening.value ? 'mic-off' : 'mic'" />
          </button>
          <Transition name="ai-swap" mode="out-in">
            <button
              v-if="streaming"
              key="stop"
              type="button"
              class="ai-send is-stop"
              aria-label="Replying — stop"
              title="Replying — click to stop"
              @click="ai.stop()"
            >
              <ProgressRing indeterminate hide-value :size="28" :stroke="2.5" />
              <Icon class="ai-send__stop" name="square" size="xs" />
            </button>
            <button
              v-else-if="text.trim() && isOnline"
              key="enter"
              type="button"
              class="ai-send"
              aria-label="Send (Enter)"
              title="Send (Enter)"
              @click="send()"
            >
              <Icon name="corner-down-left" />
            </button>
          </Transition>
        </div>
        <div v-if="!isMobile" class="ai-hint">
          <span>{{
            streaming
              ? 'Waiting for the reply — Enter sends once it lands'
              : 'Enter to send · Shift+Enter for a new line'
          }}</span>
          <span v-if="onAureon"
            >Claude reads your data through Aureon’s tools, never your keys</span
          >
          <span v-else-if="aiUseData"
            >Sends ≈{{ ctxTokens }} tokens of your data with each turn</span
          >
          <span v-else>Your data is not sent</span>
        </div>
      </section>

      <!-- what Aureon sees -->
      <Transition name="ai-ctx">
        <aside
          v-if="!onAureon && !isMobile && ctxOpen"
          class="ai-ctx"
          aria-label="What Aureon sees"
        >
          <h2 class="ai-ctx__title">What Aureon sees</h2>
          <p class="ai-ctx__lead">
            Built fresh from your data each turn and capped at about 2k tokens.
          </p>
          <div class="ai-ctx__sent" :class="{ 'is-off': !aiUseData }">
            <Icon name="database" size="xs" />
            <span class="ai-ctx__sent-label">{{
              aiUseData ? 'Sent with each message' : 'Not sent — Use my data is off'
            }}</span>
            <span class="ai-ctx__sent-tok">≈{{ ctxTokens }} tokens</span>
          </div>
          <ScrollArrows :target="ctxScrollRef" />
          <div ref="ctxScrollRef" class="ai-ctx__scroll scroll-arrows-target">
            <section
              v-for="(s, si) in ctxSections"
              :key="s.key"
              class="ai-ctx__card"
              :style="{ '--i': si }"
            >
              <h3 class="ai-ctx__head">
                <Icon :name="CTX_ICONS[s.key]" size="xs" />
                <span class="ai-ctx__name">{{ s.title }}</span>
                <span class="ai-ctx__count">{{ s.lines.length }}</span>
              </h3>
              <ul class="ai-ctx__lines">
                <li v-for="(l, li) in s.lines" :key="li">- {{ l }}</li>
              </ul>
            </section>
          </div>
        </aside>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.ai {
  display: flex;
  gap: var(--sp-3);
  flex: 1;
  min-height: 0;
  min-width: 0;
  align-items: stretch;
}

/* ---- chat list ---- */
.ai-list {
  position: relative; /* the box ScrollArrows lines up in */
  width: 268px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 0;
  padding: var(--sp-2) var(--sp-1) 0;
}
.ai--phone .ai-list {
  width: auto;
  flex: 1;
  min-width: 0;
}
.ai-list__title {
  margin: 0;
  font-size: var(--text-xl);
  line-height: var(--lh-xl);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ai-list__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* A group heading is the button that folds it. */
.ai-list__group {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: var(--sp-3) var(--sp-2) var(--sp-1);
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-dim);
  text-align: left;
  cursor: pointer;
}
.ai-list__group:hover {
  color: var(--theme-text);
}
.ai-list__fold {
  flex-shrink: 0;
  transition: transform var(--dur-fast, 0.15s) ease;
}
.ai-list__fold.is-folded {
  transform: rotate(-90deg);
}
.ai-list__group-n {
  margin-left: auto;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
/* "Chats" and the button that hides the pane, on one line. */
.ai-list__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.ai-list__empty {
  padding: var(--sp-2);
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ai-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: var(--sp-2) var(--sp-1) var(--sp-2) var(--sp-3);
  border-radius: var(--radius-card);
  cursor: pointer;
}
.ai-row:hover {
  background: var(--glass-control);
}
.ai-row.is-active {
  background: var(--theme-card, var(--glass-card));
  box-shadow: var(--layer-raised-shadow, none);
}
.ai-row__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ai-row__title,
.ai-row__preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-row__title {
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ai-row__preview {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
}
.ai-row__pinned {
  color: var(--theme-accent);
}

/* ---- thread ---- */
.ai-main {
  position: relative; /* the box ScrollArrows lines up in */
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-dialog);
  background: var(--theme-card, var(--glass-card));
  border: 1px solid var(--glass-border);
  overflow: hidden;
}
.ai--phone .ai-main {
  background: transparent;
  border: none;
  border-radius: 0;
}
.ai-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--glass-border);
  flex-wrap: wrap;
  min-width: 0;
}
.ai-head--phone {
  flex-wrap: nowrap;
  padding: var(--sp-1) 0 var(--sp-2);
  border-bottom: none;
}
.ai-head__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ai-head__titles--center {
  align-items: center;
  text-align: center;
}
.ai-head__title {
  margin: 0;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-md);
  line-height: var(--lh-md);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ai-head__meta {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
}
/* The model's name under the phone title (the picker is in the bar below). */
.ai-head__model {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-text);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.ai-head__model :deep(svg) {
  color: var(--theme-accent);
}
/* Provider switch and model picker, a slim row under the header. */
.ai-modelbar {
  padding: var(--sp-2) var(--sp-4);
  border-bottom: 1px solid var(--glass-border);
  min-width: 0;
}
.ai--phone .ai-modelbar {
  padding: 0 0 var(--sp-2);
  border-bottom: none;
}
.ai-head__ctx.is-active {
  background: color-mix(in oklch, var(--theme-accent) 22%, transparent);
  border-color: transparent;
  color: var(--theme-accent);
}
.ai-head__model--bare {
  padding: 0;
  background: transparent;
  color: var(--theme-accent);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
}

.ai-datapill {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  margin-bottom: var(--sp-2);
  padding: var(--sp-1) var(--sp-3);
  border: none;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.ai-datapill.is-off {
  background: var(--glass-control);
  color: var(--theme-dim);
}

.ai-thread {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-5) var(--sp-5) var(--sp-4);
}
.ai--phone .ai-thread {
  padding: var(--sp-3) var(--sp-1);
  gap: var(--sp-4);
}

.ai-user {
  display: flex;
  justify-content: flex-end;
}
.ai-user__bubble {
  max-width: 78%;
  min-width: 0;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-dialog);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font-size: var(--text-base);
  line-height: var(--lh-base);
  font-weight: var(--weight-medium);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: 0 6px 16px color-mix(in oklch, var(--theme-accent) 28%, transparent);
}

.ai-reply {
  display: flex;
  gap: var(--sp-3);
  min-width: 0;
  max-width: 760px;
}
.ai-reply__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.ai-reply__text {
  min-width: 0;
  font-size: var(--text-base);
  line-height: var(--lh-base);
  color: var(--theme-text);
  overflow-wrap: anywhere;
}
/* The rendered Markdown: quiet, evenly spaced, no stray margins at the ends. */
.ai-reply__text :deep(p),
.ai-reply__text :deep(ul),
.ai-reply__text :deep(ol),
.ai-reply__text :deep(pre),
.ai-reply__text :deep(blockquote) {
  margin: 0 0 var(--sp-3);
}
.ai-reply__text :deep(> :last-child) {
  margin-bottom: 0;
}
.ai-reply__text :deep(ul),
.ai-reply__text :deep(ol) {
  padding-left: var(--sp-5);
}
.ai-reply__text :deep(li) {
  margin: var(--sp-1) 0;
}
.ai-reply__text :deep(li::marker) {
  color: var(--theme-accent);
}
.ai-reply__text :deep(strong) {
  font-weight: var(--weight-semibold);
}
.ai-reply__text :deep(h3),
.ai-reply__text :deep(h4),
.ai-reply__text :deep(h5),
.ai-reply__text :deep(h6) {
  margin: var(--sp-2) 0 var(--sp-1);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
}
.ai-reply__text :deep(code) {
  padding: 1px 5px;
  border-radius: var(--radius-control);
  background: var(--glass-control);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
.ai-reply__text :deep(pre) {
  padding: var(--sp-3);
  border-radius: var(--radius-card);
  background: var(--glass-control);
  overflow-x: auto;
}
.ai-reply__text :deep(pre code) {
  padding: 0;
  background: none;
}
.ai-reply__text :deep(a) {
  color: var(--theme-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ai-reply__text :deep(blockquote) {
  padding-left: var(--sp-3);
  border-left: 2px solid var(--glass-border);
  color: var(--theme-dim);
}
.ai-avatar {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-top: -3px;
  border-radius: 50%;
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: 0 4px 12px color-mix(in oklch, var(--theme-accent) 35%, transparent);
}
.ai-avatar--lg {
  width: 56px;
  height: 56px;
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: 0 0 0 6px color-mix(in oklch, var(--theme-accent) 16%, transparent);
}
.ai-cursor {
  display: inline-block;
  width: 7px;
  height: 1.1em;
  background: var(--theme-text);
}

.ai-plan {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-2);
  border-radius: var(--radius-dialog);
  border: 1px solid var(--glass-border);
  background: var(--glass-control);
}
.ai-plan__steps {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ai-plan__step {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-2);
  min-width: 0;
}
.ai-plan__ring {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--theme-dim);
}
.ai-plan__text {
  flex: 1;
  min-width: 0;
  font-size: var(--text-base);
  line-height: var(--lh-base);
  color: var(--theme-text);
  overflow-wrap: anywhere;
}
/* The step's details — what the created item's description will hold. */
.ai-plan__notes {
  display: block;
  margin-top: 2px;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
  white-space: pre-wrap;
}
/* An update naming an item that no longer exists: shown, never applied. */
.ai-plan__step.is-missing {
  opacity: 0.5;
}
/* New-item card: a heading, a kind chip per row, sub-points under each. */
.ai-create__head {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  margin: 0 0 var(--sp-2);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.ai-create__row {
  align-items: flex-start;
}
.ai-create__row.is-off .ai-plan__text {
  opacity: 0.45;
}
.ai-create__kind {
  display: inline-block;
  margin-right: 4px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
  vertical-align: 1px;
}
.ai-create__kind[data-kind='goal'] {
  background: color-mix(in oklch, var(--theme-success, #3fb950) 18%, transparent);
  color: var(--theme-success, #3fb950);
}
.ai-create__meta {
  display: block;
  margin-top: 2px;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ai-create__subs {
  margin: 4px 0 0;
  padding-left: 1.1em;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ai-plan__mins {
  flex-shrink: 0;
  padding: 1px var(--sp-2);
  border-radius: var(--radius-pill);
  background: var(--theme-card, var(--glass-card));
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
  font-variant-numeric: tabular-nums;
}
.ai-plan__add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border: none;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: 0 6px 16px color-mix(in oklch, var(--theme-accent) 30%, transparent);
  font: inherit;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.ai-plan__add:hover:not(:disabled) {
  filter: brightness(1.06);
}
.ai-plan__add:disabled {
  cursor: default;
  background: color-mix(in oklch, var(--theme-accent) 22%, transparent);
  color: var(--theme-text);
  box-shadow: none;
}

/* Per the mockup: model pill · tokens · "From your data" · copy, all visible. */
.ai-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-3);
  min-height: 28px;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
}
/* "Made from this reply": chips that open a quick look. */
.ai-made {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: var(--sp-2);
  min-width: 0;
}
.ai-made__chip,
.ai-made__all {
  border: 0;
  font: inherit;
  font-size: var(--text-2xs);
  cursor: pointer;
}
.ai-made__kind {
  flex-shrink: 0;
  font-weight: var(--weight-semibold);
  color: var(--theme-accent);
}
.ai-made__all {
  background: transparent;
  color: var(--theme-dim);
  text-decoration: underline;
}
/* "Read from" chips: the pages a reply used. */
.ai-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: var(--sp-2);
  min-width: 0;
}
.ai-sources__label {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ai-source {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 260px;
  min-width: 0;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  text-decoration: none;
}
.ai-source:hover {
  background: color-mix(in oklch, var(--theme-accent) 20%, transparent);
}
.ai-source.is-failed {
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
  color: var(--theme-dim);
}
.ai-source__name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ai-meta__model {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
  font-weight: var(--weight-semibold);
}
/* The agent that answered on Aureon (Claude): Investments, Business, General. */
.ai-meta__route {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--text-secondary) 14%, transparent);
  color: var(--text-secondary);
}
.ai-meta__route.is-external {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--theme-accent);
  color: var(--text-primary);
  font-weight: var(--weight-semibold);
}
/* A write the agent asked for (POST /api/ai/approvals): a kit GlassPanel with a
   warning Badge, inline under the reply, and a way to review it. */
.ai-approval {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  margin: var(--sp-2) 0;
}
.ai-approval__summary {
  flex: 1 1 14rem;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.ai-approval__link {
  flex: none;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-accent);
  text-decoration: none;
}
.ai-approval__link:hover,
.ai-approval__link:focus-visible {
  text-decoration: underline;
}
.ai-meta__tok {
  font-variant-numeric: tabular-nums;
  cursor: help;
}
.ai-meta__data {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
.ai-meta__data :deep(svg) {
  color: var(--theme-accent);
}

/* "Add to" — quiet until hovered, so a long thread is not a wall of buttons;
   the latest reply's bar is always visible. A kind the model suggested wears
   the accent. */
.ai-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin-top: calc(var(--sp-1) * -1);
  opacity: 0.55;
  transition: opacity var(--dur-med) var(--ease-out);
}
.ai-actions.is-latest,
.ai-reply:hover .ai-actions,
.ai-actions:focus-within {
  opacity: 1;
}
.ai-actions__label {
  margin-right: var(--sp-1);
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ai-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.ai-action :deep(svg) {
  color: var(--theme-accent);
}
.ai-action:hover {
  border-color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 10%, transparent);
}
.ai-action:active {
  transform: scale(0.96);
}
.ai-action.is-suggested {
  border-color: transparent;
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  font-weight: var(--weight-semibold);
}
.ai-reply.is-new .ai-actions.is-latest .ai-action {
  animation: ai-rise var(--dur-slide) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 40ms + 80ms);
}
.ai--phone .ai-actions {
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  opacity: 1;
}
.ai--phone .ai-action {
  flex-shrink: 0;
  padding: var(--sp-1) var(--sp-3);
}
.ai-followups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.ai--phone .ai-followups {
  flex-direction: column;
  align-items: flex-start;
}

.ai-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: var(--theme-card, var(--glass-card));
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
}
.ai-chip:hover:not(:disabled) {
  border-color: var(--theme-accent);
}
.ai-chip--follow :deep(svg) {
  color: var(--theme-accent);
}

.ai-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  padding: var(--sp-4);
  text-align: center;
}
.ai-empty__lead {
  margin: 0;
  font-size: var(--text-base);
  color: var(--theme-dim);
}
.ai-empty__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--sp-2);
  max-width: 460px;
}

/* ---- "Working on": the picked todo or task, above the composer ---- */
.ai-work {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin-bottom: var(--sp-2);
  padding: 10px 12px;
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-accent) 9%, transparent);
  border: 1px solid color-mix(in oklch, var(--theme-accent) 25%, transparent);
}
.ai-work__head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--theme-accent);
}
.ai-work__label {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.ai-work__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: none;
  color: var(--theme-text);
  font: inherit;
  font-weight: var(--weight-semibold);
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}
.ai-work__title:hover {
  text-decoration: underline;
}
.ai-work__count {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
.ai-work__x {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.ai-work__x:hover {
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
}
.ai-work__kids {
  list-style: none;
  margin: 0;
  padding: 0 0 0 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 28vh;
  overflow-y: auto;
}
.ai-work__kid {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-text);
}
.ai-work__kid :deep(svg) {
  flex-shrink: 0;
  color: var(--theme-dim);
}
.ai-work__kid-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.ai-work__kid.is-done .ai-work__kid-text {
  text-decoration: line-through;
  color: var(--theme-dim);
}
.ai-work__kid.is-fresh .ai-work__kid-text {
  font-weight: var(--weight-semibold);
}
.ai-work__new {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.ai-work__empty {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ai-work__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ai-work-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin-bottom: var(--sp-2);
  padding: 4px 10px;
  border: 1px dashed color-mix(in oklch, var(--theme-text) 20%, transparent);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}
.ai-work-pick:hover {
  color: var(--theme-text);
  border-color: var(--theme-accent);
}

/* ---- composer ---- */
/* One borderless card that is the text field — no outline on the card or on
   the box inside it, focused or not. */
.ai-composer {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-2);
  min-height: 56px;
  margin: 0 var(--sp-4);
  padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-1);
  border-radius: var(--radius-dialog);
  border: none;
  background: var(--theme-input, var(--glass-control));
  cursor: text;
}
.ai--phone .ai-composer {
  margin: 0;
  min-height: 48px;
  border-radius: var(--radius-pill);
  align-items: center;
}
.ai-composer__field {
  flex: 1;
  min-width: 0;
}
.ai-composer__field :deep(.ui-control),
.ai-composer__field :deep(.ui-control:hover),
.ai-composer__field :deep(.ui-control:focus-within) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  outline: none;
}
.ai-composer__field :deep(textarea:focus),
.ai-composer__field :deep(textarea:focus-visible) {
  outline: none;
}
.ai-send {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  cursor: pointer;
}
.ai-send:disabled {
  opacity: 0.45;
  cursor: default;
}
/* The mic: a quiet round button beside Send; listening, it fills and pulses. */
.ai-mic {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-text);
  cursor: pointer;
}
.ai-mic:hover {
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
}
.ai-mic:disabled {
  opacity: 0.45;
  cursor: default;
}
.ai-mic.is-on {
  background: var(--theme-danger, #e5484d);
  color: #fff;
  animation: aiMicPulse 1.4s ease-in-out infinite;
}
@keyframes aiMicPulse {
  50% {
    box-shadow: 0 0 0 6px color-mix(in oklch, var(--theme-danger, #e5484d) 25%, transparent);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-mic.is-on {
    animation: none;
  }
}
/* Replying: a spinning ring with a stop square in its middle. */
.ai-send.is-stop {
  position: relative;
  background: transparent;
  color: var(--theme-accent);
}
.ai-send.is-stop > * {
  grid-area: 1 / 1;
}
.ai-thinking {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.ai-row__busy {
  flex-shrink: 0;
  margin: 0 var(--sp-1);
  color: var(--theme-accent);
}
.ai-hint {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  padding: var(--sp-2) var(--sp-4) var(--sp-3);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
}
.ai--phone .ai-hint {
  display: none;
}

/* ---- what Aureon sees ---- */
.ai-ctx {
  position: relative; /* the box ScrollArrows lines up in */
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 0;
  padding: var(--sp-2) var(--sp-1) 0;
}
.ai-ctx__title {
  margin: 0;
  font-size: var(--text-md);
  line-height: var(--lh-md);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ai-ctx__lead {
  margin: calc(var(--sp-2) * -1) 0 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-dim);
}
.ai-ctx__sent {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-accent);
}
.ai-ctx__sent.is-off {
  background: var(--glass-control);
  color: var(--theme-dim);
}
.ai-ctx__sent-label {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ai-ctx__sent-tok {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ai-ctx__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-bottom: var(--sp-3);
}
.ai-ctx__card {
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-dialog);
  border: 1px solid transparent;
  background: var(--theme-card, var(--glass-card));
  box-shadow: var(--layer-raised-shadow, none);
}
.ai-ctx__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: 0 0 var(--sp-2);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.ai-ctx__head :deep(svg) {
  color: var(--theme-accent);
}
.ai-ctx__name {
  flex: 1;
  min-width: 0;
}
.ai-ctx__count {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
.ai-ctx__lines {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--lh-sm);
  color: var(--theme-dim);
}
.ai-ctx__lines li {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* The context pane is the first thing to give up its width. */
@media (max-width: 1180px) {
  .ai-ctx,
  .ai-head__ctx {
    display: none;
  }
}
@media (max-width: 900px) {
  .ai-list {
    width: 220px;
  }
}
/* ---- motion ----
   Every duration is a token, and the tokens go to 0ms under reduced motion, so
   each of these collapses to an instant change without a rule of its own. */

/* A new turn: yours rises from the composer, the reply eases up after it. */
.ai-user.is-new .ai-user__bubble {
  transform-origin: 100% 100%;
  animation: ai-bubble-in var(--dur-pop) var(--ease-spring) both;
}
.ai-reply.is-new {
  animation: ai-rise var(--dur-slide) var(--ease-out) 80ms both;
}
.ai-reply.is-new .ai-avatar {
  animation: ai-pop var(--dur-pop) var(--ease-pop) 80ms both;
}
/* Parts that mount mid-reply — the plan card when its block closes, the meta
   and follow-ups when it finishes — each arrive rather than appear. */
.ai-reply.is-new .ai-plan {
  animation: ai-rise var(--dur-slide) var(--ease-out) both;
}
.ai-reply.is-new .ai-plan__step {
  animation: ai-rise var(--dur-slide) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 60ms + 80ms);
}
.ai-reply.is-new .ai-plan__add {
  animation: ai-rise var(--dur-slide) var(--ease-out) 260ms both;
}
.ai-reply.is-new .ai-meta {
  animation: ai-fade var(--dur-slide) var(--ease-out) both;
}
.ai-reply.is-new .ai-chip--follow {
  animation: ai-rise var(--dur-slide) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 70ms + 120ms);
}
.ai-reply.is-new .ai-reply__text {
  animation: ai-fade var(--dur-med) var(--ease-out) both;
}

/* The reply cursor breathes rather than blinks. */
.ai-cursor {
  border-radius: 2px;
  animation: ai-breathe-cursor 1.1s ease-in-out infinite;
}

/* Plan: once added, each ring fills in turn. */
.ai-plan__ring {
  display: grid;
  place-items: center;
  color: transparent;
  transition:
    background var(--dur-med) var(--ease-out),
    border-color var(--dur-med) var(--ease-out),
    color var(--dur-med) var(--ease-out),
    transform var(--dur-pop) var(--ease-pop);
  transition-delay: calc(var(--i, 0) * 70ms);
}
.ai-plan.is-applied .ai-plan__ring {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-on-accent);
  transform: scale(1.08);
}
.ai-plan.is-applied .ai-plan__text {
  color: var(--theme-dim);
  transition: color var(--dur-med) var(--ease-out);
}
.ai-plan__label {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}
.ai-plan__add {
  transition:
    filter var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out),
    background var(--dur-med) var(--ease-out),
    color var(--dur-med) var(--ease-out);
}
.ai-plan__add:active:not(:disabled) {
  transform: scale(0.98);
}

/* Press feedback on every tappable pill. */
.ai-chip {
  transition:
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.ai-chip:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px color-mix(in oklch, var(--theme-accent) 18%, transparent);
}
.ai-chip:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
}
.ai-empty .ai-chip {
  animation: ai-rise var(--dur-slide) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 60ms + 120ms);
}
.ai-empty .ai-avatar--lg {
  animation:
    ai-pop var(--dur-pop) var(--ease-pop) both,
    breathe 5s ease-in-out var(--dur-pop) infinite;
}
.ai-empty__lead {
  animation: ai-fade var(--dur-slide) var(--ease-out) 60ms both;
}

.ai-send {
  transition:
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.ai-send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px color-mix(in oklch, var(--theme-accent) 35%, transparent);
}
.ai-send:active:not(:disabled) {
  transform: scale(0.92);
}
.ai-datapill {
  transition:
    background var(--dur-med) var(--ease-out),
    color var(--dur-med) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.ai-datapill:active {
  transform: scale(0.96);
}
.ai-ctx__sent {
  transition:
    background var(--dur-med) var(--ease-out),
    color var(--dur-med) var(--ease-out);
}

/* Chat list: the active bar grows in; rows slide when pinning reorders them. */
.ai-row {
  transition:
    background var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-med) var(--ease-out);
}
.ai-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 25%;
  bottom: 25%;
  width: 3px;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
  transform: scaleY(0);
  transition: transform var(--dur-pop) var(--ease-spring);
}
.ai-row.is-active::before {
  transform: scaleY(1);
}
.ai-list__rows {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ai-rows-move {
  transition: transform var(--dur-slide) var(--ease-sheet);
}
.ai-rows-enter-active {
  transition:
    opacity var(--dur-slide) var(--ease-out),
    transform var(--dur-slide) var(--ease-out);
}
.ai-rows-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  transition:
    opacity var(--dur-med) var(--ease-out),
    transform var(--dur-med) var(--ease-out);
}
.ai-rows-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.ai-rows-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

/* Switching chats crossfades the thread and the header titles. */
.ai-fade-enter-active,
.ai-fade-leave-active {
  transition:
    opacity var(--dur-med) var(--ease-out),
    transform var(--dur-med) var(--ease-out);
}
.ai-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.ai-fade-leave-to {
  opacity: 0;
}

/* Send ↔ Stop, copy ↔ copied, Add ↔ Added. */
.ai-swap-enter-active,
.ai-swap-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur-pop) var(--ease-pop);
}
.ai-swap-leave-active {
  transition-duration: var(--dur-fast);
}
.ai-swap-enter-from,
.ai-swap-leave-to {
  opacity: 0;
  transform: scale(0.6);
}

/* The context pane slides in from the right; its negative margin lets the
   thread widen and narrow with it instead of jumping. */
/* The chat history pane slides off to the left the same way. */
.ai:not(.ai--phone) .ai-listpane-enter-active,
.ai:not(.ai--phone) .ai-listpane-leave-active {
  transition:
    opacity var(--dur-slide) var(--ease-sheet),
    transform var(--dur-slide) var(--ease-sheet),
    margin-left var(--dur-slide) var(--ease-sheet);
}
.ai:not(.ai--phone) .ai-listpane-enter-from,
.ai:not(.ai--phone) .ai-listpane-leave-to {
  opacity: 0;
  transform: translateX(-24px);
  margin-left: calc(-268px - var(--sp-3));
}
@media (prefers-reduced-motion: reduce) {
  .ai:not(.ai--phone) .ai-listpane-enter-active,
  .ai:not(.ai--phone) .ai-listpane-leave-active,
  .ai-list__fold {
    transition: none;
  }
}
.ai-ctx-enter-active,
.ai-ctx-leave-active {
  transition:
    opacity var(--dur-slide) var(--ease-sheet),
    transform var(--dur-slide) var(--ease-sheet),
    margin-right var(--dur-slide) var(--ease-sheet);
}
.ai-ctx-enter-from,
.ai-ctx-leave-to {
  opacity: 0;
  transform: translateX(24px);
  margin-right: calc(-300px - var(--sp-3));
}
.ai-ctx-enter-active .ai-ctx__card {
  animation: ai-rise var(--dur-slide) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 45ms + 120ms);
}

/* Phone: the list comes in from the left, a thread from the right. */
.ai--phone .ai-list {
  animation: ai-from-left var(--dur-slide) var(--ease-sheet) both;
}
.ai--phone .ai-main {
  animation: ai-from-right var(--dur-slide) var(--ease-sheet) both;
}

@keyframes ai-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes ai-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes ai-bubble-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.92);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes ai-pop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes ai-from-left {
  from {
    opacity: 0;
    transform: translateX(-24px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes ai-from-right {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes ai-breathe-cursor {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-avatar--lg,
  .ai-empty .ai-avatar--lg,
  .ai-cursor {
    animation: none;
  }
}
</style>
