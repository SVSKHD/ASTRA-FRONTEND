<script setup lang="ts">
// Self-repair: whether it is on, the incidents it detected, and the repair
// tasks with their patch (diff viewer) and test output. Retry makes a new task;
// cancel stops a queued one at once and a running one before its next step.
// A repair stops at an opened PR; merging it goes through the approval inbox.
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import DiffViewer from '@/components/control/DiffViewer.vue'
import LogViewer from '@/components/control/LogViewer.vue'
import { aureon } from '@/api/client'
import { must, short } from '@/control/api'
import { usePoll } from '@/control/poll'
import { repairTone } from '@/control/status'
import { ago, when } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const router = useRouter()
const status = useLoad(async () => must(await aureon.GET('/api/v1/repairs/status')))
const incidentFilter = ref<'' | 'open' | 'repair_queued' | 'resolved'>('')
const incidents = useLoad(
  async () =>
    must(
      await aureon.GET('/api/v1/repairs/incidents', {
        params: {
          query: { limit: 30, ...(incidentFilter.value ? { status: incidentFilter.value } : {}) },
        },
      }),
    ),
  false,
)
watch(incidentFilter, () => void incidents.reload(), { immediate: true })
const repairs = useLoad(async () =>
  must(await aureon.GET('/api/v1/repairs', { params: { query: { limit: 30 } } })),
)

const selected = ref('')
const detail = useLoad(async () => {
  if (!selected.value) return null
  return must(
    await aureon.GET('/api/v1/repairs/{repair_id}', {
      params: { path: { repair_id: selected.value } },
    }),
  )
}, false)
watch(selected, () => void detail.reload())

usePoll(() => {
  void status.reload()
  void incidents.reload()
  void repairs.reload()
  if (selected.value) void detail.reload()
}, 15_000)

