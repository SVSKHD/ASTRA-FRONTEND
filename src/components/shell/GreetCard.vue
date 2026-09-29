<script setup lang="ts">
// The greeting at the top of the left gutter, drawn as a window onto the sky.
//
// The card is a small scene that tells the time before a word is read: a dawn,
// day, dusk or night sky; the sun (or the moon) riding an arc across it by the
// hour; stars at night; and the actual weather laid over it — drifting clouds,
// rain, snow. On top sits the greeting by name, the temperature, the town, and
// one line about the day: what is due today, or a word for the hour.
//
// The weather waits to be asked for: the first time, a "Show weather" button
// stands in its place, because opening the browser's location prompt on page
// load is rude. Once allowed it fills itself in on later visits.
//
// The sky's colours are scene art — like the starfield — not theme chrome, so
// they are literals, and this file is listed as identity in hardcoded.test.ts.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { describe, useWeather } from '@/composables/useWeather'
import { useUpcoming } from '@/composables/useUpcoming'
import Icon from '@/components/ui/Icon.vue'

const { user } = storeToRefs(useAuthStore())
const { now } = storeToRefs(useUiStore())
const { weather, start, stop, allow } = useWeather()
const { list } = useUpcoming()
onMounted(start)
onBeforeUnmount(stop)

const date = computed(() => new Date(now.value))
const hour = computed(() => date.value.getHours() + date.value.getMinutes() / 60)

// --- the words ---------------------------------------------------------------
const name = computed(() => (user.value?.name || '').trim().split(/\s+/)[0] || '')
const salutation = computed(() => {
  const h = hour.value
  return h < 5
    ? 'Good night'
    : h < 12
      ? 'Good morning'
      : h < 17
        ? 'Good afternoon'
        : h < 22
          ? 'Good evening'
          : 'Good night'
})
const dateLine = computed(() =>
  date.value.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }),
)
// One line about the day: what is due before midnight, or a word for the hour.
const dueToday = computed(() => {
  const end = new Date(now.value)
  end.setHours(23, 59, 59, 999)
  return list.value.filter((u) => u.ms >= 0 && now.value + u.ms <= end.getTime()).length
})
const overdue = computed(() => list.value.filter((u) => u.ms < 0).length)
const line = computed(() => {
  if (overdue.value) return `${overdue.value} overdue — worth a look`
  if (dueToday.value)
    return dueToday.value === 1 ? '1 thing due today' : `${dueToday.value} things due today`
  const p = phase.value
  return p === 'dawn'
    ? 'An early start.'
    : p === 'day'
      ? 'A clear run at the day.'
      : p === 'dusk'
        ? 'Time to wind down.'
        : 'Rest well.'
})
// How much of today is left, as a thin line along the foot of the card.
const dayLeft = computed(() => Math.round(100 - (hour.value / 24) * 100))

// --- the sky ----------------------------------------------------------------
type Phase = 'dawn' | 'day' | 'dusk' | 'night'
const phase = computed<Phase>(() => {
  const h = hour.value
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'dusk'
  return 'night'
})
const isNight = computed(() => phase.value === 'night')

// The sun rides 6:00 → 20:00; the moon 20:00 → 6:00. Both on the same arc,
// low at the edges and high in the middle.
const orb = computed(() => {
  const h = hour.value
  const t = isNight.value ? (h >= 20 ? h - 20 : h + 4) / 10 : (h - 6) / 14
  const k = Math.min(1, Math.max(0, t))
  return {
    left: 8 + k * 78 + '%',
    top: 62 - Math.sin(Math.PI * k) * 48 + '%',
  }
})

