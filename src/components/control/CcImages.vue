<script setup lang="ts">
// The image studio (POST /api/images/generate, GET /api/images/jobs/{id},
// POST …/cancel, GET /api/images, GET /api/images/{id}/file, DELETE
// /api/images/{id}). The API queues; the server's image worker generates. A job
// is read back every few seconds until it is done, failed or cancelled, and an
// image is shown only once the server says it is done and names the asset.
//
// The job being watched lives in src/images/watch.ts, app-wide: leaving the
// page does not stop it, and its end is announced wherever you are (in-app,
// and as a browser notification when that is turned on here).
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormField from '@/components/ui/FormField.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TextArea from '@/components/ui/TextArea.vue'
import { aureon, errorMessage } from '@/api/client'
import { apiUrl } from '@/api/config'
import { retryAfterMs } from '@/api/resilient'
import { must } from '@/control/api'
import {
  DEFAULT_STEPS,
  MAX_STEPS,
  SIZES,
  eta,
  etaText,
  isTerminal,
  jobLine,
  jobTone,
  type ImageAsset,
} from '@/control/images'
import { useNow } from '@/control/poll'
import {
  browserNotifyOn,
  imageWatch,
  notificationsSupported,
  onImageFinished,
  resumeImageJob,
  setBrowserNotify,
  watchImageJob,
} from '@/images/watch'
import { bytes } from '@/control/system'
import { when } from '@/trading/format'

const PAGE = 24

// ---- the form --------------------------------------------------------------

const prompt = ref('')
const negative = ref('')
const size = ref<string>(SIZES[0])
const steps = ref<number | null>(null)
const seed = ref<number | null>(null)
const submitting = ref(false)
const formError = ref('')

const sizeOptions = SIZES.map((s) => ({ value: s, label: s.replace('x', ' × ') }))

async function generate() {
  if (!prompt.value.trim() || submitting.value) return
  submitting.value = true
  formError.value = ''
  try {
    const r = await aureon.POST('/api/images/generate', {
      body: {
        prompt: prompt.value.trim(),
        negative_prompt: negative.value.trim() || null,
        size: size.value,
        steps: steps.value ?? null,
        seed: seed.value ?? null,
      },
    })
    if (!r.response.ok || !r.data) {
      formError.value = failure(r.response, r.error)
      return
    }
    watchImageJob(r.data)
  } catch (e) {
    formError.value = (e as Error).message || 'Could not reach Aureon.'
  } finally {
    submitting.value = false
  }
}

/** The server's reason, with what a 429 or 503 means here. */
function failure(res: Response, body: unknown): string {
  const msg = errorMessage(body, `Aureon answered ${res.status}`)
  if (res.status === 429) {
    const wait = retryAfterMs(res.headers.get('retry-after'))
    return wait
      ? `The image queue is full. Try again in about ${Math.ceil(wait / 60_000)} min.`
      : 'The image queue is full. Try again later.'
  }
  if (res.status === 503) return `Image generation is unavailable on the server: ${msg}.`
  return msg
}

// ---- the job being watched -------------------------------------------------

const job = computed(() => (imageWatch.job?.prompt !== undefined ? imageWatch.job : null))
const jobError = computed(() => imageWatch.error)
const now = useNow(5_000)
const jobEta = computed(() => (job.value ? etaText(eta(job.value, now.value)) : ''))

const stopFinished = onImageFinished((j) => {
  if (j.status === 'done') void gallery.reload(true)
})

// Browser notification when a job ends: off until asked for, from a tap.
const notifySupported = notificationsSupported()
const notifyOn = ref(browserNotifyOn())
const notifyNote = ref('')
async function toggleNotify() {
  notifyNote.value = ''
  notifyOn.value = await setBrowserNotify(!notifyOn.value)
  if (!notifyOn.value && Notification.permission === 'denied') {
    notifyNote.value = 'Notifications are blocked for this site in the browser settings.'
  }
}

const cancelling = ref(false)
async function cancel() {
  if (!job.value) return
  cancelling.value = true
  try {
    const r = await aureon.POST('/api/images/jobs/{job_id}/cancel', {
      params: { path: { job_id: job.value.id } },
    })
    if (!r.response.ok || !r.data) imageWatch.error = failure(r.response, r.error)
    else watchImageJob(r.data)
  } catch (e) {
    imageWatch.error = (e as Error).message
  } finally {
    cancelling.value = false
  }
}

onMounted(resumeImageJob)
onBeforeUnmount(stopFinished)

const doneAsset = computed(() =>
  job.value?.status === 'done' && job.value.asset_id
    ? (gallery.items.value.find((a) => a.id === job.value!.asset_id) ?? null)
    : null,
)

// ---- the gallery -----------------------------------------------------------

