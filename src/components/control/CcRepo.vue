<script setup lang="ts">
// Repository explorer for the selected (allowlisted) repo: branches, recent
// commits, the tree one directory at a time, and a text-only file viewer.
// Binary and over-size files show their metadata only, as the server answers.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import LogViewer from '@/components/control/LogViewer.vue'
import { aureon } from '@/api/client'
import { cc, must, repoParams, short } from '@/control/api'
import { repos } from '@/control/repos'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const ref_ = ref('')
const dir = ref('')
const file = ref('')

const defaultBranch = computed(
  () => repos.items.find((r) => r.full_name === cc.repo)?.default_branch ?? '',
)

const branches = useLoad(async () => {
  const p = repoParams()
  if (!p) return []
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/branches', {
      params: { path: p },
    }),
  )
}, false)
const branchOptions = computed(() =>
  (branches.data.value ?? []).map((b) => ({
    value: b.name,
    label: b.protected ? `${b.name} (protected)` : b.name,
  })),
)

const tree = useLoad(async () => {
  const p = repoParams()
  if (!p) return null
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/tree', {
      params: {
        path: p,
        query: {
          ...(ref_.value ? { ref: ref_.value } : {}),
          ...(dir.value ? { path: dir.value } : {}),
        },
      },
    }),
  )
}, false)
const entries = computed(() =>
  [...(tree.data.value?.entries ?? [])].sort((a, b) =>
    a.type === b.type ? a.path.localeCompare(b.path) : a.type === 'tree' ? -1 : 1,
  ),
)

const commits = useLoad(async () => {
  const p = repoParams()
  if (!p) return []
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/commits', {
      params: { path: p, query: { per_page: 15, ...(ref_.value ? { sha: ref_.value } : {}) } },
    }),
  )
}, false)

const content = useLoad(async () => {
  const p = repoParams()
  if (!p || !file.value) return null
  return must(
    await aureon.GET('/api/v1/github/repositories/{owner}/{repo}/contents/{path}', {
      params: { path: { ...p, path: file.value }, query: ref_.value ? { ref: ref_.value } : {} },
    }),
  )
}, false)

/** Tree paths are relative to the directory asked for. */
function full(path: string) {
  return dir.value ? `${dir.value}/${path}` : path
}
function open(e: { path: string; type: string }) {
  if (e.type === 'tree') {
    dir.value = full(e.path)
    file.value = ''
  } else if (e.type === 'blob') file.value = full(e.path)
}
function up() {
  dir.value = dir.value.split('/').slice(0, -1).join('/')
  file.value = ''
}

watch(
  () => cc.repo,
  () => {
    ref_.value = defaultBranch.value
    dir.value = ''
    file.value = ''
    void branches.reload()
  },
  { immediate: true },
)
watch([() => cc.repo, ref_, dir], () => void tree.reload(), { immediate: true })
watch([() => cc.repo, ref_], () => void commits.reload(), { immediate: true })
watch(file, () => void content.reload())
</script>

<template>
  <div class="tp-page">
    <EmptyState
      v-if="!cc.repo"
      title="No repository selected"
      description="Pick an allowlisted repository in the header, or sync the list on the GitHub page."
    />
    <template v-else>
      <div class="tp-row">
        <Select
          v-if="branchOptions.length"
          v-model="ref_"
          :options="branchOptions"
          size="sm"
          aria-label="Branch"
        />
        <span class="tp-note">{{ branches.data.value?.length ?? 0 }} branches</span>
      </div>

      <div class="tp-grid">
        <Card :title="dir ? `Files · ${dir}` : 'Files'">
          <Button v-if="dir" size="sm" variant="ghost" @click="up">Up one level</Button>
          <ul v-if="entries.length" class="tp-list">
            <li v-for="e in entries" :key="e.path" class="tp-item">
              <div class="tp-main">
                <span class="tp-strong">{{ e.type === 'tree' ? `${e.path}/` : e.path }}</span>
                <span v-if="e.size != null" class="tp-note tp-num">{{ e.size }} bytes</span>
              </div>
              <Button
                v-if="e.type === 'tree' || e.type === 'blob'"
                size="sm"
                variant="ghost"
                @click="open(e)"
                >{{ e.type === 'tree' ? 'Open' : 'View' }}</Button
              >
              <Badge v-else :label="e.type" />
            </li>
          </ul>
          <p v-else-if="tree.error.value" class="tp-note" role="alert">{{ tree.error.value }}</p>
          <p v-else-if="!tree.loading.value" class="tp-note">This directory is empty.</p>
          <p v-if="tree.data.value?.truncated" class="tp-note">
            The server cut this listing at its entry limit.
          </p>
        </Card>

        <Card title="Recent commits">
          <ul v-if="commits.data.value?.length" class="tp-list">
            <li v-for="c in commits.data.value" :key="c.sha" class="tp-item">
              <div class="tp-main">
                <span class="tp-strong">{{ c.message.split('\n')[0] }}</span>
                <span class="tp-note"
                  >{{ short(c.sha) }} · {{ c.author_login ?? c.author_name ?? '—' }} ·
                  {{ ago(c.committed_at ?? c.authored_at) }}</span
                >
              </div>
            </li>
          </ul>
          <p v-else-if="commits.error.value" class="tp-note" role="alert">
            {{ commits.error.value }}
          </p>
          <p v-else-if="!commits.loading.value" class="tp-note">No commits on this branch.</p>
        </Card>
      </div>

      <Card v-if="file" :title="file">
        <template v-if="content.data.value">
          <LogViewer
            v-if="content.data.value.content_kind === 'text'"
            :text="content.data.value.text ?? ''"
            mode="head"
            :label="`File ${file}`"
          />
          <p v-else-if="content.data.value.content_kind === 'binary'" class="tp-note">
            This is a binary file ({{ content.data.value.size ?? '?' }} bytes). Only text files are
            shown here.
          </p>
          <p v-else-if="content.data.value.content_kind === 'too_large'" class="tp-note">
            This file is larger than the server's text limit ({{ content.data.value.size ?? '?' }}
            bytes). Open it on GitHub.
          </p>
          <p v-else class="tp-note">
            This is a {{ content.data.value.type
            }}{{ content.data.value.target ? ` pointing at ${content.data.value.target}` : '' }}.
          </p>
        </template>
        <p v-else-if="content.error.value" class="tp-note" role="alert">
          {{ content.error.value }}
        </p>
      </Card>
    </template>
  </div>
</template>