const code = computed(() => weather.reading?.code ?? 0)
const conditions = computed(() =>
  weather.reading ? describe(weather.reading.code, weather.reading.isDay) : null,
)
const cloudCount = computed(() => {
  const c = code.value
  if (!weather.reading || c === 0) return 0
  if (c <= 2) return 2
  return 4
})
const raining = computed(() => {
  const c = code.value
  return (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95
})
const snowing = computed(() => {
  const c = code.value
  return (c >= 71 && c <= 77) || c === 85 || c === 86
})
const gloomy = computed(() => code.value >= 3)

// Fixed, scattered positions: the same sky every render, not a new one per tick.
const STARS = Array.from({ length: 16 }, (_, i) => ({
  left: ((i * 37) % 97) + 1.5 + '%',
  top: ((i * 23) % 58) + 4 + '%',
  delay: ((i * 0.7) % 3).toFixed(2) + 's',
  size: i % 4 === 0 ? 2.5 : 1.5,
}))
const DROPS = Array.from({ length: 18 }, (_, i) => ({
  left: ((i * 53) % 100) + '%',
  delay: ((i * 0.37) % 1.4).toFixed(2) + 's',
}))
const CLOUDS = [
  { top: '14%', scale: 1, dur: '38s', delay: '-4s' },
  { top: '30%', scale: 0.75, dur: '52s', delay: '-26s' },
  { top: '6%', scale: 0.6, dur: '46s', delay: '-14s' },
  { top: '38%', scale: 0.9, dur: '60s', delay: '-40s' },
]
</script>

<template>
  <section
    class="greet"
    :class="['is-' + phase, { 'is-gloomy': gloomy }]"
    aria-label="Greeting and weather"
  >
    <!-- The scene. Purely decorative: everything it shows is also in words. -->
    <div class="sky" aria-hidden="true">
      <template v-if="isNight">
        <span
          v-for="(st, i) in STARS"
          :key="'s' + i"
          class="star"
          :style="{
            left: st.left,
            top: st.top,
            width: st.size + 'px',
            height: st.size + 'px',
            animationDelay: st.delay,
          }"
        ></span>
      </template>
      <span class="orb" :class="isNight ? 'orb--moon' : 'orb--sun'" :style="orb"></span>
      <span
        v-for="(cl, i) in CLOUDS.slice(0, cloudCount)"
        :key="'c' + i"
        class="cloud"
        :style="{
          top: cl.top,
          '--s': cl.scale,
          animationDuration: cl.dur,
          animationDelay: cl.delay,
        }"
      ></span>
      <template v-if="raining || snowing">
        <span
          v-for="(d, i) in DROPS"
          :key="'d' + i"
          :class="snowing ? 'flake' : 'drop'"
          :style="{ left: d.left, animationDelay: d.delay }"
        ></span>
      </template>
      <span class="veil"></span>
    </div>

    <div class="greet__body">
      <p class="greet__date">{{ dateLine }}</p>
      <h2 class="greet__hello">
        <span class="greet__salute">{{ salutation }},</span>
        <span class="greet__name">{{ name || 'there' }}</span>
      </h2>

      <div v-if="weather.reading && conditions" class="greet__weather">
        <span class="greet__temp">{{ weather.reading.temp }}°</span>
        <span class="greet__sky">
          <span class="greet__label"
            ><Icon :name="conditions.icon" size="sm" />{{ conditions.label }}</span
          >
          <span v-if="weather.reading.place" class="greet__place">
            <Icon name="map-pin" size="xs" />{{ weather.reading.place }}
          </span>
        </span>
      </div>
      <p v-else-if="weather.status === 'loading'" class="greet__note">Reading the sky…</p>
      <p v-else-if="weather.status === 'denied'" class="greet__note">
        Location is blocked for this site, so no weather.
      </p>
      <p v-else-if="weather.status === 'unsupported'" class="greet__note">
        This browser cannot share a location.
      </p>
      <button v-else type="button" class="greet__allow" @click="allow">
        <Icon name="map-pin" size="xs" />{{
          weather.status === 'error' ? 'Try the weather again' : 'Show weather here'
        }}
      </button>

      <p class="greet__line">{{ line }}</p>
    </div>

    <!-- What is left of today, as a thin line along the foot. -->
    <span class="greet__day" :title="dayLeft + '% of today left'" aria-hidden="true">
      <span :style="{ width: 100 - dayLeft + '%' }"></span>
    </span>
  </section>
</template>

<style scoped>
.greet {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  min-height: 196px;
  border-radius: var(--radius-dialog);
  border: 1px solid oklch(1 0 0 / 0.14);
  box-shadow: 0 2px 10px oklch(0 0 0 / 0.22);
  color: oklch(0.99 0 0);
}

/* ---- the sky, by the hour ---- */
.sky {
  position: absolute;
  inset: 0;
  z-index: -1;
  transition: background 1.2s ease;
}
.is-dawn .sky {
  background: linear-gradient(
    170deg,
    oklch(0.42 0.1 290) 0%,
    oklch(0.62 0.13 330) 55%,
    oklch(0.78 0.12 40) 100%
  );
}
.is-day .sky {
  background: linear-gradient(
    175deg,
    oklch(0.56 0.13 250) 0%,
    oklch(0.7 0.1 235) 60%,
    oklch(0.83 0.06 215) 100%
  );
}
.is-dusk .sky {
  background: linear-gradient(
    170deg,
    oklch(0.3 0.09 290) 0%,
    oklch(0.48 0.14 330) 50%,
    oklch(0.68 0.15 38) 100%
  );
}
.is-night .sky {
  background: linear-gradient(
    175deg,
    oklch(0.16 0.04 275) 0%,
    oklch(0.22 0.06 280) 60%,
    oklch(0.3 0.07 290) 100%
  );
}
/* Overcast and worse: the same sky, drained. */
.is-gloomy .sky::after {
  content: '';
  position: absolute;
  inset: 0;
  background: oklch(0.45 0.01 260 / 0.45);
}
/* A darker floor under the words, so they read over any sky. */
.veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 20%, oklch(0 0 0 / 0.42) 100%);
}