const busy = ref(false)
const message = ref('')
async function act(what: string, fn: () => Promise<unknown>) {
  busy.value = true
  message.value = ''
  try {
    await fn()
    message.value = `${what}: done.`
    await Promise.all([repairs.reload(), incidents.reload(), detail.reload()])
  } catch (e) {
    message.value = `${what}: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}
const retry = (id: string) =>
  act('Retry', async () => {
    const made = must(
      await aureon.POST('/api/v1/repairs/{repair_id}/retry', {
        params: { path: { repair_id: id } },
      }),
    )
    selected.value = made.id
  })
const cancel = (id: string) =>
  act('Cancel', async () =>
    must(
      await aureon.POST('/api/v1/repairs/{repair_id}/cancel', {
        params: { path: { repair_id: id } },
      }),
    ),
  )
const startRepair = (incidentId: string) =>
  act('Repair', async () => {
    const made = must(await aureon.POST('/api/v1/repairs', { body: { incident_id: incidentId } }))
    selected.value = made.id
  })
const closeIncident = (id: string, how: 'resolve' | 'ignore') =>
  act(how === 'resolve' ? 'Resolve' : 'Ignore', async () =>
    must(
      how === 'resolve'
        ? await aureon.POST('/api/v1/repairs/incidents/{incident_id}/resolve', {
            params: { path: { incident_id: id } },
          })
        : await aureon.POST('/api/v1/repairs/incidents/{incident_id}/ignore', {
            params: { path: { incident_id: id } },
          }),
    ),
  )

const RETRYABLE = ['failed', 'tests_failed', 'blocked', 'cancelled']
const CANCELLABLE = ['queued', 'running', 'patch_ready', 'tests_passed']
</script>

<template>
  <div class="tp-page">
    <Card title="Self-repair">
      <template v-if="status.data.value">
        <div class="tp-row">
          <Badge
            :tone="status.data.value.enabled && !status.data.value.paused ? 'success' : 'warning'"
            :label="!status.data.value.enabled ? 'Off' : status.data.value.paused ? 'Paused' : 'On'"
          />
          <span class="tp-note">{{
            status.data.value.github_repo ?? status.data.value.repo ?? 'no repo set'
          }}</span>
        </div>
        <p v-if="status.data.value.reason" class="tp-note">{{ status.data.value.reason }}</p>
      </template>
      <p v-else-if="status.error.value" class="tp-note" role="alert">{{ status.error.value }}</p>
      <p v-if="message" class="tp-note" role="status">{{ message }}</p>
    </Card>

    <div class="tp-grid">
      <Card title="Incidents">
        <SegmentedControl
          v-model="incidentFilter"
          size="sm"
          aria-label="Incident status"
          :options="[
            { value: '', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'repair_queued', label: 'Repairing' },
            { value: 'resolved', label: 'Resolved' },
          ]"
        />
        <ul v-if="incidents.data.value?.items.length" class="tp-list">
          <li v-for="i in incidents.data.value.items" :key="i.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ i.title }}</span>
              <span class="tp-note"
                >{{ i.source }} · {{ i.severity }} · seen {{ i.count }}× · last
                {{ ago(i.last_seen) }}</span
              >
            </div>
            <div class="tp-row">
              <Badge :tone="repairTone(i.status)" :label="i.status" />
              <template v-if="i.status === 'open'">
                <Button size="sm" variant="secondary" :disabled="busy" @click="startRepair(i.id)"
                  >Repair</Button
                >
                <Button
                  size="sm"
                  variant="ghost"
                  :disabled="busy"
                  @click="closeIncident(i.id, 'resolve')"
                  >Resolve</Button
                >
                <Button
                  size="sm"
                  variant="ghost"
                  :disabled="busy"
                  @click="closeIncident(i.id, 'ignore')"
                  >Ignore</Button
                >
              </template>
              <Button
                v-else-if="i.status !== 'resolved' && i.status !== 'ignored'"
                size="sm"
                variant="ghost"
                :disabled="busy"
                @click="closeIncident(i.id, 'resolve')"
                >Resolve</Button
              >
            </div>
          </li>
        </ul>
        <p v-else-if="incidents.error.value" class="tp-note" role="alert">
          {{ incidents.error.value }}
        </p>
        <EmptyState
          v-else-if="!incidents.loading.value"
          title="No incidents"
          description="Nothing has gone wrong that the detectors noticed."
        />
      </Card>

      <Card title="Repair tasks">
        <ul v-if="repairs.data.value?.items.length" class="tp-list">
          <li v-for="r in repairs.data.value.items" :key="r.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{
                r.files.join(', ') || r.target_paths.join(', ') || `repair ${short(r.id)}`
              }}</span>
              <span class="tp-note"
                >{{ ago(r.created_at) }} · attempt {{ r.attempts
                }}{{ r.pr_number ? ` · PR #${r.pr_number}` : '' }}</span
              >
            </div>
            <div class="tp-row">
              <Badge :tone="repairTone(r.status)" :label="r.status" />
              <Button size="sm" variant="ghost" @click="selected = r.id">Details</Button>
            </div>
          </li>
        </ul>
        <p v-else-if="repairs.error.value" class="tp-note" role="alert">
          {{ repairs.error.value }}
        </p>
        <p v-else-if="!repairs.loading.value" class="tp-note">No repair has been attempted yet.</p>
      </Card>
    </div>

    <Card v-if="detail.data.value" :title="`Repair ${short(detail.data.value.id)}`">
      <div class="tp-row">
        <Badge :tone="repairTone(detail.data.value.status)" :label="detail.data.value.status" />
        <span class="tp-note"
          >{{ detail.data.value.branch ?? 'no branch' }} · base
          {{ short(detail.data.value.base_sha) }} · started
          {{ when(detail.data.value.started_at) }}</span
        >
      </div>
      <p v-if="detail.data.value.blocked_reason" class="tp-note">
        Blocked: {{ detail.data.value.blocked_reason }}
      </p>
      <p v-if="detail.data.value.error" class="tp-note">Error: {{ detail.data.value.error }}</p>
      <div class="tp-row">
        <Button
          v-if="RETRYABLE.includes(detail.data.value.status)"
          size="sm"
          variant="secondary"
          :disabled="busy"
          @click="retry(detail.data.value.id)"
          >Retry</Button
        >
        <Button
          v-if="CANCELLABLE.includes(detail.data.value.status)"
          size="sm"
          variant="danger"
          :disabled="busy"
          @click="cancel(detail.data.value.id)"
          >Cancel</Button
        >
        <Button
          v-if="detail.data.value.pr_number"
          size="sm"
          variant="ghost"
          @click="
            router.push({ path: '/dev/pulls', query: { n: String(detail.data.value.pr_number) } })
          "
          >Open PR #{{ detail.data.value.pr_number }}</Button
        >
      </div>
      <h3 class="tp-title">Patch</h3>
      <DiffViewer
        v-if="detail.data.value.patch"
        :text="detail.data.value.patch"
        label="Repair patch"
      />
      <p v-else class="tp-note">No patch yet.</p>
      <h3 class="tp-title">Test output</h3>
      <LogViewer
        v-if="detail.data.value.test_output"
        :text="detail.data.value.test_output"
        label="Test output"
      />
      <p v-else class="tp-note">The tests have not run yet.</p>
    </Card>
  </div>
</template>