const gallery = (() => {
  const items = shallowRef<ImageAsset[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  async function reload(fresh = false) {
    loading.value = true
    error.value = ''
    try {
      const offset = fresh ? 0 : items.value.length
      const page = must(
        await aureon.GET('/api/images', { params: { query: { limit: PAGE, offset } } }),
      )
      items.value = fresh ? page.items : [...items.value, ...page.items]
      total.value = page.total
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }
  return { items, total, loading, error, reload }
})()
void gallery.reload(true)

const viewing = shallowRef<ImageAsset | null>(null)
const deleting = shallowRef<ImageAsset | null>(null)
const deleteBusy = ref(false)
const deleteError = ref('')

async function confirmDelete() {
  const a = deleting.value
  if (!a) return
  deleteBusy.value = true
  deleteError.value = ''
  try {
    const r = await aureon.DELETE('/api/images/{asset_id}', {
      params: { path: { asset_id: a.id } },
    })
    if (!r.response.ok && r.response.status !== 404) {
      deleteError.value = failure(r.response, r.error)
      return
    }
    gallery.items.value = gallery.items.value.filter((x) => x.id !== a.id)
    gallery.total.value = Math.max(0, gallery.total.value - 1)
    if (viewing.value?.id === a.id) viewing.value = null
    deleting.value = null
  } catch (e) {
    deleteError.value = (e as Error).message
  } finally {
    deleteBusy.value = false
  }
}

function reuse(a: ImageAsset) {
  prompt.value = a.prompt
  seed.value = a.seed
  steps.value = a.steps
  size.value = `${a.width}x${a.height}`
  viewing.value = null
  globalThis.document?.getElementById('img-prompt')?.focus()
}
</script>

<template>
  <div class="tp-page">
    <div class="tp-grid">
      <Card title="Generate">
        <form class="cc-form" @submit.prevent="generate">
          <FormField label="Prompt" required>
            <TextArea
              id="img-prompt"
              v-model="prompt"
              :rows="3"
              :maxlength="1000"
              :autocorrect="false"
              placeholder="A lighthouse on a cliff at dusk, oil painting"
            />
          </FormField>
          <FormField label="Negative prompt" hint="What to keep out of the image. Optional.">
            <TextArea
              v-model="negative"
              :rows="2"
              :maxlength="1000"
              :autocorrect="false"
              placeholder="blurry, text, watermark"
            />
          </FormField>
          <FormField label="Size">
            <SegmentedControl v-model="size" :options="sizeOptions" aria-label="Image size" />
          </FormField>
          <div class="img-pair">
            <FormField label="Steps" :hint="`1–${MAX_STEPS}; empty uses the server's default`">
              <NumberInput
                v-model="steps"
                :min="1"
                :max="MAX_STEPS"
                :step="1"
                :placeholder="String(DEFAULT_STEPS)"
              />
            </FormField>
            <FormField label="Seed" hint="Same seed + prompt = same image. Empty is random.">
              <NumberInput v-model="seed" :min="0" :step="1" placeholder="random" />
            </FormField>
          </div>
          <div class="tp-row">
            <Button
              type="submit"
              variant="primary"
              :loading="submitting"
              :disabled="!prompt.trim() || (!!job && !isTerminal(job))"
              >Generate</Button
            >
            <span v-if="job && !isTerminal(job)" class="tp-note"
              >One at a time: wait for this job, or cancel it.</span
            >
          </div>
          <p v-if="formError" class="cc-notice cc-notice--danger" role="alert">{{ formError }}</p>
        </form>
      </Card>

      <Card title="Current job">
        <template v-if="job">
          <div class="tp-head">
            <Badge :tone="jobTone(job.status)" :label="job.status" />
            <span class="tp-note">{{ job.model }} · {{ job.width }} × {{ job.height }}</span>
          </div>
          <p class="tp-strong img-prompt">{{ job.prompt }}</p>
          <p class="tp-note" role="status" aria-live="polite">
            {{ jobLine(job) }}<template v-if="jobEta"> · {{ jobEta }}</template>
          </p>
          <ProgressBar
            v-if="job.status === 'running'"
            :value="job.progress"
            :label="`Progress ${job.progress}%`"
            size="sm"
          />
          <p class="tp-note">
            Seed {{ job.seed }} · {{ job.steps }} steps · queued {{ when(job.created_at)
            }}{{ job.attempts > 1 ? ` · attempt ${job.attempts}` : '' }}
          </p>
          <button
            v-if="doneAsset"
            type="button"
            class="img-result"
            :aria-label="`Open the generated image: ${doneAsset.prompt}`"
            @click="viewing = doneAsset"
          >
            <img
              :src="apiUrl(doneAsset.url)"
              :alt="doneAsset.prompt"
              :width="doneAsset.width"
              :height="doneAsset.height"
            />
          </button>
          <p v-if="jobError" class="tp-note" role="alert">{{ jobError }}</p>
          <div v-if="!isTerminal(job)" class="tp-row">
            <Button
              size="sm"
              variant="ghost"
              :loading="cancelling"
              :disabled="job.cancel_requested"
              @click="cancel"
              >{{ job.cancel_requested ? 'Stopping…' : 'Cancel' }}</Button
            >
            <Button
              v-if="notifySupported"
              size="sm"
              variant="ghost"
              :aria-pressed="notifyOn"
              @click="toggleNotify"
              >{{ notifyOn ? 'Browser notification on' : 'Notify me when done' }}</Button
            >
          </div>
          <p v-if="notifyNote" class="tp-note" role="alert">{{ notifyNote }}</p>
          <p v-if="!isTerminal(job)" class="tp-note">
            You can leave this page: the job keeps running on the server and Spasta tells you when
            it ends.
          </p>
        </template>
        <p v-else class="tp-note">
          No job running. A generated image appears here, and in the gallery, once the server
          reports it done.
        </p>
      </Card>
    </div>

    <Card :title="`Gallery${gallery.total.value ? ` · ${gallery.total.value}` : ''}`">
      <ul v-if="gallery.items.value.length" class="img-grid">
        <li v-for="a in gallery.items.value" :key="a.id" class="img-cell">
          <button
            type="button"
            class="img-tile"
            :aria-label="`Open: ${a.prompt}`"
            @click="viewing = a"
          >
            <img
              :src="apiUrl(a.url)"
              :alt="a.prompt"
              :width="a.width"
              :height="a.height"
              loading="lazy"
              decoding="async"
            />
          </button>
          <span class="img-meta"
            >{{ a.width }}×{{ a.height }} · {{ a.steps }} steps · seed {{ a.seed }}</span
          >
        </li>
      </ul>
      <div v-else-if="gallery.loading.value" class="img-grid" aria-hidden="true">
        <Skeleton v-for="n in 6" :key="n" height="140px" radius="var(--radius-card)" />
      </div>
      <p v-else-if="gallery.error.value" class="tp-note" role="alert">
        {{ gallery.error.value }}
      </p>
      <EmptyState
        v-else
        title="No images yet"
        description="Generated images are kept on the server's data disk and listed here."
      />
      <div v-if="gallery.items.value.length < gallery.total.value" class="tp-row img-more">
        <Button size="sm" variant="ghost" :loading="gallery.loading.value" @click="gallery.reload()"
          >Load more</Button
        >
      </div>
    </Card>

    <Modal :open="!!viewing" :title="viewing?.prompt ?? ''" size="lg" @close="viewing = null">
      <div v-if="viewing" class="cc-form">
        <img
          class="img-full"
          :src="apiUrl(viewing.url)"
          :alt="viewing.prompt"
          :width="viewing.width"
          :height="viewing.height"
        />
        <p class="tp-note">
          {{ viewing.model }} · {{ viewing.width }} × {{ viewing.height }} · seed
          {{ viewing.seed }} · {{ viewing.steps }} steps · {{ bytes(viewing.size_bytes) }} ·
          {{ when(viewing.created_at) }}
        </p>
        <div class="tp-row">
          <Button size="sm" variant="ghost" @click="reuse(viewing)">Use these settings</Button>
          <a class="img-link" :href="apiUrl(viewing.url)" :download="`aureon-${viewing.id}.png`"
            >Download</a
          >
          <a class="img-link" :href="apiUrl(viewing.url)" target="_blank" rel="noopener"
            >Open file</a
          >
          <Button size="sm" variant="ghost" @click="deleting = viewing">Delete…</Button>
        </div>
      </div>
    </Modal>

    <Modal :open="!!deleting" title="Delete this image?" size="sm" @close="deleting = null">
      <div class="cc-form">
        <p class="tp-note">The file is removed from the server's disk. This cannot be undone.</p>
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
.img-pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: var(--sp-3);
  min-width: 0;
}
.img-prompt {
  margin: var(--sp-2) 0 0;
}
.img-result,
.img-tile {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 1px solid var(--glass-border, var(--theme-border));
  border-radius: var(--radius-card);
  background: none;
  overflow: hidden;
  cursor: zoom-in;
  transition: border-color 120ms var(--ease-out);
}
.img-result {
  margin-top: var(--sp-2);
}
.img-result:hover,
.img-tile:hover {
  border-color: var(--theme-accent);
}
.img-result:focus-visible,
.img-tile:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.img-result img,
.img-tile img,
.img-full {
  display: block;
  width: 100%;
  height: auto;
}
.img-tile img {
  aspect-ratio: 1;
  object-fit: cover;
}
.img-full {
  max-height: 70vh;
  object-fit: contain;
  border-radius: var(--radius-card);
}
.img-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr));
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.img-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.img-meta {
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-secondary, var(--theme-dim));
  overflow-wrap: anywhere;
}
.img-link {
  font-size: var(--text-sm);
  color: var(--theme-accent);
}
.img-more {
  justify-content: center;
  margin-top: var(--sp-3);
}
@media (prefers-reduced-motion: reduce) {
  .img-result,
  .img-tile {
    transition: none;
  }
}
</style>
