<script setup lang="ts">
// Local AI on the server: which Ollama models are installed and loaded (GET
// /api/models/status), and the conversation history Aureon keeps (GET
// /api/conversations, GET/DELETE /api/conversations/{id}). Chatting itself is
// the AI tab's (POST /api/chat, streamed); this page is where the server's side
// of it is seen and tidied up.
import { computed, ref, shallowRef } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { aureon, errorMessage, type components } from '@/api/client'
import { must } from '@/control/api'
import { useNow, usePoll } from '@/control/poll'
import { bytes } from '@/control/system'
import { ago, when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

type Conversation = components['schemas']['ConversationOut']
type Detail = components['schemas']['ConversationDetail']

const PAGE = 20
const now = useNow(10_000)

const status = useLoad(async () => must(await aureon.GET('/api/models/status')))
const catalog = useLoad(async () => must(await aureon.GET('/api/models')))
usePoll(() => void status.reload(), 30_000)

const models = computed(() => status.data.value?.models ?? [])
const loadedCount = computed(() => models.value.filter((m) => m.loaded).length)

// ---- conversations ---------------------------------------------------------

const convs = shallowRef<Conversation[]>([])
const total = ref(0)
const convLoading = ref(false)
const convError = ref('')
async function loadConvs(fresh = false) {
  convLoading.value = true
  convError.value = ''
  try {
    const page = must(
      await aureon.GET('/api/conversations', {
        params: { query: { limit: PAGE, offset: fresh ? 0 : convs.value.length } },
      }),
    )
    convs.value = fresh ? page.items : [...convs.value, ...page.items]
    total.value = page.total
  } catch (e) {
    convError.value = (e as Error).message
  } finally {
    convLoading.value = false
  }
}
void loadConvs(true)

const open = shallowRef<Detail | null>(null)
const openId = ref('')
const openError = ref('')
async function view(id: string) {
  openId.value = id
  open.value = null
  openError.value = ''
  try {
    open.value = must(
      await aureon.GET('/api/conversations/{conversation_id}', {
        params: { path: { conversation_id: id } },
      }),
    )
  } catch (e) {
    openError.value = (e as Error).message
  }
}
function close() {
  openId.value = ''
  open.value = null
}

const usage = computed(() => {
  const msgs = open.value?.messages ?? []
  const prompt = msgs.reduce((s, m) => s + (m.prompt_tokens ?? 0), 0)
  const completion = msgs.reduce((s, m) => s + (m.completion_tokens ?? 0), 0)
  return prompt || completion ? { prompt, completion } : null
})

const deleting = shallowRef<Conversation | null>(null)
const deleteBusy = ref(false)
const deleteError = ref('')
async function confirmDelete() {
  const c = deleting.value
  if (!c) return
  deleteBusy.value = true
  deleteError.value = ''
  try {
    const r = await aureon.DELETE('/api/conversations/{conversation_id}', {
      params: { path: { conversation_id: c.id } },
    })
    if (!r.response.ok && r.response.status !== 404) {
      deleteError.value = errorMessage(r.error, `Aureon answered ${r.response.status}`)
      return
    }
    convs.value = convs.value.filter((x) => x.id !== c.id)
    total.value = Math.max(0, total.value - 1)
    if (openId.value === c.id) close()
    deleting.value = null
  } catch (e) {
    deleteError.value = (e as Error).message
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div class="tp-page">
    <Card title="Models">
      <div class="tp-head">
        <div class="tp-row">
          <Badge
            v-if="status.data.value"
            :tone="status.data.value.reachable ? 'success' : 'danger'"
            :label="status.data.value.reachable ? 'Ollama reachable' : 'Ollama unreachable'"
          />
          <span v-if="status.data.value?.reachable" class="tp-note"
            >{{ models.length }} installed · {{ loadedCount }} loaded in memory
            {{
              catalog.data.value?.default_model
                ? `· default ${catalog.data.value.default_model}`
                : ''
            }}</span
          >
        </div>
        <Button size="sm" variant="ghost" :loading="status.loading.value" @click="status.reload()"
          >Refresh</Button
        >
      </div>
      <ul v-if="models.length" class="tp-list">
        <li v-for="m in models" :key="m.name" class="tp-item">
          <div class="tp-main">
            <span class="tp-strong cc-mono">{{ m.name }}</span>
            <span class="tp-note"
              >{{ m.size != null ? bytes(m.size) : 'size unknown'
              }}{{ m.size_vram ? ` · ${bytes(m.size_vram)} in VRAM` : ''
              }}{{ m.last_used_at ? ` · used ${ago(m.last_used_at, now)}` : ''
              }}{{ m.loaded && m.expires_at ? ` · unloads ${when(m.expires_at)}` : '' }}</span
            >
          </div>
          <Badge :tone="m.loaded ? 'success' : 'neutral'" :label="m.loaded ? 'loaded' : 'idle'" />
        </li>
      </ul>
      <p v-else-if="status.error.value" class="tp-note" role="alert">{{ status.error.value }}</p>
      <p v-else-if="status.data.value && !status.data.value.reachable" class="tp-note" role="alert">
        The server cannot reach Ollama, so chat is unavailable until it is back.
      </p>
      <Skeleton v-else-if="status.loading.value" :lines="3" />
      <p v-else class="tp-note">Ollama has no models installed.</p>
    </Card>

    <div class="tp-grid">
      <Card :title="`Conversations${total ? ` · ${total}` : ''}`">
        <ul v-if="convs.length" class="tp-list">
          <li v-for="c in convs" :key="c.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ c.title || 'Untitled' }}</span>
              <span class="tp-note"
                >{{ c.provider }} · {{ c.model }} · {{ c.context }} · updated
                {{ ago(c.updated_at, now) }}</span
              >
            </div>
            <div class="tp-row">
              <Button
                size="sm"
                :variant="openId === c.id ? 'tinted' : 'ghost'"
                :aria-pressed="openId === c.id"
                @click="view(c.id)"
                >Open</Button
              >
              <Button size="sm" variant="ghost" @click="deleting = c">Delete…</Button>
            </div>
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
              >{{ open.provider }} · {{ open.model }} · started {{ when(open.created_at) }}</span
            >
            <Button size="sm" variant="ghost" @click="close">Close</Button>
          </div>
          <p v-if="usage" class="tp-note">
            {{ usage.prompt }} prompt + {{ usage.completion }} completion tokens
          </p>
          <ol class="cv-list">
            <li v-for="m in open.messages" :key="m.id" class="cv-msg" :class="`is-${m.role}`">
              <div class="tp-row">
                <span class="tp-strong">{{ m.role }}</span>
                <Badge v-if="m.status !== 'complete'" tone="warning" :label="m.status" />
                <span class="tp-note"
                  >{{ when(m.created_at)
                  }}{{ m.model && m.role === 'assistant' ? ` · ${m.model}` : ''
                  }}{{ m.duration_ms != null ? ` · ${(m.duration_ms / 1000).toFixed(1)} s` : ''
                  }}{{
                    m.prompt_tokens != null || m.completion_tokens != null
                      ? ` · ${m.prompt_tokens ?? 0}/${m.completion_tokens ?? 0} tokens`
                      : ''
                  }}</span
                >
              </div>
              <p class="cv-text">{{ m.content }}</p>
              <p v-if="m.fallback_reason" class="tp-note">
                Answered locally instead: {{ m.fallback_reason }}
              </p>
              <p v-if="m.error" class="tp-note" role="alert">{{ m.error }}</p>
            </li>
          </ol>
          <p v-if="!open.messages.length" class="tp-note">No messages in this conversation.</p>
        </template>
        <p v-else-if="openError" class="tp-note" role="alert">{{ openError }}</p>
        <Skeleton v-else :lines="5" />
      </Card>
    </div>

    <Modal :open="!!deleting" title="Delete this conversation?" size="sm" @close="deleting = null">
      <div class="cc-form">
        <p class="tp-note">
          “{{ deleting?.title || 'Untitled' }}” and its messages are removed from the server. A chat
          in the AI tab that used it starts a fresh conversation next time.
        </p>
        <p v-if="deleteError" class="cc-notice cc-notice--danger" role="alert">
          {{ deleteError }}
        </p>
        <div class="tp-row">
          <Button variant="danger" :loading="deleteBusy" @click="confirmDelete">Delete</Button>
          <Button variant="ghost" @click="deleting = null">Keep it</Button>
        </div>
      </div>
    </Modal>
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
