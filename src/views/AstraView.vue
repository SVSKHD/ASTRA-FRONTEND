<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const activeFilter = ref('All')
const filters = ['All', 'Focus', 'Finance', 'Ideas']

const activities = [
  {
    time: '09:00',
    title: 'Deep work session',
    detail: 'Product strategy',
    type: 'Focus',
    tone: 'mint',
  },
  {
    time: '11:30',
    title: 'Review monthly runway',
    detail: 'Finance',
    type: 'Finance',
    tone: 'amber',
  },
  {
    time: '14:00',
    title: 'Sketch the next chapter',
    detail: 'Creative practice',
    type: 'Ideas',
    tone: 'coral',
  },
  { time: '16:30', title: 'Walk and reset', detail: 'Personal', type: 'Focus', tone: 'blue' },
]

const visibleActivities = computed(() =>
  activeFilter.value === 'All'
    ? activities
    : activities.filter((activity) => activity.type === activeFilter.value),
)

function enterWorkspace() {
  router.push('/')
}
</script>

<template>
  <main class="astra-page">
    <nav class="astra-nav" aria-label="Primary navigation">
      <button class="brand" type="button" aria-label="Astra home" @click="router.push('/astra')">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <span>ASTRA</span>
      </button>
      <div class="nav-links">
        <a href="#rhythm">Rhythm</a>
        <a href="#signals">Signals</a>
        <button class="nav-cta" type="button" @click="enterWorkspace">
          Open workspace <span aria-hidden="true">↗</span>
        </button>
      </div>
    </nav>

    <section class="astra-hero" aria-labelledby="astra-title">
      <div class="hero-copy">
        <p class="eyebrow"><span class="eyebrow-dot"></span> Thursday, 05 September 2026</p>
        <h1 id="astra-title">Make space for<br /><em>what matters.</em></h1>
        <p class="hero-lede">
          A quiet command center for the things you are building, tending, and becoming.
        </p>
        <div class="hero-actions">
          <button class="primary-button" type="button" @click="enterWorkspace">
            Enter your orbit <span aria-hidden="true">→</span>
          </button>
          <a class="text-link" href="#rhythm">See the rhythm <span aria-hidden="true">↓</span></a>
        </div>
      </div>
      <div class="hero-orbit" aria-label="Astra activity orbit" role="img">
        <div class="orbit orbit-one"></div>
        <div class="orbit orbit-two"></div>
        <div class="orbit-core">
          <span class="core-label">YOUR<br />DAY</span><strong>72%</strong><small>in flow</small>
        </div>
        <span class="orbit-node node-one"></span>
        <span class="orbit-node node-two"></span>
        <span class="orbit-node node-three"></span>
      </div>
    </section>

    <section id="rhythm" class="rhythm-section" aria-labelledby="rhythm-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">A living overview</p>
          <h2 id="rhythm-title">Your day, in rhythm.</h2>
        </div>
        <p class="section-note">A little structure leaves more room for the unexpected.</p>
      </div>

      <div class="dashboard-grid">
        <article class="rhythm-card activity-card">
          <div class="card-topline">
            <span>Today's pulse</span><span class="live-label"><i></i> Live</span>
          </div>
          <div class="pulse-value">4<span> moments</span></div>
          <div class="pulse-bars" aria-label="Activity across the day">
            <span
              v-for="height in [32, 48, 42, 66, 54, 81, 62, 92, 72, 46, 64, 38]"
              :key="height"
              :style="{ height: `${height}%` }"
            ></span>
          </div>
          <div class="chart-labels">
            <span>06:00</span><span>12:00</span><span>18:00</span><span>Now</span>
          </div>
        </article>

        <article id="signals" class="rhythm-card signal-card">
          <div class="card-topline">
            <span>Next signal</span><span class="signal-time">in 01:42</span>
          </div>
          <div class="signal-icon" aria-hidden="true">✦</div>
          <h3>Review monthly runway</h3>
          <p>Finance <span>·</span> 11:30 today</p>
          <button class="quiet-button" type="button" @click="enterWorkspace">
            Open details <span aria-hidden="true">↗</span>
          </button>
        </article>

        <article class="rhythm-card activity-list-card">
          <div class="list-header">
            <div>
              <span class="card-topline">Activity trail</span>
              <h3>Keep moving gently.</h3>
            </div>
            <div class="filter-group" role="group" aria-label="Filter activity">
              <button
                v-for="filter in filters"
                :key="filter"
                type="button"
                :class="{ active: activeFilter === filter }"
                @click="activeFilter = filter"
              >
                {{ filter }}
              </button>
            </div>
          </div>
          <TransitionGroup name="activity" tag="div" class="activity-list">
            <div v-for="activity in visibleActivities" :key="activity.time" class="activity-row">
              <time>{{ activity.time }}</time
              ><span class="activity-dot" :class="activity.tone"></span>
              <div>
                <strong>{{ activity.title }}</strong
                ><small>{{ activity.detail }}</small>
              </div>
              <span class="row-arrow" aria-hidden="true">↗</span>
            </div>
            <p v-if="visibleActivities.length === 0" class="empty-row">
              Nothing here yet. A blank space can be useful too.
            </p>
          </TransitionGroup>
        </article>
      </div>
    </section>

    <footer class="astra-footer">
      <span>ASTRA / a calmer way to keep track</span
      ><span>Built for the long arc <span aria-hidden="true">✧</span></span>
    </footer>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;1,600&display=swap');

