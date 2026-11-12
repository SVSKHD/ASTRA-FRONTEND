<script setup lang="ts">
// The conversations Claude keeps on the server (GET /api/ai/conversations, GET
// /api/ai/conversations/{id}; backend docs/26). Chatting itself is the AI tab's
// (POST /api/ai/chat, streamed); this page is where the server's side of it is
// read. Claude is the only model, so there is no model list here any more, and
// the API has no delete: a conversation is kept as the record of what was asked.
import { computed, ref, shallowRef } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import {
  agentLabel,
  getConversation,
  listConversations,
  usd,
  type ConversationDetail,
  type ConversationSummary,
} from '@/ai/aureonChat'
import { useNow } from '@/control/poll'
import { ago, when } from '@/trading/format'

const PAGE = 20
const now = useNow(10_000)

const convs = shallowRef<ConversationSummary[]>([])
const total = ref(0)
const convLoading = ref(false)
const convError = ref('')
async function loadConvs(fresh = false) {
  convLoading.value = true
  convError.value = ''
  try {
    const page = await listConversations(PAGE, fresh ? 0 : convs.value.length)
    convs.value = fresh ? page.items : [...convs.value, ...page.items]
    total.value = page.total
  } catch (e) {
    convError.value = (e as Error).message
  } finally {
    convLoading.value = false
  }
}
void loadConvs(true)

const open = shallowRef<ConversationDetail | null>(null)
const openId = ref('')
const openError = ref('')
async function view(id: string) {
  openId.value = id
  open.value = null
  openError.value = ''
  try {
    open.value = await getConversation(id)
  } catch (e) {
    openError.value = (e as Error).message
  }
}
function close() {
  openId.value = ''
  open.value = null
}

/** What the open conversation has cost so far, from its replies. */
const spent = computed(() => {
  const msgs = open.value?.messages ?? []
  const sum = msgs.reduce((s, m) => s + (Number(m.cost_usd) || 0), 0)
  return sum > 0 ? usd(sum) : ''
})
</script>

<template>
  <div class="tp-page">
    <div class="tp-grid">
      <Card :title="`Conversations${total ? ` · ${total}` : ''}`">
        <div class="tp-head">
          <span class="tp-note">Kept by Aureon for every chat with Claude.</span>
          <Button size="sm" variant="ghost" :loading="convLoading" @click="loadConvs(true)"
            >Refresh</Button
          >
        </div>
        <ul v-if="convs.length" class="tp-list">
          <li v-for="c in convs" :key="c.id" class="tp-item" data-testid="conversation">
            <div class="tp-main">
              <span class="tp-strong">{{ c.title || 'Untitled' }}</span>
              <span class="tp-note"
                >{{ c.agent ? `${agentLabel(c.agent)} agent · ` : '' }}updated
                {{ ago(c.updated_at, now) }}</span
              >
            </div>
            <Button
              size="sm"
              :variant="openId === c.id ? 'tinted' : 'ghost'"
              :aria-pressed="openId === c.id"
              @click="view(c.id)"
              >Open</Button
            >
          </li>
        </ul>
        <p v-else-if="convError" class="tp-note" role="alert">{{ convError }}</p>
        <Skeleton v-else-if="convLoading" :lines="4" />
        <EmptyState
          v-else
          title="No conversations on the server"
          description="Chats sent from the AI tab are kept here by Aureon."
        />
        <div v-if="convs.length < total" class="tp-row">
          <Button size="sm" variant="ghost" :loading="convLoading" @click="loadConvs()"
            >Load more</Button
          >
        </div>
      </Card>

      <Card v-if="openId" :title="open?.title || 'Conversation'">
        <template v-if="open">
          <div class="tp-head">
            <span class="tp-note"
              >{{ open.agent ? `${agentLabel(open.agent)} agent · ` : '' }}started
              {{ when(open.created_at) }}{{ spent ? ` · ${spent} so far` : '' }}</span
            >
            <Button size="sm" variant="ghost" @click="close">Close</Button>
          </div>
          <ol class="cv-list">
            <li v-for="m in open.messages" :key="m.id" class="cv-msg" :class="`is-${m.role}`">
              <div class="tp-row">
                <span class="tp-strong">{{ m.role === 'assistant' ? 'Claude' : m.role }}</span>
                <span class="tp-note"
                  >{{ when(m.created_at)
                  }}{{
                    m.role === 'assistant' && usd(m.cost_usd) ? ` · ${usd(m.cost_usd)}` : ''
                  }}</span
                >
                <Badge v-if="m.role === 'assistant' && !m.content" tone="warning" label="no text" />
              </div>
              <p class="cv-text">{{ m.content }}</p>
            </li>
          </ol>
          <p v-if="!open.messages.length" class="tp-note">No messages in this conversation.</p>
        </template>
        <p v-else-if="openError" class="tp-note" role="alert">{{ openError }}</p>
        <Skeleton v-else :lines="5" />
      </Card>
    </div>
  </div>
</template>

<style scoped>
.cv-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  max-height: 60vh;
  margin: var(--sp-2) 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.cv-msg {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--theme-dim) 8%, transparent);
}
.cv-msg.is-user {
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
}
.cv-text {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: var(--text-sm);
  color: var(--text-primary);
}
</style>
