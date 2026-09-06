<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
// AI tab: a chat that knows your app. Two-pane inside the stage — a conversation
// rail and the thread — with a pinned header (model, "Use my data", New chat) and
// a pinned composer. The Anthropic key never touches the client: sends POST to a
// configurable aiProxy Cloud Function (VITE_AI_PROXY_URL) that injects the key,
// rate-limits, and streams back. When no proxy is configured the composer still
// stores the turn locally and explains the missing piece.
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useDraft } from '@/composables/useDraft'
import { useConnectivity } from '@/composables/useConnectivity'
import { pxify, typeStep } from '@/styles'
import { AI_MODELS, type AiChat } from '@/types'
import { buildAiContext, SUGGESTION_CHIPS, type AiContextInput } from '@/utils/ai'
import { noteTitle } from '@/utils/notes'
import { currentMonthKey, resolveIncome } from '@/utils/budget'
import { toMinor } from '@/utils/money'

const app = useAppStore()
const { c, panelStyle } = useStyles()
const { aiChats, activeAiChat, aiActiveChatId, aiUseData } = storeToRefs(app)
const { now } = storeToRefs(useUiStore())
const { isOnline } = useConnectivity()

defineExpose({ focus: () => composerRef.value?.focus() })

const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL || ''

// --- conversation rail ------------------------------------------------------
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

function newChat() {
  app.newAiChat()
}
function selectChat(id: number) {
  app.selectAiChat(id)
}

// --- composer + draft -------------------------------------------------------
const composerRef = ref<HTMLTextAreaElement | null>(null)
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

const streaming = ref(false)
let abort: AbortController | null = null

function scrollToEnd() {
  void nextTick(() => {
    const el = threadRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
watch(
  () => activeAiChat.value?.messages.length,
  () => scrollToEnd(),
)

// Assemble the live-data context block fresh each turn.
function contextInput(): AiContextInput {
  const monthKey = currentMonthKey()
  // In integer paise, like everything else since 27b. The legacy `finances`
  // array is still rupee floats, so it converts on the way in — and the income
  // comes through resolveIncome rather than by reaching into the settings map,
  // which is what kept this line from noticing the unit change.
  const monthExpenses = app.finances.filter((f) => (f.date || '').startsWith(monthKey))
  const spent = monthExpenses.reduce((sum, f) => sum + toMinor(f.amount || 0), 0)
  const income = resolveIncome(app.financeSettings, monthKey)
  return {
    overdueTodos: app.pendingOverdue('todos').map((t) => (t as { text: string }).text),
    todayTodos: [],
    overdueTasks: app.pendingOverdue('tasks').map((t) => (t as { title: string }).title),
    upcomingReminders: app.reminders.slice(0, 6).map((r) => r.title),
    income,
    spent,
    remaining: income - spent,
    trips: app.trips.filter((t) => t.status !== 'done').map((t) => t.title),
    noteTitles: app.notes.slice(-6).map((n) => noteTitle(n.text)),
    bots: app.bots.map((b) => ({ name: b.name, status: b.status, enabled: b.enabled })),
  }
}

async function send(prompt?: string) {
  const body = (prompt ?? text.value).trim()
  if (!body || streaming.value || !isOnline.value) return
  let chatId = aiActiveChatId.value
  if (chatId == null) chatId = app.newAiChat()
  const chat = app.aiChatById(chatId)
  if (!chat) return

  app.addAiMessage(chatId, { role: 'user', content: body })
  text.value = ''
  scrollToEnd()

  const asstId = app.addAiMessage(chatId, { role: 'assistant', content: '', model: chat.model })

  if (!PROXY_URL) {
    app.appendAiMessageContent(
      chatId,
      asstId,
      '⚠️ AI proxy not configured. Deploy the `/aiProxy` Cloud Function (it injects the Anthropic API key and streams the reply) and set `VITE_AI_PROXY_URL` to its URL. Your message is saved.',
    )
    return
  }

  streaming.value = true
  abort = new AbortController()
  try {
    const history = app
      .aiChatById(chatId)!
      .messages.filter((m) => m.id !== asstId)
      .map((m) => ({ role: m.role, content: m.content }))
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: chat.model,
        messages: history,
        system: aiUseData.value ? buildAiContext(contextInput()) : undefined,
        stream: true,
      }),
      signal: abort.signal,
    })
    if (!res.ok || !res.body) throw new Error('Proxy error ' + res.status)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const evt = JSON.parse(payload)
          const delta = evt?.delta?.text ?? evt?.text ?? ''
          if (delta) app.appendAiMessageContent(chatId, asstId, delta)
        } catch {
          /* ignore keep-alive / non-JSON lines */
        }
      }
      scrollToEnd()
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      app.appendAiMessageContent(chatId, asstId, '\n\n⚠️ Stream failed. Try again.')
    }
  } finally {
    streaming.value = false
    abort = null
  }
}
function stop() {
  abort?.abort()
  streaming.value = false
}
function pickSuggestion(chip: string) {
  void send(chip)
}

