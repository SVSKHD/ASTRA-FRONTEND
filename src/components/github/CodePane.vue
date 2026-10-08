<script setup lang="ts">
// The GitHub tab's Code pane: a repository's files, browsable and editable.
//
// Left, the tree — every path at the chosen branch, from one request, folders
// first, with a path search above it. Right, the open file: line numbers and
// syntax highlighting, markdown rendered as markdown, and an Edit mode that
// commits the change back to GitHub on the same branch.
//
// THE COMMIT IS GUARDED BY THE BLOB SHA. The file is read with its sha and the
// commit sends it back; if someone pushed to that file in between, GitHub
// refuses with 409 rather than letting this edit quietly overwrite theirs, and
// the pane says so instead of retrying.
import { computed, nextTick, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { ghCall } from '@/utils/ghProxy'
import { useGhRepos } from '@/composables/useGhRepos'
import { loadHighlighter } from '@/utils/mdHighlight'
import { renderMarkdown } from '@/utils/markdown'
import {
  MAX_EDIT_BYTES,
  ancestorsOf,
  buildCodeTree,
  decodeBase64Utf8,
  encodeBase64Utf8,
  extLabel,
  formatBytes,
  languageOf,
  looksBinary,
  searchPaths,
  type CodeNode,
  type GhTreeEntry,
} from '@/utils/ghCode'
import Icon from '@/components/ui/Icon.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import SearchField from '@/components/ui/SearchField.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'

const app = useAppStore()
const { options, repo, choose, ensureLoaded } = useGhRepos()
ensureLoaded()

// ---- branch and tree ----------------------------------------------------------
const branch = ref('')
const branches = ref<string[]>([])
const entries = ref<GhTreeEntry[]>([])
const truncated = ref(false)
const treeLoading = ref(false)
const error = ref('')
const expanded = ref<Set<string>>(new Set())
const find = ref('')

async function loadBranches() {
  const r = repo.value
  if (!r) return
  try {
    const res = await ghCall<{ name: string }[]>('branches', {
      owner: r.owner,
      repo: r.name,
      perPage: 100,
    })
    const names = Array.isArray(res.data) ? res.data.map((b) => b.name) : []
    branches.value = names.includes(r.defaultBranch) ? names : [r.defaultBranch, ...names]
  } catch {
    branches.value = [r.defaultBranch]
  }
}
async function loadTree() {
  const r = repo.value
  if (!r || !branch.value) return
  treeLoading.value = true
  error.value = ''
  try {
    const res = await ghCall<{ tree: GhTreeEntry[]; truncated: boolean }>('tree', {
      owner: r.owner,
      repo: r.name,
      ref: branch.value,
    })
    entries.value = res.data?.tree ?? []
    truncated.value = !!res.data?.truncated
    // Open the README if there is one, so a repo never lands on a blank pane.
    if (!file.value) {
      const readme = entries.value.find((e) => e.type === 'blob' && /^readme(\.md)?$/i.test(e.path))
      if (readme) void openFile(readme.path)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not read the repository.'
    entries.value = []
  } finally {
    treeLoading.value = false
  }
}
function changeBranch(b: string) {
  if (b === branch.value) return
  if (dirty.value && !confirm('Discard your unsaved edit?')) return
  branch.value = b
  closeFile()
  void loadTree()
}

const tree = computed(() => buildCodeTree(entries.value))
const fileCount = computed(() => entries.value.filter((e) => e.type === 'blob').length)
const matches = computed(() => searchPaths(entries.value, find.value))

// The tree as rows, walking only into open folders.
const rows = computed(() => {
  const out: { node: CodeNode; depth: number }[] = []
  const walk = (nodes: CodeNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n, depth })
      if (n.kind === 'dir' && expanded.value.has(n.path)) walk(n.children, depth + 1)
    }
  }
  walk(tree.value, 0)
  return out
})
function toggleDir(path: string) {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expanded.value = next
}

// ---- the open file -------------------------------------------------------------
interface OpenFile {
  path: string
  sha: string
  size: number
  text: string
  binary: boolean
  htmlUrl: string
}
const file = ref<OpenFile | null>(null)
const fileLoading = ref(false)
const highlighted = ref('')
const preview = ref(true)

