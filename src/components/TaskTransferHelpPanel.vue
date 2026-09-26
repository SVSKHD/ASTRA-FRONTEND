<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import SlideOver from '@/components/ui/SlideOver.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Button from '@/components/ui/Button.vue'
import { downloadText } from '@/utils/noteExport'
import type { TaskTransferCollection } from '@/utils/taskTransfer'
import {
  TASK_TRANSFER_LINK_PARAMS,
  TASK_TRANSFER_SCHEMA_FIELDS,
  sampleTaskTransferJson,
  sampleTaskTransferUrl,
  taskTransferSampleFilename,
  type TaskTransferSchemaField,
} from '@/utils/taskTransferHelp'

const app = useAppStore()
const { taskTransferHelpOpen, taskTransferHelpCollection } = storeToRefs(app)

const tabs: { value: TaskTransferCollection; label: string }[] = [
  { value: 'tasks', label: 'Task JSON' },
  { value: 'todos', label: 'Todo JSON' },
]

const collection = computed<TaskTransferCollection>({
  get: () => taskTransferHelpCollection.value,
  set: (value) => app.setTaskTransferHelpCollection(value),
})
const sample = computed(() => sampleTaskTransferJson(collection.value))
const linkSample = computed(() => sampleTaskTransferUrl(collection.value))
const noun = computed(() => (collection.value === 'todos' ? 'todo' : 'task'))
const copied = ref<'json' | 'link' | null>(null)

const scopes: { key: TaskTransferSchemaField['scope']; label: string }[] = [
  { key: 'document', label: 'The document' },
  { key: 'item', label: 'Each item' },
]
const fieldsIn = (scope: TaskTransferSchemaField['scope']) =>
  TASK_TRANSFER_SCHEMA_FIELDS.filter((field) => field.scope === scope)

async function copySample() {
  try {
    await navigator.clipboard?.writeText(sample.value)
    copied.value = 'json'
    setTimeout(() => {
      if (copied.value === 'json') copied.value = null
    }, 1500)
  } catch {
    // The sample is still visible and selectable.
  }
}

async function copyLinkSample() {
  try {
    await navigator.clipboard?.writeText(linkSample.value)
    copied.value = 'link'
    setTimeout(() => {
      if (copied.value === 'link') copied.value = null
    }, 1500)
  } catch {
    // The sample is still visible and selectable.
  }
}

function downloadSample() {
  downloadText(
    sample.value,
    taskTransferSampleFilename(collection.value),
    'application/json;charset=utf-8',
  )
}
</script>

<template>
  <SlideOver
    :open="taskTransferHelpOpen"
    :size="app.drawerWide ? 'lg' : 'compact'"
    :mode-icon="app.drawerWide ? 'minimize' : 'maximize'"
    :mode-label="app.drawerWide ? 'Compact drawer' : 'Wider drawer'"
    title="Task list JSON"
    @mode="app.toggleDrawerWide()"
    @close="app.closeTaskTransferHelp()"
  >
    <div class="thelper">
      <p class="thelper__lede">
        Use this shape when you want AI or another app to create a {{ noun }} list for import. The
        Aquakart-style fields — <code>area</code>, <code>priority</code>, <code>progress</code> and
        <code>testCriteria</code> — are accepted directly.
      </p>

      <Tabs v-model="collection" :tabs="tabs" aria-label="JSON sample type" />

      <section class="thelper__block">
        <div class="thelper__blockhead">
          <h3 class="thelper__blocktitle">Sample JSON</h3>
          <Button variant="ghost" size="sm" @click="copySample">
            {{ copied === 'json' ? 'Copied' : 'Copy sample' }}
          </Button>
          <Button variant="primary" size="sm" @click="downloadSample">Download sample</Button>
        </div>
        <pre class="thelper__sample"><code>{{ sample }}</code></pre>
      </section>

      <section class="thelper__block">
        <div class="thelper__blockhead">
          <h3 class="thelper__blocktitle">Link Paste Format</h3>
          <Button variant="ghost" size="sm" @click="copyLinkSample">
            {{ copied === 'link' ? 'Copied' : 'Copy link sample' }}
          </Button>
        </div>
        <pre class="thelper__sample"><code>{{ linkSample }}</code></pre>
        <div class="thelper__tablewrap">
          <table class="thelper__table">
            <thead>
              <tr>
                <th scope="col">Param</th>
                <th scope="col">Example</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="param in TASK_TRANSFER_LINK_PARAMS" :key="param.param">
                <th scope="row">
                  <code>{{ param.param }}</code>
                </th>
                <td>
                  <code>{{ param.example }}</code>
                </td>
                <td>{{ param.notes }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="thelper__block">
        <h3 class="thelper__blocktitle">Field Reference</h3>
        <div v-for="scope in scopes" :key="scope.key" class="thelper__scope">
          <h4 class="thelper__scopetitle">{{ scope.label }}</h4>
          <div class="thelper__tablewrap">
            <table class="thelper__table">
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Type</th>
                  <th scope="col">Required</th>
                  <th scope="col">Example</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in fieldsIn(scope.key)" :key="`${field.scope}.${field.field}`">
                  <th scope="row">
                    <code>{{ field.field }}</code>
                  </th>
                  <td>{{ field.type }}</td>
                  <td>{{ field.required ? 'Yes' : 'No' }}</td>
                  <td>
                    <code>{{ field.example }}</code>
                  </td>
                  <td>{{ field.notes }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </SlideOver>
</template>

<style scoped>
.thelper {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
.thelper__lede {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--theme-dim);
}
.thelper__block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.thelper__blockhead {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.thelper__blocktitle {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.thelper__sample {
  margin: 0;
  min-width: 0;
  max-height: 300px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
  font-size: var(--text-2xs);
  line-height: 1.6;
}
.thelper__scope {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.thelper__scopetitle {
  margin: var(--sp-2) 0 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.thelper__tablewrap {
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
.thelper__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-2xs);
}
.thelper__table th,
.thelper__table td {
  padding: var(--sp-2);
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--glass-border);
}
.thelper__table thead th {
  color: var(--theme-dim);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.thelper__table tbody th {
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.thelper__table td:last-child {
  min-width: 220px;
  color: var(--theme-dim);
}
</style>