const modelLabel = (mid: string) => AI_MODELS.find((m) => m.id === mid)?.label ?? mid
const tokenTotal = computed(() => {
  const chat = activeAiChat.value
  if (!chat) return 0
  return chat.messages.reduce((sum, m) => sum + (m.tokensIn || 0) + (m.tokensOut || 0), 0)
})

// --- styles -----------------------------------------------------------------
const shell = pxify({
  display: 'flex',
  gap: 'var(--sp-4)',
  width: '100%',
  height: '100%',
  flex: 1,
  minHeight: 0,
  alignItems: 'stretch',
})
const rail = computed(() =>
  pxify({
    width: 240,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    borderRight: '1px solid ' + c.value.border,
    paddingRight: 12,
    minHeight: 0,
  }),
)
const railScroll = pxify({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
})
const railHeadRow = pxify({ display: 'flex', gap: 'var(--sp-2)' })
const newBtn = computed(() =>
  pxify({
    flexShrink: 0,
    width: 34,
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.border,
    background: c.value.accent,
    color: c.value.onAccent,
    ...typeStep('md'),
    cursor: 'pointer',
  }),
)
function chatRow(active: boolean) {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    cursor: 'pointer',
    background: active ? c.value.card : 'transparent',
    border: '1px solid ' + (active ? c.value.border : 'transparent'),
  })
}
const chatTitle = computed(() =>
  pxify({
    flex: 1,
    minWidth: 0,
    ...typeStep('xs'),
    color: c.value.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const groupLabel = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
    padding: '4px 4px 0',
  }),
)
const iconBtn = computed(() =>
  pxify({
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: c.value.dim,
    ...typeStep('xs'),
  }),
)

const main = pxify({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
})
const headerRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    paddingBottom: 10,
    borderBottom: '1px solid ' + c.value.border,
    flexWrap: 'wrap',
    flex: '0 0 auto',
    minWidth: 0,
  }),
)
const toggleLabel = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    ...typeStep('xs'),
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
const tokenReadout = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, marginLeft: 'auto' }),
)

const thread = pxify({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-3)',
  padding: '12px 2px',
})
function bubbleWrap(role: string) {
  return pxify({ display: 'flex', justifyContent: role === 'user' ? 'flex-end' : 'flex-start' })
}
function bubble(role: string) {
  return pxify({
    maxWidth: '78%',
    padding: '10px 14px',
    borderRadius: 'var(--radius-dialog)',
    ...typeStep('sm'),
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: role === 'user' ? c.value.accent : c.value.card,
    color: role === 'user' ? c.value.onAccent : c.value.text,
    border: '1px solid ' + c.value.border,
  })
}
const msgMeta = computed(() =>
  pxify({
    display: 'flex',
    gap: 'var(--sp-2)',
    alignItems: 'center',
    marginTop: 4,
    ...typeStep('xs'),
    color: c.value.dim,
  }),
)
const badge = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '2px 7px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    color: c.value.accent,
  }),
)
const cursor = pxify({
  display: 'inline-block',
  width: 7,
  height: 15,
  background: 'currentColor',
  marginLeft: 2,
  animation: 'twinkle 1s steps(2) infinite',
  verticalAlign: 'text-bottom',
})

const composerBar = computed(() =>
  pxify({
    display: 'flex',
    gap: 'var(--sp-2)',
    alignItems: 'flex-end',
    paddingTop: 10,
    borderTop: '1px solid ' + c.value.border,
    flex: '0 0 auto',
  }),
)
const sendBtn = computed(() =>
  pxify({
    flexShrink: 0,
    padding: '11px 18px',
    borderRadius: 'var(--radius-dialog)',
    border: 'none',
    background: streaming.value ? 'transparent' : c.value.accent,
    color: streaming.value ? c.value.accent : c.value.onAccent,
    fontWeight: 'var(--weight-semibold)',
    ...typeStep('sm'),
    cursor: 'pointer',
    boxShadow: streaming.value ? 'inset 0 0 0 1px ' + c.value.accent : 'none',
  }),
)