function closeFile() {
  file.value = null
  editing.value = false
  highlighted.value = ''
}

async function openFile(path: string) {
  const r = repo.value
  if (!r) return
  if (dirty.value && !confirm('Discard your unsaved edit?')) return
  editing.value = false
  fileLoading.value = true
  error.value = ''
  // Reveal it in the tree, wherever it came from (search, README, a click).
  expanded.value = new Set([...expanded.value, ...ancestorsOf(path)])
  try {
    const res = await ghCall<{
      content?: string
      encoding?: string
      sha: string
      size: number
      html_url: string
      type: string
    }>('file', { owner: r.owner, repo: r.name, path, ref: branch.value })
    const d = res.data
    if (!d || d.type !== 'file') throw new Error('That is not a file.')
    // Over 1 MB the contents API sends no content at all.
    const text = d.content && d.encoding === 'base64' ? decodeBase64Utf8(d.content) : ''
    file.value = {
      path,
      sha: d.sha,
      size: d.size,
      text,
      binary: !d.content || looksBinary(text),
      htmlUrl: d.html_url,
    }
    preview.value = true
    await highlight()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not open that file.'
  } finally {
    fileLoading.value = false
  }
}

const isMarkdown = computed(() => !!file.value && /\.(md|markdown)$/i.test(file.value.path))
const lineCount = computed(() => (file.value ? file.value.text.split('\n').length : 0))
const crumbs = computed(() => (file.value ? file.value.path.split('/') : []))

// highlight.js output is its own escaped span markup over the file's text, so
// it is safe to bind as HTML; anything it cannot parse stays plain text.
async function highlight() {
  highlighted.value = ''
  const f = file.value
  if (!f || f.binary || f.size > 300_000) return
  const hljs = await loadHighlighter()
  if (!hljs || file.value !== f) return
  const lang = languageOf(f.path)
  try {
    highlighted.value =
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(f.text, { language: lang }).value
        : hljs.highlightAuto(f.text).value
  } catch {
    highlighted.value = ''
  }
}

async function copyFile() {
  if (!file.value) return
  try {
    await navigator.clipboard.writeText(file.value.text)
    app.showToastMsg('File copied')
  } catch {
    app.showToastMsg("Couldn't copy — your browser blocked the clipboard")
  }
}

// ---- editing -------------------------------------------------------------------
const editing = ref(false)
const draft = ref('')
const message = ref('')
const saving = ref(false)
const dirty = computed(() => editing.value && !!file.value && draft.value !== file.value.text)
const canEdit = computed(
  () => !!file.value && !file.value.binary && file.value.size <= MAX_EDIT_BYTES,
)
const editorBox = ref<HTMLElement | null>(null)

function startEdit() {
  if (!file.value) return
  draft.value = file.value.text
  message.value = 'Update ' + file.value.path.split('/').pop()
  editing.value = true
  void nextTick(() => editorBox.value?.querySelector('textarea')?.focus())
}
function cancelEdit() {
  if (dirty.value && !confirm('Discard your unsaved edit?')) return
  editing.value = false
}
// Tab indents instead of leaving the field; Ctrl/⌘+S commits.
function onEditorKey(e: KeyboardEvent) {
  const ta = e.target as HTMLTextAreaElement
  if (e.key === 'Tab' && ta.tagName === 'TEXTAREA') {
    e.preventDefault()
    const { selectionStart: s, selectionEnd: end, value } = ta
    draft.value = value.slice(0, s) + '  ' + value.slice(end)
    void nextTick(() => ta.setSelectionRange(s + 2, s + 2))
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void commit()
  }
}

