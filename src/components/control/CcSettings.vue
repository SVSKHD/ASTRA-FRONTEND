<script setup lang="ts">
// Settings and secrets (backend docs/settings.md): the keys Aureon reads for
// OpenRouter, Dhan, GitHub, Discord and MT5, set from here instead of .env.
//
// The server never sends a value back: each row shows a mask, where the value
// in effect comes from, and when it changed. A typed value lives only in this
// component's inputs until it is sent, and is cleared after. Secrets (and the
// URLs a credential is sent to) ask for the admin's password first; the server
// checks it, audits the change and applies it without a restart.
import { computed, reactive, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import DhanSessionBar from '@/components/control/DhanSessionBar.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { aureon } from '@/api/client'
import { codeOf, must } from '@/control/api'
import {
  expiryChip,
  groupSettings,
  refusal,
  sourceChip,
  testChip,
  testKey,
  type Group,
  type SettingRow,
} from '@/control/settings'
import { ago, when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const missing = ref(false)
const list = useLoad(async () => {
  const r = await aureon.GET('/api/v1/settings')
  missing.value = r.response.status === 404
  return missing.value ? null : must(r)
})
const groups = computed(() => (list.data.value ? groupSettings(list.data.value) : []))

// Typed values, keyed by setting. Memory only; cleared after every send.
const drafts = reactive<Record<string, string>>({})
const busy = ref('')
const message = reactive<{ key: string; text: string; tone: 'ok' | 'error' }>({
  key: '',
  text: '',
  tone: 'ok',
})

function say(key: string, text: string, tone: 'ok' | 'error' = 'ok') {
  message.key = key
  message.text = text
  message.tone = tone
}

function detailOf(error: unknown): string | undefined {
  const d = (error as { detail?: unknown } | undefined)?.detail
  if (d && typeof d === 'object' && 'detail' in d && typeof d.detail === 'string') return d.detail
  return undefined
}

// The re-auth dialog: what is waiting for the password.
type Pending = { action: 'save' | 'revert'; row: SettingRow }
const pending = ref<Pending | null>(null)
const password = ref('')
const reauthError = ref('')

function closeReauth() {
  pending.value = null
  password.value = ''
  reauthError.value = ''
}

function save(row: SettingRow) {
  if (!(drafts[row.key] ?? '').trim() && !['csv', 'json_list'].includes(row.kind)) return
  if (row.requires_reauth) pending.value = { action: 'save', row }
  else void send({ action: 'save', row })
}

function revert(row: SettingRow) {
  if (row.requires_reauth) pending.value = { action: 'revert', row }
  else void send({ action: 'revert', row })
}

async function send(p: Pending, pass?: string) {
  const key = p.row.key
  busy.value = key
  reauthError.value = ''
  try {
    const params = { path: { key } }
    const r =
      p.action === 'save'
        ? await aureon.PUT('/api/v1/settings/{key}', {
            params,
            body: { value: drafts[key] ?? '', ...(pass ? { password: pass } : {}) },
          })
        : await aureon.DELETE('/api/v1/settings/{key}', {
            params,
            ...(pass ? { body: { password: pass } } : {}),
          })
    if (r.data) {
      delete drafts[key]
      closeReauth()
      say(key, p.action === 'save' ? 'Saved. Applied without a restart.' : 'Reverted to .env.')
      await list.reload()
      return
    }
    const code = codeOf(r.error)
    const text = refusal(code, detailOf(r.error), 'That change was refused.')
    if (pending.value && (code === 'reauth_failed' || code === 'too_many_reauth_failures')) {
      reauthError.value = text
      password.value = ''
    } else {
      closeReauth()
      say(key, text, 'error')
    }
  } catch {
    closeReauth()
    say(key, 'The server could not be reached.', 'error')
  } finally {
    busy.value = ''
  }
}

function confirmReauth() {
  if (pending.value && password.value) void send(pending.value, password.value)
}

async function runTest(group: Group) {
  const key = testKey(group)
  if (!key) return
  busy.value = `test:${group.category}`
  try {
    const r = await aureon.POST('/api/v1/settings/{key}/test', { params: { path: { key } } })
    if (r.data) say(key, r.data.detail, r.data.ok ? 'ok' : 'error')
    else say(key, refusal(codeOf(r.error), detailOf(r.error), 'The test could not run.'), 'error')
    await list.reload()
  } catch {
    say(key, 'The server could not be reached.', 'error')
  } finally {
    busy.value = ''
  }
}

function inputType(row: SettingRow): 'password' | 'text' {
  return row.is_secret ? 'password' : 'text'
}

function placeholder(row: SettingRow): string {
  if (row.kind === 'bool') return 'true or false'
  if (row.kind === 'json_list') return '["owner/name"]'
  if (row.kind === 'csv') return 'a, b, c'
  return row.is_set ? 'New value' : 'Value'
}
</script>

<template>
  <div class="tp-page">
    <EmptyState
      v-if="missing"
      title="Settings need the backend settings manager"
      description="This server has no /api/v1/settings yet. Deploy it and this page fills in."
    />
    <template v-else>
      <p v-if="list.error.value" class="tp-note" role="alert">{{ list.error.value }}</p>
      <p v-if="list.data.value && !list.data.value.encryption_ready" class="tp-note" role="alert">
        The server has no SETTINGS_MASTER_KEY, so values cannot be stored yet. Everything below
        comes from .env.
      </p>
      <!-- The control center is admin-only; finish a Dhan login that came back here. -->
      <DhanSessionBar admin finish-callback @changed="list.reload()" />
      <Card v-for="g in groups" :key="g.category" :title="g.label" class="cc-set">
        <template #header>
          <div class="cc-set__title">
            <span class="ui-card__title">{{ g.label }}</span>
            <Badge v-if="testChip(g.test)" v-bind="testChip(g.test)!" />
            <Button
              size="sm"
              variant="secondary"
              :loading="busy === `test:${g.category}`"
              @click="runTest(g)"
              >Test</Button
            >
          </div>
        </template>
        <p class="tp-note">
          {{ g.note }}
          <span v-if="g.test"> Last test {{ ago(g.test.tested_at) }}: {{ g.test.detail }}</span>
        </p>
        <ul class="cc-set__rows">
          <li v-for="row in g.rows" :key="row.key" class="cc-set__row">
            <div class="cc-set__head">
              <code class="cc-set__key">{{ row.key }}</code>
              <Badge v-bind="sourceChip(row)" />
              <Badge v-if="expiryChip(row)" v-bind="expiryChip(row)!" />
              <span v-if="row.masked" class="cc-set__mask" aria-label="Masked value">{{
                row.masked
              }}</span>
            </div>
            <p class="tp-note">
              {{ row.description }}
              <span v-if="row.updated_at"> · changed {{ when(row.updated_at) }}</span>
              <span v-if="row.expires_at"> · expires {{ when(row.expires_at) }}</span>
            </p>
            <p v-if="row.managed" class="tp-note">
              Set by <strong>Log in to Dhan</strong> above; it cannot be typed in.
            </p>
            <form v-else class="tp-row cc-set__form" @submit.prevent="save(row)">
              <TextInput
                v-model="drafts[row.key]"
                :type="inputType(row)"
                :placeholder="placeholder(row)"
                :aria-label="`New value for ${row.key}`"
                autocomplete="off"
              />
              <Button
                type="submit"
                size="sm"
                :loading="busy === row.key && !pending"
                :disabled="!list.data.value?.encryption_ready"
                >{{ row.source === 'db' ? 'Replace' : 'Set' }}</Button
              >
              <Button
                v-if="row.source === 'db'"
                size="sm"
                variant="secondary"
                :loading="busy === row.key && !pending"
                @click="revert(row)"
                >Revert to .env</Button
              >
            </form>
            <p
              v-if="message.key === row.key && message.text"
              class="tp-note"
              :role="message.tone === 'error' ? 'alert' : 'status'"
            >
              {{ message.text }}
            </p>
          </li>
        </ul>
      </Card>
    </template>

    <Modal :open="!!pending" title="Confirm with your password" size="sm" @close="closeReauth">
      <form v-if="pending" class="cc-form" @submit.prevent="confirmReauth">
        <p class="tp-note">
          {{ pending.action === 'save' ? 'Set' : 'Revert' }} <code>{{ pending.row.key }}</code
          >. The server checks your password before it changes a secret. It is sent once and never
          stored.
        </p>
        <TextInput
          v-model="password"
          type="password"
          placeholder="Password"
          aria-label="Password"
          autocomplete="current-password"
        />
        <p v-if="reauthError" class="tp-note" role="alert">{{ reauthError }}</p>
        <div class="tp-row">
          <Button type="submit" :loading="!!busy" :disabled="!password">{{
            pending.action === 'save' ? 'Save' : 'Revert'
          }}</Button>
          <Button variant="secondary" @click="closeReauth">Cancel</Button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<style scoped>
.cc-set__title {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.cc-set__rows {
  display: grid;
  gap: var(--sp-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cc-set__row {
  display: grid;
  gap: var(--sp-2);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--glass-border);
}

.cc-set__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
}

.cc-set__key {
  min-width: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.cc-set__mask {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.cc-set__form {
  flex-wrap: wrap;
}

.cc-set__form > :first-child {
  flex: 1 1 16rem;
  min-width: 0;
}
</style>