// --- empty state ------------------------------------------------------------
const emptyWrap = pxify({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--sp-4)',
})
const emptyOrb = computed(() =>
  pxify({
    width: 60,
    height: 60,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 32%, ' + c.value.accent + ' 0%, transparent 72%)',
    boxShadow: '0 0 24px ' + c.value.accent,
    animation: 'breathe 5s ease-in-out infinite',
  }),
)
const chipRow = pxify({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--sp-2)',
  justifyContent: 'center',
  maxWidth: 420,
})
const chipStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    padding: '8px 14px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    color: c.value.text,
    cursor: 'pointer',
  }),
)

function onComposerKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
}
</script>

<template>
  <div :style="panelStyle">
    <div :style="shell">
      <!-- conversation rail -->
      <aside :style="rail">
        <div :style="railHeadRow">
          <TextInput v-model="search" placeholder="Search chats" />
          <button :style="newBtn" aria-label="New chat" @click="newChat">+</button>
        </div>
        <div :style="railScroll">
          <template v-for="g in groupedChats" :key="g.label">
            <div :style="groupLabel">{{ g.label }}</div>
            <div
              v-for="ch in g.chats"
              :key="ch.id"
              :style="chatRow(ch.id === aiActiveChatId)"
              @click="selectChat(ch.id)"
            >
              <button
                :style="iconBtn"
                :title="ch.pinned ? 'Unpin' : 'Pin'"
                @click.stop="app.toggleAiChatPin(ch.id)"
              >
                {{ ch.pinned ? '★' : '☆' }}
              </button>
              <span :style="chatTitle">{{ ch.title }}</span>
              <button :style="iconBtn" title="Delete" @click.stop="app.deleteAiChat(ch.id)">
                ×
              </button>
            </div>
          </template>
          <div
            v-if="!aiChats.length"
            :style="{ ...typeStep('xs'), color: c.dim, padding: '8px 4px' }"
          >
            No chats yet.
          </div>
        </div>
      </aside>

      <!-- thread -->
      <section :style="main">
        <div :style="headerRow">
          <Select
            v-if="activeAiChat"
            :model-value="activeAiChat.model"
            @update:model-value="app.setAiChatModel(activeAiChat.id, $event)"
            :options="[...AI_MODELS.map((m) => ({ value: String(m.id), label: `${m.label}` }))]"
          />
          <label :style="toggleLabel">
            <Checkbox :model-value="aiUseData" @update:model-value="app.setAiUseData($event)" />
            Use my data
          </label>
          <span v-if="tokenTotal" :style="tokenReadout">{{ tokenTotal }} tokens</span>
        </div>

        <div v-if="!activeAiChat || !activeAiChat.messages.length" :style="emptyWrap">
          <span :style="emptyOrb"></span>
          <div :style="{ color: c.dim, ...typeStep('base') }">
            Ask about your todos, money, reminders, or bots.
          </div>
          <div :style="chipRow">
            <button
              v-for="chip in SUGGESTION_CHIPS"
              :key="chip"
              :style="chipStyle"
              @click="pickSuggestion(chip)"
            >
              {{ chip }}
            </button>
          </div>
        </div>

        <div v-else ref="threadRef" :style="thread">
          <div v-for="m in activeAiChat.messages" :key="m.id">
            <div :style="bubbleWrap(m.role)">
              <div :style="bubble(m.role)">
                {{ m.content
                }}<span
                  v-if="
                    streaming &&
                    m.role === 'assistant' &&
                    m.id === activeAiChat.messages[activeAiChat.messages.length - 1].id
                  "
                  :style="cursor"
                ></span>
              </div>
            </div>
            <div v-if="m.role === 'assistant'" :style="[msgMeta, { justifyContent: 'flex-start' }]">
              <span :style="badge">{{ modelLabel(m.model || activeAiChat.model) }}</span>
              <span v-if="m.tokensIn || m.tokensOut"
                >{{ (m.tokensIn || 0) + (m.tokensOut || 0) }} tok</span
              >
            </div>
          </div>
        </div>

        <!-- composer -->
        <div :style="composerBar">
          <TextArea
            ref="composerRef"
            :model-value="text"
            :disabled="!isOnline"
            :placeholder="isOnline ? 'Message…' : 'AI needs internet'"
            :rows="1"
            @update:model-value="text = $event"
            @keydown="onComposerKey"
          />
          <button v-if="streaming" :style="sendBtn" @click="stop">Stop</button>
          <button v-else :style="sendBtn" :disabled="!isOnline" @click="send()">Send</button>
        </div>
      </section>
    </div>
  </div>
</template>