async function commit() {
  const r = repo.value
  const f = file.value
  if (!r || !f || !dirty.value || saving.value) return
  if (!message.value.trim()) {
    app.showToastMsg('Write a commit message first')
    return
  }
  saving.value = true
  try {
    const res = await ghCall<{ content?: { sha?: string }; commit?: { html_url?: string } }>(
      'putFile',
      {
        owner: r.owner,
        repo: r.name,
        path: f.path,
        content: encodeBase64Utf8(draft.value),
        sha: f.sha,
        message: message.value.trim(),
        branch: branch.value,
      },
    )
    file.value = {
      ...f,
      text: draft.value,
      sha: res.data?.content?.sha ?? f.sha,
      size: new TextEncoder().encode(draft.value).length,
    }
    editing.value = false
    await highlight()
    app.showToastMsg(`Committed to ${branch.value}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    app.showToastMsg(
      /does not match|409|conflict/i.test(msg)
        ? 'Someone changed this file since you opened it — reopen it and edit again'
        : /resource not accessible|403|not found/i.test(msg)
          ? "The GitHub token can't write here — it needs Contents: write"
          : msg || 'Commit failed',
    )
  } finally {
    saving.value = false
  }
}

// A new repository: a fresh tree on its default branch. Last in the script on
// purpose — it runs immediately and reaches every ref declared above.
watch(
  () => repo.value?.id,
  async () => {
    closeFile()
    expanded.value = new Set()
    entries.value = []
    branch.value = repo.value?.defaultBranch ?? ''
    if (!repo.value) return
    await Promise.all([loadBranches(), loadTree()])
  },
  { immediate: true },
)
</script>

<template>
  <div class="cdp">
    <div class="cdp__bar">
      <Select
        :model-value="repo?.id ?? ''"
        :options="options"
        size="md"
        placeholder="Pick a repository"
        aria-label="Repository"
        class="cdp__repo"
        @update:model-value="choose"
      />
      <Select
        v-if="repo"
        :model-value="branch"
        :options="branches.map((b) => ({ value: b, label: b }))"
        size="md"
        aria-label="Branch"
        class="cdp__branch"
        @update:model-value="changeBranch"
      />
      <span v-if="repo" class="cdp__count">
        <Icon name="list" size="xs" /> {{ fileCount }} files
      </span>
      <a
        v-if="repo"
        :href="repo.htmlUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="gh-link cdp__out"
      >
        GitHub <Icon name="external-link" size="xs" />
      </a>
    </div>

    <p v-if="error" class="gh-note gh-note--error">
      <Icon name="alert-circle" size="sm" /> {{ error }}
    </p>

    <div v-if="!repo" class="gh-empty">
      <span class="gh-empty__icon"><Icon name="github" size="lg" /></span>
      <p class="gh-empty__title">No repository yet</p>
      <p class="gh-empty__text">Connect GitHub in Settings, and your code appears here.</p>
    </div>

    <div v-else class="cdp__cols">
      <!-- ---- the tree ---- -->
      <aside class="cdp__tree" aria-label="Files">
        <SearchField v-model="find" size="sm" placeholder="Go to file…" label="Go to file" />
        <p v-if="truncated" class="gh-muted cdp__trunc">
          Large repository — the tree is partial. Search still finds what is listed.
        </p>
        <div class="cdp__tree-body">
          <template v-if="treeLoading">
            <div v-for="i in 8" :key="i" class="gh-skel gh-skel--line" />
          </template>
          <template v-else-if="find.trim()">
            <button
              v-for="p in matches"
              :key="p"
              type="button"
              class="cdp__node"
              :class="{ 'is-on': file?.path === p }"
              @click="openFile(p)"
            >
              <Icon name="notebook" size="xs" class="cdp__node-icon" />
              <span class="cdp__node-name">{{ p }}</span>
            </button>
            <p v-if="!matches.length" class="gh-muted cdp__none">No file matches.</p>
          </template>
          <template v-else>
            <button
              v-for="r in rows"
              :key="r.node.path"
              type="button"
              class="cdp__node"
              :class="{ 'is-on': file?.path === r.node.path, 'is-dir': r.node.kind === 'dir' }"
              :style="{ paddingLeft: 8 + r.depth * 14 + 'px' }"
              :aria-expanded="r.node.kind === 'dir' ? expanded.has(r.node.path) : undefined"
              @click="r.node.kind === 'dir' ? toggleDir(r.node.path) : openFile(r.node.path)"
            >
              <Icon
                v-if="r.node.kind === 'dir'"
                :name="expanded.has(r.node.path) ? 'chevron-down' : 'chevron-right'"
                size="xs"
                class="cdp__node-icon"
              />
              <span v-else class="cdp__node-ext">{{ extLabel(r.node.name).slice(0, 3) }}</span>
              <span class="cdp__node-name">{{ r.node.name }}</span>
            </button>
          </template>
        </div>
      </aside>

      <!-- ---- the file ---- -->
      <section class="cdp__view" aria-label="File">
        <div v-if="fileLoading" class="cdp__view-pad">
          <div v-for="i in 10" :key="i" class="gh-skel gh-skel--line" />
        </div>
        <div v-else-if="!file" class="gh-empty cdp__view-empty">
          <span class="gh-empty__icon"><Icon name="notebook" size="lg" /></span>
          <p class="gh-empty__title">Pick a file</p>
          <p class="gh-empty__text">Open anything in the tree to read or edit it.</p>
        </div>

        <template v-else>
          <header class="cdp__head">
            <nav class="cdp__crumbs" aria-label="Path">
              <span class="cdp__crumb cdp__crumb--repo">{{ repo.name }}</span>
              <template v-for="(c, i) in crumbs" :key="i">
                <Icon name="chevron-right" size="xs" class="cdp__sep" />
                <span class="cdp__crumb" :class="{ 'is-last': i === crumbs.length - 1 }">{{
                  c
                }}</span>
              </template>
            </nav>
            <div class="cdp__chips">
              <span class="gh-chip">{{ extLabel(file.path) }}</span>
              <span class="gh-chip">{{ formatBytes(file.size) }}</span>
              <span v-if="!file.binary" class="gh-chip">{{ lineCount }} lines</span>
              <span v-if="dirty" class="gh-chip gh-chip--accent">Unsaved</span>
            </div>
            <div class="cdp__actions">
              <template v-if="!editing">
                <button v-if="isMarkdown" type="button" class="gh-soft" @click="preview = !preview">
                  <Icon :name="preview ? 'list' : 'image'" size="xs" />
                  {{ preview ? 'Source' : 'Preview' }}
                </button>
                <button v-if="!file.binary" type="button" class="gh-soft" @click="copyFile">
                  <Icon name="copy" size="xs" /> Copy
                </button>
                <a :href="file.htmlUrl" target="_blank" rel="noopener noreferrer" class="gh-soft">
                  <Icon name="external-link" size="xs" /> GitHub
                </a>
                <button
                  type="button"
                  class="gh-soft gh-soft--accent"
                  :disabled="!canEdit"
                  :title="canEdit ? 'Edit and commit' : 'Binary or over 1 MB — read-only'"
                  @click="startEdit"
                >
                  <Icon name="pencil" size="xs" /> Edit
                </button>
              </template>
            </div>
          </header>

          <!-- Reading -->
          <template v-if="!editing">
            <p v-if="file.binary" class="gh-muted cdp__view-pad">
              Binary or too large to show here.
              <a :href="file.htmlUrl" target="_blank" rel="noopener noreferrer" class="gh-link">
                Open on GitHub
              </a>
            </p>
            <div
              v-else-if="isMarkdown && preview"
              class="cdp__md md"
              v-html="renderMarkdown(file.text)"
            />
            <div v-else class="cdp__code gh-code">
              <div class="cdp__gutter" aria-hidden="true">
                <span v-for="n in lineCount" :key="n">{{ n }}</span>
              </div>
              <pre
                class="cdp__pre"
              ><code v-if="highlighted" class="hljs" v-html="highlighted" /><code v-else>{{ file.text }}</code></pre>
            </div>
          </template>

          <!-- Editing: the draft, the message, and Commit. -->
          <div v-else ref="editorBox" class="cdp__editor" @keydown="onEditorKey">
            <TextArea
              v-model="draft"
              :rows="24"
              :auto-grow="false"
              aria-label="File contents"
              class="cdp__textarea"
            />
            <div class="cdp__commit">
              <span class="cdp__commit-icon"><Icon name="check" size="sm" /></span>
              <TextInput
                v-model="message"
                placeholder="Commit message"
                aria-label="Commit message"
                class="cdp__message"
                @keydown.enter.prevent="commit"
              />
              <span class="cdp__onto">
                to <code>{{ branch }}</code>
              </span>
              <Button variant="ghost" size="md" @click="cancelEdit">Cancel</Button>
              <Button
                variant="primary"
                size="md"
                :disabled="!dirty || !message.trim()"
                :loading="saving"
                @click="commit"
              >
                Commit changes
              </Button>
            </div>
            <p class="gh-muted cdp__hint">
              Tab indents · Ctrl/⌘+S commits · this writes straight to
              <code>{{ branch }}</code> on GitHub.
            </p>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cdp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.cdp__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cdp__repo {
  flex: 0 1 280px;
  min-width: 200px;
}
.cdp__branch {
  flex: 0 1 200px;
  min-width: 140px;
}
.cdp__count {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
}
.cdp__out {
  margin-left: auto;
}
.cdp__cols {
  display: grid;
  grid-template-columns: minmax(220px, 290px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 860px) {
  .cdp__cols {
    grid-template-columns: minmax(0, 1fr);
  }
}

.cdp__tree {
  position: sticky;
  top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--gh-line);
  border-radius: 18px;
  background: var(--theme-card);
}
.cdp__tree-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: min(64vh, 660px);
  overflow: auto;
}
.cdp__trunc,
.cdp__none {
  margin: 0;
  padding: 4px 6px;
}
.cdp__node {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 30px;
  padding: 4px 8px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}
.cdp__node:hover {
  background: var(--gh-wash);
}
.cdp__node.is-on {
  background: var(--gh-wash-strong);
  font-weight: var(--weight-semibold);
}
.cdp__node.is-dir {
  font-weight: var(--weight-medium);
}
.cdp__node:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
.cdp__node-icon {
  flex-shrink: 0;
  color: var(--theme-dim);
}
.cdp__node-ext {
  flex-shrink: 0;
  width: 26px;
  padding: 1px 0;
  border-radius: 4px;
  background: var(--gh-wash);
  color: var(--theme-accent);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  text-align: center;
  letter-spacing: 0.02em;
}
.cdp__node-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cdp__view {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--gh-line);
  border-radius: 18px;
  background: var(--theme-card);
}
.cdp__view-pad {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 16px;
}
.cdp__view-empty {
  min-height: 320px;
}
.cdp__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--gh-line);
  background: var(--gh-wash);
}
.cdp__crumbs {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 1 1 240px;
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.cdp__crumb {
  color: var(--theme-dim);
}
.cdp__crumb--repo {
  color: var(--theme-accent);
  font-weight: var(--weight-semibold);
}
.cdp__crumb.is-last {
  color: var(--theme-text);
  font-weight: var(--weight-semibold);
}
.cdp__sep {
  flex-shrink: 0;
  color: var(--theme-dim);
  opacity: 0.6;
}
.cdp__chips,
.cdp__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cdp__md {
  padding: 18px 22px;
  overflow-x: auto;
}
.cdp__code {
  display: flex;
  max-height: min(68vh, 720px);
  overflow: auto;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.7;
}
.cdp__gutter {
  position: sticky;
  left: 0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  padding: 12px 12px 12px 14px;
  border-right: 1px solid var(--gh-line);
  background: var(--theme-card);
  color: var(--theme-dim);
  text-align: right;
  user-select: none;
  opacity: 0.85;
}
.cdp__pre {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 12px 16px;
  color: var(--theme-text);
  font: inherit;
  white-space: pre;
}

.cdp__editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.cdp__textarea :deep(.ui-control),
.cdp__textarea :deep(.ui-control:hover),
.cdp__textarea :deep(.ui-control:focus-within) {
  border: 0;
  outline: none;
  border-radius: 12px;
  background: var(--gh-wash);
}
.cdp__textarea :deep(.ui-control:focus-within) {
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--theme-accent) 40%, transparent);
}
.cdp__textarea :deep(textarea) {
  min-height: 52vh;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.7;
  white-space: pre;
  tab-size: 2;
}
.cdp__commit {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px;
  border-radius: 14px;
  background: var(--gh-wash);
}
.cdp__commit-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
.cdp__message {
  flex: 1 1 240px;
  min-width: 0;
}
.cdp__onto {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.cdp__onto code,
.cdp__hint code {
  font-family: var(--font-mono);
  color: var(--theme-text);
}
.cdp__hint {
  margin: 0;
  padding: 0 4px;
}
</style>
