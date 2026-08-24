<script setup lang="ts">
// Settings → Security → Devices (section 27a).
//
// Three sections in one drawer, in the order a worried person reads them:
// what is signed in right now, where it has been, and what has happened.
//
// The privacy line is not boilerplate at the bottom. A page that shows a user a
// map of themselves owes them, in the same view, a plain sentence about what is
// actually stored — and here that sentence is short and true, because the thing
// most people assume is stored (the IP address) is not.
import { computed, onMounted, ref, watch } from 'vue'
import SlideOver from '@/components/ui/SlideOver.vue'
import Button from '@/components/ui/Button.vue'
import Alert from '@/components/ui/Alert.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import DeviceRow from '@/components/security/DeviceRow.vue'
import ActivityList from '@/components/security/ActivityList.vue'
import SessionMap from '@/components/security/SessionMap.vue'
import {
  clearActivityHistory,
  fetchActivity,
  fetchSessions,
  revokeOtherSessions,
  revokeSession,
} from '@/services/deviceSessions'
import { mapPoints, newCountryAlert } from '@/utils/sessionView'
import { locationLabel } from '@/utils/device'
import type { ActivityEvent, DeviceSession } from '@/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const sessions = ref<DeviceSession[]>([])
const events = ref<ActivityEvent[]>([])
const loading = ref(false)
const busyId = ref<string | null>(null)
const error = ref('')
const now = ref(Date.now())

// Dismissal is per browser rather than per account: the banner is a nudge to
// look at the list, and having looked, this reader is done with it. Someone
// signing in on another machine should still see it.
const DISMISS_KEY = 'aureon:new-country-dismissed'
const dismissedAt = ref<number | null>(readDismissed())

function readDismissed(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(DISMISS_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

const others = computed(() => sessions.value.filter((s) => !s.current))
const points = computed(() => mapPoints(sessions.value))
const alert = computed(() => newCountryAlert(events.value, now.value, dismissedAt.value))

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  now.value = Date.now()
  try {
    const [s, a] = await Promise.all([fetchSessions(), fetchActivity()])
    sessions.value = s
    events.value = a
  } catch (err) {
    // Named rather than swallowed: an empty devices list and a failed read look
    // identical, and "you have no other devices" is a dangerous thing to say
    // when the truth is "we could not check".
    error.value = err instanceof Error ? err.message : 'Could not load your devices.'
  } finally {
    loading.value = false
  }
}

async function run(id: string, action: () => Promise<unknown>): Promise<void> {
  busyId.value = id
  error.value = ''
  try {
    await action()
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'That did not work. Try again.'
  } finally {
    busyId.value = null
  }
}

const onRevoke = (id: string) => run(id, () => revokeSession(id))
const onRevokeAll = () => run('all', () => revokeOtherSessions())
const onClearHistory = () => run('history', () => clearActivityHistory())

function dismissAlert(): void {
  const at = alert.value?.at ?? Date.now()
  dismissedAt.value = at
  try {
    globalThis.localStorage?.setItem(DISMISS_KEY, String(at))
  } catch {
    // A browser that will not remember the dismissal shows the banner again
    // next time. Mildly annoying; not worth an error.
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) void load()
  },
)
onMounted(() => {
  if (props.open) void load()
})
</script>

<template>
  <SlideOver :open="open" title="Security" size="lg" @close="emit('close')">
    <div class="sec">
      <Alert v-if="error" tone="danger" title="Could not load">{{ error }}</Alert>

      <Alert
        v-if="alert"
        tone="warning"
        title="New sign-in location"
        dismissible
        @dismiss="dismissAlert"
      >
        Someone signed in from {{ locationLabel(alert.city, alert.country) }} — the first time from
        there in 90 days. If that was not you, revoke the device below and change your password.
      </Alert>

      <section class="sec__block">
        <header class="sec__head">
          <h3 class="sec__title">Devices</h3>
          <Button
            v-if="others.length"
            size="sm"
            variant="secondary"
            :disabled="busyId !== null"
            @click="onRevokeAll"
          >
            Sign out everywhere else
          </Button>
        </header>

        <div v-if="loading" class="sec__loading">
          <Skeleton v-for="n in 3" :key="n" height="56px" />
        </div>
        <ul v-else-if="sessions.length" class="sec__list">
          <DeviceRow
            v-for="session in sessions"
            :key="session.id"
            :session="session"
            :now="now"
            :busy="busyId !== null"
            @revoke="onRevoke"
          />
        </ul>
        <EmptyState
          v-else
          title="No devices recorded yet"
          description="This device will appear here the next time the app loads."
        />
      </section>

      <section v-if="points.length" class="sec__block">
        <h3 class="sec__title">Recent locations</h3>
        <SessionMap :points="points" :now="now" />
      </section>

      <section class="sec__block">
        <header class="sec__head">
          <h3 class="sec__title">Recent activity</h3>
          <Button
            v-if="events.length"
            size="sm"
            variant="ghost"
            :disabled="busyId !== null"
            @click="onClearHistory"
          >
            Clear history
          </Button>
        </header>
        <ActivityList :events="events" :now="now" />
      </section>

      <!-- The whole privacy story, in four lines, on the page it is about. -->
      <aside class="sec__privacy">
        <Icon name="shield" size="sm" class="sec__privacy-icon" />
        <div class="sec__privacy-text">
          <p class="sec__privacy-title">What is stored</p>
          <p class="sec__privacy-body">
            An approximate location (city and country, to about 10km), the device type, and the
            browser and operating system. Your IP address is <strong>not</strong> stored — it is
            hashed on the server and discarded. Activity older than 90 days and devices you signed
            out more than 30 days ago are deleted automatically.
          </p>
        </div>
      </aside>
    </div>
  </SlideOver>
</template>

<style scoped>
.sec {
  display: grid;
  gap: var(--sp-6);
  min-width: 0;
}
.sec__block {
  display: grid;
  gap: var(--sp-3);
  min-width: 0;
}
.sec__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.sec__title {
  min-width: 0;
  margin: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
.sec__list {
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sec__loading {
  display: grid;
  gap: var(--sp-2);
}
.sec__privacy {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-card, 10px);
  background: var(--bg-elevated, var(--glass-card));
}
.sec__privacy-icon {
  flex-shrink: 0;
  color: var(--text-secondary, var(--theme-dim));
}
.sec__privacy-text {
  min-width: 0;
}
.sec__privacy-title {
  margin: 0 0 var(--sp-1);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary, var(--theme-text));
}
.sec__privacy-body {
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
  overflow-wrap: anywhere;
}
</style>
