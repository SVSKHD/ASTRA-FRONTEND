<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { defaultProfile, fetchProfile, saveProfile } from '@/utils/profile'
import ProfileEditor from '@/components/profile/ProfileEditor.vue'
import AuthDialog from '@/components/AuthDialog.vue'
const resume = ref(defaultProfile())
const auth = useAuthStore()
const editing = ref(false)
const signingIn = ref(false)
const saving = ref(false)
const profileError = ref('')
const profileNotice = ref('')
function signIn() {
  signingIn.value = true
  auth.openAuth()
}
async function publishProfile(next: ReturnType<typeof defaultProfile>) {
  if (!auth.isSignedIn || saving.value) return
  saving.value = true
  profileError.value = ''
  try {
    await saveProfile(next)
    resume.value = next
    editing.value = false
    profileNotice.value = 'Profile saved.'
  } catch {
    profileError.value =
      'Could not save the profile. Check your connection and that the profile database migration has been applied.'
  } finally {
    saving.value = false
  }
}
watch(
  () => auth.isSignedIn,
  (signedIn) => {
    if (!signedIn) editing.value = false
    else signingIn.value = false
  },
)
import '@/styles/profile.css'

const pageRoot = ref<HTMLElement | null>(null)
const motionReady = ref(false)
const light = ref(false)
const frosted = ref(false)
const active = ref('')
const progress = ref(0)
const roleIndex = ref(0)
const role = computed(
  () => resume.value.hero.roles[roleIndex.value % resume.value.hero.roles.length],
)
const ticker = computed(() => resume.value.ticker[roleIndex.value % resume.value.ticker.length])
const technologies = computed(() => resume.value.stack.flatMap((group) => group.items))
const sections = computed(() => [
  { id: 'about', label: 'About' },
  { id: 'stack', label: 'Stack' },
  { id: 'projects', label: 'Projects' },
  ...(resume.value.experience.length ? [{ id: 'experience', label: 'Experience' }] : []),
  ...(resume.value.education.length ? [{ id: 'education', label: 'Education' }] : []),
])
const pdf = `${import.meta.env.BASE_URL}profile/hithesh-svsk-resume.pdf`
let timer: ReturnType<typeof setInterval> | undefined
let previousTitle = ''
let observer: IntersectionObserver | undefined
let revealFallback: ReturnType<typeof setTimeout> | undefined
function setFinish(value: boolean) {
  frosted.value = value
  try {
    localStorage.setItem('profile-finish', value ? 'frosted' : 'liquid')
  } catch {
    /* Optional preference. */
  }
}
function spotlight(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  const card = event.currentTarget as HTMLElement
  const bounds = card.getBoundingClientRect()
  card.style.setProperty('--pf-mx', `${event.clientX - bounds.left}px`)
  card.style.setProperty('--pf-my', `${event.clientY - bounds.top}px`)
}
function reveal() {
  const root = pageRoot.value
  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const targets = root.querySelectorAll<HTMLElement>(
    '.pf-section-head, .pf-intro, .pf-focus, .pf-stack-card, .pf-featured, .pf-project, .pf-outro',
  )
  targets.forEach((el) => {
    el.classList.add('pf-reveal')
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-visible')
  })
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer?.unobserve(entry.target)
          }
      },
      { threshold: 0.1 },
    )
    targets.forEach((el) => observer?.observe(el))
    motionReady.value = true
    revealFallback = setTimeout(() => targets.forEach((el) => el.classList.add('is-visible')), 2500)
  }
}
function toggleTheme() {
  light.value = !light.value
  try {
    localStorage.setItem('profile-theme', light.value ? 'light' : 'dark')
  } catch {
    /* Optional preference. */
  }
}
function onScroll() {
  const doc = document.documentElement
  progress.value = window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)
  active.value = ''
  for (const section of sections.value) {
    if (
      (document.getElementById(section.id)?.getBoundingClientRect().top ?? Infinity) <
      window.innerHeight * 0.4
    )
      active.value = section.id
  }
}
onMounted(() => {
  void fetchProfile()
    .then((stored) => {
      if (stored) resume.value = stored
    })
    .catch(() => {
      /* Bundled profile remains readable when cloud is unavailable. */
    })
  previousTitle = document.title
  document.title = 'Hithesh SVSK · Full-Stack Developer'
  try {
    light.value = localStorage.getItem('profile-theme') === 'light'
    frosted.value = localStorage.getItem('profile-finish') === 'frosted'
  } catch {
    /* Optional preference. */
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    timer = setInterval(() => roleIndex.value++, 2600)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  reveal()
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(revealFallback)
  observer?.disconnect()
  window.removeEventListener('scroll', onScroll)
  document.title = previousTitle
})
</script>

<template>
  <div
    ref="pageRoot"
    class="profile-page"
    :class="{ 'profile-light': light, 'profile-frosted': frosted, 'pf-motion-ready': motionReady }"
  >
    <RouterLink
      class="pf-home"
      to="/?tab=overview"
      aria-label="Home ? open Spasta app"
      title="Open Spasta app"
      ><svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      >
        <path d="m3 10 9-7 9 7v10H3Z" />
        <path d="M9 20v-7h6v7" /></svg
      ><span>Home</span></RouterLink
    >
    <div class="pf-owner-controls">
      <button v-if="auth.isSignedIn" @click="editing = true">Edit profile</button
      ><button v-else @click="signIn">Owner login</button
      ><span v-if="profileNotice" role="status">{{ profileNotice }}</span>
    </div>
    <AuthDialog v-if="signingIn && !auth.isSignedIn" />
    <button
      v-if="signingIn && !auth.isSignedIn"
      class="pf-login-close"
      aria-label="Close login"
      @click="signingIn = false"
    >
      Close login
    </button>
    <ProfileEditor
      v-if="editing && auth.isSignedIn"
      :profile="resume"
      :saving="saving"
      :error="profileError"
      @save="publishProfile"
      @close="editing = false"
    />
    <a class="pf-skip" href="#profile-main">Skip to content</a>
    <div class="pf-ambient" aria-hidden="true"><i></i><i></i><i></i></div>
    <header class="pf-header">
      <div class="pf-nav pf-glass">
        <a class="pf-brand" href="#profile-top"><span>◆</span> hithesh.svsk</a>
        <nav aria-label="Portfolio sections">
          <a
            v-for="section in sections"
            :key="section.id"
            :href="'#' + section.id"
            :class="{ 'is-active': active === section.id }"
            :aria-current="active === section.id ? 'location' : undefined"
            >{{ section.label }}</a
          >
        </nav>
        <button
          class="pf-theme"
          :aria-label="light ? 'Switch to dark mode' : 'Switch to light mode'"
          @click="toggleTheme"
        >
          {{ light ? '☾' : '☀' }}
        </button>
        <a class="pf-button pf-primary pf-download" :href="pdf" download="Hithesh-SVSK-Resume.pdf"
          >Download PDF <span aria-hidden="true">↓</span></a
        >
      </div>
      <div class="pf-progress" aria-hidden="true">
        <span :style="{ transform: `scaleX(${progress})` }"></span>
      </div>
    </header>

    <main id="profile-main" class="pf-container">
      <section id="profile-top" class="pf-hero" aria-labelledby="pf-name">
        <div class="pf-hero-copy">
          <p class="pf-eyebrow">
            <span class="pf-live"></span> {{ resume.hero.title.split('|')[0].trim() }}
          </p>
          <h1 id="pf-name" :aria-label="resume.hero.name">
            <span class="pf-name-line" aria-hidden="true"
              ><span
                v-for="(letter, index) in resume.hero.name.split(' ')[0]"
                :key="index"
                class="pf-letter"
                :style="{ animationDelay: `${index * 55}ms` }"
                >{{ letter }}</span
              ></span
            >
            <span class="pf-name-line pf-name-gold" aria-hidden="true"
              ><span
                v-for="(letter, index) in resume.hero.name.split(' ').slice(1).join(' ')"
                :key="index"
                class="pf-letter"
                :style="{ animationDelay: `${(index + 8) * 55}ms` }"
                >{{ letter }}</span
              ></span
            >
          </h1>
          <p class="pf-building">
            Building <span :key="role">{{ role }}.</span>
          </p>
          <p class="pf-summary">{{ resume.hero.summary }}</p>
          <div class="pf-actions">
            <a class="pf-button pf-primary" href="#projects">View projects ↓</a
            ><a
              class="pf-button pf-glass"
              href="https://github.com/SVSKHD"
              target="_blank"
              rel="noopener noreferrer"
              >GitHub ↗</a
            >
          </div>
          <ul v-if="resume.hero.links.length" class="pf-contact">
            <li v-for="link in resume.hero.links" :key="link.label">
              <a :href="link.href"
                ><b>{{ link.label }}</b> {{ link.value }}</a
              >
            </li>
          </ul>
        </div>
        <aside
          @pointermove="spotlight"
          @pointerleave="($event.currentTarget as HTMLElement).style.removeProperty('--pf-mx')"
          class="pf-glance pf-glass"
          aria-label="At a glance"
        >
          <div class="pf-terminal-head">
            <span class="pf-dots" aria-hidden="true"><i></i><i></i><i></i></span> at-a-glance.ts
          </div>
          <dl>
            <div v-for="item in resume.glance" :key="item.k">
              <dt>{{ item.k }}</dt>
              <dd>{{ item.v }}</dd>
            </div>
          </dl>
          <div class="pf-ticker">
            <span class="pf-live"></span><span>observing</span
            ><span :key="ticker" class="pf-ticker-symbol">{{ ticker }}</span
            ><span class="pf-caret" aria-hidden="true"></span>
          </div>
          <div class="pf-glance-footer">
            <span>Interface finish</span>
            <div class="pf-finish" role="group" aria-label="Interface finish">
              <button :aria-pressed="!frosted" @click="setFinish(false)">
                <span class="pf-finish-dot" aria-hidden="true"></span>Liquid glass
              </button>
              <button :aria-pressed="frosted" @click="setFinish(true)">
                <span class="pf-finish-dot" aria-hidden="true"></span>Frosted
              </button>
            </div>
          </div>
        </aside>
      </section>

      <div class="pf-marquee" aria-label="Technologies: Python, React, Vue, TypeScript and more">
        <div class="pf-marquee-track" aria-hidden="true">
          <div v-for="copy in 2" :key="copy" class="pf-marquee-set">
            <span v-for="technology in technologies" :key="technology"
              >{{ technology }}<i></i
            ></span>
          </div>
        </div>
      </div>
      <section id="about" class="pf-section" aria-labelledby="pf-about-title">
        <div class="pf-section-head">
          <p class="pf-eyebrow">01 / About</p>
          <h2 id="pf-about-title">
            Python on the backend, <em>React &amp; Vue</em> on the front, markets in between.
          </h2>
        </div>
        <div class="pf-about-content">
          <p class="pf-intro">{{ resume.about.intro }}</p>
          <div class="pf-focus-grid">
            <article
              v-for="(focus, index) in resume.about.focus"
              :key="focus.title"
              class="pf-focus pf-glass"
              :style="{ '--pf-delay': `${index * 90}ms` }"
            >
              <span class="pf-card-number">0{{ index + 1 }}</span>
              <h3>{{ focus.title }}</h3>
              <p>{{ focus.body }}</p>
              <span class="pf-mono pf-muted">{{ focus.tag }}</span>
            </article>
          </div>
        </div>
      </section>

      <section id="stack" class="pf-section" aria-labelledby="pf-stack-title">
        <div class="pf-section-head">
          <p class="pf-eyebrow">02 / Stack</p>
          <h2 id="pf-stack-title">Tools I ship with</h2>
        </div>
        <div class="pf-stack-grid">
          <article
            v-for="(group, groupIndex) in resume.stack"
            :key="group.group"
            class="pf-stack-card pf-glass"
            :style="{ '--pf-delay': `${(groupIndex % 3) * 90}ms` }"
          >
            <div class="pf-stack-heading">
              <span class="pf-stack-icon">{{ group.icon }}</span>
              <h3>{{ group.group }}</h3>
              <span class="pf-mono pf-muted">{{
                String(group.items.length).padStart(2, '0')
              }}</span>
            </div>
            <ul class="pf-tags">
              <li
                v-for="(item, chipIndex) in group.items"
                :key="item"
                :style="{ '--pf-chip-delay': `${300 + chipIndex * 45}ms` }"
              >
                {{ item }}
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section id="projects" class="pf-section" aria-labelledby="pf-project-title">
        <div class="pf-section-head">
          <p class="pf-eyebrow">03 / Featured Projects</p>
          <h2 id="pf-project-title">Selected work</h2>
        </div>
        <article class="pf-featured pf-glass">
          <div class="pf-feature-main">
            <div class="pf-project-top">
              <span class="pf-badge">FEATURED</span
              ><span class="pf-mono pf-muted">Trading system ? {{ resume.featured.role }}</span>
            </div>
            <h3>{{ resume.featured.title }}</h3>
            <p class="pf-project-pitch">{{ resume.featured.pitch }}</p>
            <div class="pf-facts">
              <div v-for="fact in resume.featured.facts" :key="fact.k">
                <strong>{{ fact.v }}</strong
                ><span>{{ fact.k }}</span>
              </div>
            </div>
            <ul class="pf-bullets">
              <li v-for="bullet in resume.featured.bullets" :key="bullet">{{ bullet }}</li>
            </ul>
            <div class="pf-project-footer">
              <ul class="pf-tags pf-gold-tags">
                <li v-for="item in resume.featured.stack" :key="item">{{ item }}</li>
              </ul>
              <a
                v-for="link in resume.featured.links"
                :key="link.href"
                :href="link.href"
                target="_blank"
                rel="noopener noreferrer"
                >{{ link.label }} ?</a
              >
            </div>
          </div>
          <div class="pf-feature-visual">
            <div class="pf-screenshot">
              <span class="pf-image-icon" aria-hidden="true">?</span
              ><span>Discord signal card or dashboard screenshot</span
              ><small>Screenshot coming soon</small>
            </div>
            <div class="pf-pipeline">
              <p class="pf-eyebrow">How it works <span>Signal ? human ? trade</span></p>
              <ol>
                <li
                  v-for="(step, index) in resume.featured.flow"
                  :key="step.label"
                  :style="{ '--pf-pulse-delay': `${index * 1.2}s` }"
                >
                  <span>{{ String(index + 1).padStart(2, '0') }}</span
                  ><strong>{{ step.label }}</strong
                  ><small>{{ step.tech }}</small>
                </li>
              </ol>
              <p class="pf-storage">{{ resume.featured.storage }}</p>
            </div>
          </div>
        </article>
        <div class="pf-project-grid">
          <article
            v-for="(project, index) in resume.projects"
            :key="project.title"
            class="pf-project pf-glass"
            :style="{ '--pf-delay': `${(index % 2) * 90}ms` }"
          >
            <div v-if="index > 0" class="pf-screenshot">
              <span class="pf-image-icon" aria-hidden="true">?</span
              ><span>{{
                index === 1
                  ? 'Pet Feed Planner screenshot'
                  : index === 2
                    ? 'AquaKart storefront screenshot'
                    : 'Deity view screenshot'
              }}</span
              ><small>Screenshot coming soon</small>
            </div>
            <div class="pf-project-top">
              <span class="pf-badge">{{ project.kind }}</span
              ><span class="pf-card-number">0{{ index + 2 }}</span>
            </div>
            <h3>{{ project.title }}</h3>
            <p class="pf-mono pf-muted">{{ project.role }}</p>
            <div v-if="project.facts.length" class="pf-mini-facts">
              <span v-for="fact in project.facts" :key="fact.k"
                ><b>{{ fact.v }}</b> {{ fact.k }}</span
              >
            </div>
            <ul class="pf-bullets">
              <li v-for="bullet in project.bullets" :key="bullet">{{ bullet }}</li>
            </ul>
            <ol v-if="project.flow.length" class="pf-flow">
              <li v-for="step in project.flow" :key="step">{{ step }}</li>
            </ol>
            <div class="pf-project-footer">
              <ul class="pf-tags pf-gold-tags">
                <li v-for="item in project.stack" :key="item">{{ item }}</li>
              </ul>
              <a
                v-for="link in project.links"
                :key="link.href"
                :href="link.href"
                target="_blank"
                rel="noopener noreferrer"
                >{{ link.label }} ↗</a
              >
            </div>
          </article>
        </div>
      </section>

      <section
        v-if="resume.experience.length"
        id="experience"
        class="pf-section"
        aria-labelledby="pf-experience-title"
      >
        <div class="pf-section-head">
          <p class="pf-eyebrow">04 / Experience</p>
          <h2 id="pf-experience-title">Where I've worked.</h2>
        </div>
        <ol class="pf-experience">
          <li v-for="(job, jobIndex) in resume.experience" :key="jobIndex">
            <div class="pf-job-heading">
              <h3>{{ job.role }}</h3>
              <span>{{ job.org }}</span
              ><time>{{ job.dates }}</time>
            </div>
            <ul class="pf-bullets">
              <li v-for="bullet in job.bullets" :key="bullet">{{ bullet }}</li>
            </ul>
          </li>
        </ol>
      </section>
      <section
        v-if="resume.education.length"
        id="education"
        class="pf-section"
        aria-labelledby="pf-education-title"
      >
        <div class="pf-section-head">
          <p class="pf-eyebrow">05 / Education</p>
          <h2 id="pf-education-title">Education.</h2>
        </div>
        <div v-for="item in resume.education" :key="item.degree" class="pf-education pf-glass">
          <h3>{{ item.degree }}</h3>
          <span>{{ item.school }}</span
          ><span class="pf-mono">{{ item.year }}</span>
        </div>
      </section>
    </main>
    <footer class="pf-footer pf-container">
      <span>Hithesh SVSK · Built with Vue 3 + TypeScript</span>
      <div>
        <RouterLink to="/astra">Explore Aureon ↗</RouterLink
        ><a href="#profile-top">Back to top ↑</a>
      </div>
    </footer>
  </div>
</template>