/* The sun, or the moon, on its arc. */
.orb {
  position: absolute;
  width: 34px;
  height: 34px;
  margin: -17px 0 0 -17px;
  border-radius: 50%;
  transition:
    left 1.5s ease,
    top 1.5s ease;
}
.orb--sun {
  background: radial-gradient(circle at 40% 38%, oklch(0.98 0.06 100), oklch(0.88 0.15 85) 70%);
  box-shadow:
    0 0 18px 6px oklch(0.9 0.14 85 / 0.55),
    0 0 60px 20px oklch(0.9 0.12 80 / 0.25);
  animation: glow 5s ease-in-out infinite;
}
.orb--moon {
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  background: transparent;
  box-shadow:
    inset -7px -3px 0 0 oklch(0.95 0.02 250),
    0 0 20px 2px oklch(0.9 0.03 250 / 0.25);
}
@keyframes glow {
  50% {
    box-shadow:
      0 0 24px 9px oklch(0.9 0.14 85 / 0.6),
      0 0 70px 26px oklch(0.9 0.12 80 / 0.3);
  }
}

.star {
  position: absolute;
  border-radius: 50%;
  background: oklch(0.98 0 0);
  animation: twinkle 3s ease-in-out infinite;
}
@keyframes twinkle {
  50% {
    opacity: 0.25;
  }
}

/* A cloud is three soft circles in one shadow, drifting left to right. */
.cloud {
  position: absolute;
  left: -30%;
  width: 60px;
  height: 20px;
  border-radius: 20px;
  background: oklch(0.97 0 0 / 0.85);
  filter: blur(1px);
  transform: scale(var(--s, 1));
  box-shadow:
    14px -9px 0 2px oklch(0.97 0 0 / 0.85),
    32px -4px 0 0 oklch(0.97 0 0 / 0.85);
  animation: drift linear infinite;
}
.is-gloomy .cloud {
  background: oklch(0.8 0.01 260 / 0.9);
  box-shadow:
    14px -9px 0 2px oklch(0.8 0.01 260 / 0.9),
    32px -4px 0 0 oklch(0.8 0.01 260 / 0.9);
}
@keyframes drift {
  to {
    left: 120%;
  }
}

.drop,
.flake {
  position: absolute;
  top: -10%;
  animation: fall linear infinite;
}
.drop {
  width: 1.5px;
  height: 12px;
  background: linear-gradient(transparent, oklch(0.92 0.03 240 / 0.8));
  animation-duration: 0.9s;
}
.flake {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: oklch(0.99 0 0 / 0.9);
  animation-duration: 3.2s;
}
@keyframes fall {
  to {
    transform: translateY(240px);
  }
}

/* ---- the words ---- */
.greet__body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 18px 18px;
  min-height: 196px;
  justify-content: flex-end;
  text-shadow: 0 1px 8px oklch(0 0 0 / 0.35);
}
.greet__date {
  position: absolute;
  top: 14px;
  left: 18px;
  margin: 0;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.85;
}
.greet__hello {
  display: flex;
  flex-direction: column;
  margin: 0;
  line-height: 1.1;
}
.greet__salute {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  opacity: 0.9;
}
.greet__name {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  letter-spacing: -0.01em;
}
.greet__weather {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  min-width: 0;
}
.greet__temp {
  flex-shrink: 0;
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.greet__sky {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.greet__label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.greet__place {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  font-size: var(--text-xs);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.greet__line {
  margin: 8px 0 0;
  font-size: var(--text-xs);
  opacity: 0.9;
}
.greet__note {
  margin: 8px 0 0;
  font-size: var(--text-xs);
  opacity: 0.9;
}
.greet__allow {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid oklch(1 0 0 / 0.45);
  background: oklch(1 0 0 / 0.14);
  color: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.greet__allow:hover {
  background: oklch(1 0 0 / 0.24);
}

/* The day so far, as a hairline along the foot. */
.greet__day {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: oklch(1 0 0 / 0.12);
}
.greet__day span {
  display: block;
  height: 100%;
  background: oklch(1 0 0 / 0.65);
}

@media (prefers-reduced-motion: reduce) {
  .orb--sun,
  .star,
  .cloud,
  .drop,
  .flake {
    animation: none;
  }
  .cloud {
    left: 20%;
  }
  .drop,
  .flake {
    display: none;
  }
}
</style>