.astra-page {
  --ink: #1b2829;
  --muted: #728080;
  --paper: #f4f5ef;
  --line: rgba(27, 40, 41, 0.14);
  --mint: #b9e5d4;
  --coral: #ed896d;
  min-height: 100dvh;
  color: var(--ink);
  background:
    radial-gradient(circle at 80% 12%, rgba(188, 228, 213, 0.7), transparent 26rem),
    linear-gradient(125deg, #f4f5ef 0%, #f8f5ee 58%, #e4f0eb 100%);
  padding: 28px clamp(20px, 5vw, 76px) 34px;
  overflow: hidden;
  font-family: 'Manrope', sans-serif;
}
.astra-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1280px;
  margin: 0 auto;
}
.brand,
.nav-cta,
.primary-button,
.quiet-button,
.filter-group button {
  font: inherit;
  border: 0;
  cursor: pointer;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  background: transparent;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.19em;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--ink);
  border-radius: 50%;
}
.brand-mark span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--coral);
  box-shadow: 0 0 0 5px rgba(237, 137, 109, 0.15);
}
.nav-links {
  display: flex;
  align-items: center;
  gap: clamp(18px, 3vw, 42px);
  font-size: 12px;
  font-weight: 700;
}
.nav-links a {
  color: var(--muted);
  text-decoration: none;
}
.nav-links a:hover {
  color: var(--ink);
}
.nav-cta {
  color: var(--ink);
  background: transparent;
  border-bottom: 1px solid var(--ink);
  padding: 7px 0;
  font-size: 12px;
  font-weight: 800;
}
.astra-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 520px);
  align-items: center;
  gap: 7vw;
  max-width: 1180px;
  min-height: min(670px, 74vh);
  margin: 0 auto;
}
.hero-copy {
  padding: 54px 0 20px;
  animation: rise 0.7s ease both;
}
.eyebrow,
.section-kicker,
.card-topline,
.chart-labels,
.signal-time,
.astra-footer,
.activity-row time {
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
}
.eyebrow-dot,
.live-label i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #5aa886;
  display: inline-block;
  box-shadow: 0 0 0 4px rgba(90, 168, 134, 0.14);
}
h1 {
  margin: 25px 0 22px;
  font-size: clamp(55px, 7.2vw, 98px);
  line-height: 0.98;
  letter-spacing: -0.065em;
  font-weight: 700;
}
.hero-copy h1 em {
  color: var(--coral);
  font-family: 'Playfair Display', serif;
  font-weight: 600;
  letter-spacing: -0.06em;
}
.hero-lede {
  max-width: 380px;
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.7;
}
.hero-actions {
  display: flex;
  align-items: center;
  gap: 25px;
  margin-top: 38px;
}
.primary-button {
  background: var(--ink);
  color: #f8f6ef;
  padding: 15px 20px;
  border-radius: 2px;
  font-size: 12px;
  font-weight: 800;
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}
.primary-button:hover {
  background: #304546;
  transform: translateY(-2px);
}
.primary-button span {
  margin-left: 14px;
  color: var(--mint);
}
.text-link {
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  border-bottom: 1px solid var(--line);
  padding-bottom: 4px;
}
.text-link span {
  margin-left: 7px;
}
.hero-orbit {
  position: relative;
  width: min(42vw, 510px);
  aspect-ratio: 1;
  margin: auto;
  animation: rise 0.9s 0.15s ease both;
}
.orbit {
  position: absolute;
  inset: 9%;
  border: 1px solid rgba(27, 40, 41, 0.16);
  border-radius: 50%;
  transform: rotate(-24deg) scaleY(0.56);
}
.orbit-two {
  inset: 20% -2%;
  transform: rotate(57deg) scaleY(0.55);
  border-color: rgba(27, 40, 41, 0.11);
}
.orbit-core {
  position: absolute;
  inset: 25%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.38);
  box-shadow:
    0 25px 65px rgba(63, 112, 96, 0.15),
    inset 0 0 0 1px rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
}
.core-label {
  color: var(--muted);
  font:
    10px/1.4 'DM Mono',
    monospace;
  letter-spacing: 0.13em;
  text-align: center;
}
.orbit-core strong {
  margin: 8px 0 2px;
  font-size: 52px;
  letter-spacing: -0.08em;
}
.orbit-core small {
  color: #5aa886;
  font-size: 11px;
  font-weight: 800;
}
.orbit-node {
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--coral);
  box-shadow: 0 0 0 7px rgba(237, 137, 109, 0.13);
}
.node-one {
  top: 7%;
  left: 38%;
}
.node-two {
  right: 7%;
  bottom: 28%;
  width: 9px;
  height: 9px;
  background: #578bc4;
  box-shadow: 0 0 0 6px rgba(87, 139, 196, 0.13);
}
.node-three {
  left: 14%;
  bottom: 20%;
  width: 7px;
  height: 7px;
  background: #e2b456;
  box-shadow: 0 0 0 5px rgba(226, 180, 86, 0.14);
}
.rhythm-section {
  max-width: 1180px;
  margin: 10px auto 0;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 30px;
  border-top: 1px solid var(--line);
  padding-top: 28px;
}
.section-kicker {
  color: var(--coral);
  margin: 0 0 10px;
}
.section-heading h2 {
  margin: 0;
  font-size: clamp(27px, 3vw, 42px);
  letter-spacing: -0.05em;
}
.section-note {
  color: var(--muted);
  max-width: 250px;
  margin: 0 0 3px;
  font-size: 12px;
  line-height: 1.6;
}
.dashboard-grid {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 14px;
  margin-top: 28px;
}
.rhythm-card {
  min-height: 220px;
  padding: 24px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.38);
  box-shadow: 0 12px 35px rgba(40, 78, 68, 0.04);
}
.card-topline {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
}
.live-label {
  color: #5aa886;
  font:
    10px 'DM Mono',
    monospace;
  text-transform: uppercase;
}
.live-label i {
  margin-right: 7px;
  width: 5px;
  height: 5px;
}
.pulse-value {
  margin-top: 24px;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.05em;
}
.pulse-value span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
}
.pulse-bars {
  display: flex;
  align-items: end;
  gap: 7px;
  height: 78px;
  margin: 22px 0 9px;
}
.pulse-bars span {
  flex: 1;
  min-width: 4px;
  background: var(--mint);
  border-radius: 2px 2px 0 0;
}
.pulse-bars span:nth-child(4n) {
  background: var(--coral);
}
.chart-labels {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 9px;
}
.signal-card {
  background: var(--ink);
  color: #f6f4ec;
}
.signal-card .card-topline,
.signal-card p {
  color: #9eacab;
}
.signal-time {
  color: var(--mint);
}
.signal-icon {
  margin-top: 24px;
  color: var(--coral);
  font-size: 28px;
}
.signal-card h3 {
  margin: 8px 0 6px;
  font-size: 19px;
  letter-spacing: -0.04em;
}
.signal-card p {
  margin: 0;
  font-size: 11px;
}
.signal-card p span {
  margin: 0 5px;
  color: var(--coral);
}
.quiet-button {
  margin-top: 23px;
  padding: 0 0 5px;
  border-bottom: 1px solid #657574;
  color: #f6f4ec;
  background: transparent;
  font-size: 11px;
}
.quiet-button span {
  color: var(--mint);
  margin-left: 9px;
}
.activity-list-card {
  grid-column: 1 / -1;
  min-height: 0;
}
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 20px;
}
.list-header h3 {
  margin: 8px 0 0;
  font-size: 19px;
  letter-spacing: -0.04em;
}
.filter-group {
  display: flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(14px);
}
.filter-group button {
  color: var(--muted);
  background: transparent;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 10px;
  transition:
    color 0.25s ease,
    background 0.3s ease,
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.3s ease;
}
.filter-group button:hover {
  color: var(--ink);
  transform: translateY(-1px);
}
.filter-group button.active {
  color: var(--ink);
  background: rgba(255, 255, 255, 0.78);
  box-shadow:
    0 4px 12px rgba(27, 40, 41, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  transform: translateY(-1px);
}
.activity-list {
  margin-top: 21px;
  position: relative;
}
.activity-row {
  display: grid;
  grid-template-columns: 52px 10px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  border-top: 1px solid var(--line);
}
.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mint);
}
.activity-dot.amber {
  background: #e2b456;
}
.activity-dot.coral {
  background: var(--coral);
}
.activity-dot.blue {
  background: #578bc4;
}
.activity-row strong,
.activity-row small {
  display: block;
}
.activity-row strong {
  font-size: 12px;
}
.activity-row small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
}
.row-arrow {
  color: var(--muted);
  font-size: 14px;
}
.empty-row {
  color: var(--muted);
  font-size: 12px;
}
.activity-enter-active,
.activity-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.activity-enter-from,
.activity-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.activity-leave-active {
  position: absolute;
  width: calc(100% - 48px);
}
.astra-footer {
  display: flex;
  justify-content: space-between;
  max-width: 1180px;
  margin: 68px auto 0;
  padding-top: 17px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 9px;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (max-width: 760px) {
  .astra-page {
    padding: 20px 18px 28px;
  }
  .nav-links a {
    display: none;
  }
  .astra-hero {
    display: block;
    min-height: 0;
  }
  .hero-copy {
    padding-top: 72px;
  }
  .hero-orbit {
    width: min(78vw, 380px);
    margin: 54px auto 42px;
  }
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  .activity-list-card {
    grid-column: auto;
  }
  .section-heading,
  .list-header {
    display: block;
  }
  .section-note {
    margin-top: 12px;
  }
  .filter-group {
    margin-top: 20px;
    width: max-content;
  }
  .astra-footer {
    margin-top: 46px;
    gap: 16px;
    line-height: 1.5;
  }
  .astra-footer span:last-child {
    text-align: right;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
