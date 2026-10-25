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
import {
  aiContextInput,
  resolvePlanTarget,
  resolveUpdateTarget,
  useAiChat,
  type AiCreated,
} from '@/composables/useAiChat'
import AiCreatedDialog from '@/components/AiCreatedDialog.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import { AI_PROVIDERS, aiModelLabel, type AiChat, type AiMessage } from '@/types'
import { chatTarget } from '@/utils/aiSettings'
import AiModelPicker from '@/components/AiModelPicker.vue'
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
  type AiPlan,
  type AiUpdateKind,
} from '@/utils/ai'
import { renderMarkdown } from '@/utils/markdown'

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
const showList = computed(() => !isMobile.value || mobilePane.value === 'list')
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
const form = ref<Record<string, unknown>>({ text: '' })
const draftId = computed(() => aiActiveChatId.value)
useDraft('aiChat', draftId, form, {
  isEmpty: (p) => !String(p.text ?? '').trim(),
})
const text = computed({
  get: () => String(form.value.text ?? ''),
  set: (v: string) => (form.value = { ...form.value, text: v }),
})

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
// The provider and model are picked in the bar under the header
// (AiModelPicker); the phone header repeats the model's name.
const chosenLabel = computed(() => aiModelLabel(chatTarget().model))
const modelTitle = computed(() => {
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
function planLabel(plan: AiPlan): string {
  const n = plan.steps.length
  const target = resolvePlanTarget(app, plan)
  return target
    ? `Add ${n} subtask${n === 1 ? '' : 's'} to ${target.label}`
    : `Add ${n} todo${n === 1 ? '' : 's'}`
}
function planApplied(m: AiMessage, idx: number): boolean {
  return (m.appliedPlans ?? []).includes(idx)
}
function addPlan(m: AiMessage, idx: number, plan: AiPlan) {
  if (!activeAiChat.value || planApplied(m, idx)) return
  ai.applyPlan(activeAiChat.value.id, m.id, idx, plan)
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
const NEW_KIND_LABEL: Record<AiNewKind, string> = { todo: 'Todo', task: 'Task', goal: 'Goal' }
const NEW_SUB_LABEL: Record<AiNewKind, string> = {
  todo: 'sub-todo',
  task: 'subtask',
  goal: 'step',
}
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
  if (it.due) parts.push(it.kind === 'goal' ? `target ${it.due}` : `due ${it.due}`)
  if (it.tag) parts.push(`#${it.tag}`)
  const n = it.items?.length ?? 0
  if (n) parts.push(`${n} ${NEW_SUB_LABEL[it.kind]}${n === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

const created = ref<{ chatId: number; msgId: number; idx: number; items: AiCreated[] } | null>(null)
const createdOpen = ref(false)
function runCreate(m: AiMessage, idx: number, items: AiNewItem[]) {
  const chat = activeAiChat.value
  if (!chat || createApplied(m, idx)) return
  const made = ai.createItems(chat.id, m.id, idx, tickedItems(m, idx, items))
  if (!made.length) return
  created.value = { chatId: chat.id, msgId: m.id, idx, items: made }
  createdOpen.value = true
}
function undoCreate() {
  const c = created.value
  createdOpen.value = false
  if (!c) return
  ai.undoCreated(c.chatId, c.msgId, c.idx, c.items)
  created.value = null
  app.showToastMsg('Removed the new items')
}

// --- add from a reply ---------------------------------------------------------
const action = ref<{ kind: AiActionKind; reply: string } | null>(null)
function openAction(m: AiMessage, kind: AiActionKind) {
  action.value = { kind, reply: m.content }
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
      @close="action = null"
    />
    <AiTypoFixDialog :open="typoOpen" @close="typoOpen = false" />
    <AiCreatedDialog
      :open="createdOpen"
      :created="created?.items ?? []"
      @close="createdOpen = false"
      @undo="undoCreate"
    />
    <div class="ai" :class="{ 'ai--phone': isMobile }">
      <!-- chat list -->
      <aside v-if="showList" class="ai-list" aria-label="Chats">
        <h2 class="ai-list__title">Chats</h2>
        <SearchField v-model="search" placeholder="Search chats" size="md" label="Search chats" />
        <div class="ai-list__scroll">
          <template v-for="g in groupedChats" :key="g.label">
            <div class="ai-list__group">{{ g.label }}</div>
            <TransitionGroup tag="div" name="ai-rows" class="ai-list__rows">
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
          <Transition name="ai-fade" mode="out-in">
            <div :key="aiActiveChatId ?? 'none'" class="ai-head__titles">
              <h2 class="ai-head__title">{{ activeAiChat?.title ?? 'New chat' }}</h2>
              <span class="ai-head__meta">{{ threadMeta }}</span>
            </div>
          </Transition>
          <Switch
            :model-value="aiUseData"
            label="Use my data"
            @update:model-value="app.setAiUseData($event)"
          />
          <IconButton
            variant="outline"
            label="Fix typos in my items"
            :disabled="!isOnline"
            @click="typoOpen = true"
          >
            <Icon name="spell-check" />
          </IconButton>
          <IconButton
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
          <AiModelPicker :disabled="streaming" />
        </div>

        <button
          v-if="isMobile"
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

        <Transition name="ai-fade" mode="out-in" @enter="scrollToEnd(false)">
          <div
            v-if="!activeAiChat || !activeAiChat.messages.length"
            :key="'empty-' + (aiActiveChatId ?? 'none')"
            class="ai-empty"
          >
            <span class="ai-avatar ai-avatar--lg"><Icon name="sparkles" size="lg" /></span>
            <p class="ai-empty__lead">Ask about your todos, money, reminders, or bots.</p>
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
                type="button"
                class="ai-chip"
                :style="{ '--i': SUGGESTION_CHIPS.length }"
                :disabled="!isOnline"
                @click="typoOpen = true"
              >
                Fix typos in my todos, tasks, goals &amp; events
              </button>
            </div>
          </div>

          <div
            v-else
            :key="'thread-' + activeAiChat.id"
            ref="threadRef"
            class="ai-thread"
            @scroll.passive="onThreadScroll"
          >
            <template v-for="m in activeAiChat.messages" :key="m.id">
              <div v-if="m.role === 'user'" class="ai-user" :class="{ 'is-new': isFresh(m) }">
                <div class="ai-user__bubble">{{ m.content }}</div>
              </div>

              <div v-else class="ai-reply" :class="{ 'is-new': isFresh(m) }">
                <span v-if="!isMobile" class="ai-avatar"><Icon name="sparkles" /></span>
                <div class="ai-reply__body">
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
                            <ul v-if="it.items?.length" class="ai-create__subs">
                              <li v-for="(s, si) in it.items" :key="si">{{ s }}</li>
                            </ul>
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
                            <Icon name="plus" />{{ planLabel(part.plan) }}
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

                  <div v-if="!isStreamingMsg(m.id)" class="ai-meta">
                    <span class="ai-meta__model" :title="m.model || activeAiChat.model">{{
                      aiModelLabel(m.model || activeAiChat.model)
                    }}</span>
                    <span v-if="msgTokens(m)" class="ai-meta__tok" :title="tokenTitle(m)"
                      >{{ msgTokens(m).toLocaleString() }} tok</span
                    >
                    <span v-if="m.usedData && !isMobile" class="ai-meta__data">
                      <Icon name="database" size="xs" />From your data
                    </span>
                    <IconButton
                      v-if="!isMobile"
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
          <span v-if="aiUseData">Sends ≈{{ ctxTokens }} tokens of your data with each turn</span>
          <span v-else>Your data is not sent</span>
        </div>
      </section>

      <!-- what Aureon sees -->
      <Transition name="ai-ctx">
        <aside v-if="!isMobile && ctxOpen" class="ai-ctx" aria-label="What Aureon sees">
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
          <div class="ai-ctx__scroll">
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
.ai-list__group {
  padding: var(--sp-3) var(--sp-2) var(--sp-1);
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-dim);
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
.ai-meta__model {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
  font-weight: var(--weight-semibold);
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
