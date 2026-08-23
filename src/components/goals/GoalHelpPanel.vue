<script setup lang="ts">
// "How to add a goal" (section 23).
//
// A drawer rather than a modal, and that is the whole design. Help about a
// screen that is behind a modal is help you cannot follow: you read a step,
// dismiss the modal to do it, and have lost your place. A drawer leaves the
// goals tab visible beside it, so the walkthrough and the thing it describes
// are on screen together.
//
// The content is data (utils/goalHelp), tested against the parser that actually
// reads it. This file only draws it — which is why a schema field gaining a
// note is a one-line change over there and nothing here.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import {
  GOAL_HELP_STEPS,
  GOAL_HELP_TABS,
  GOAL_SCHEMA_FIELDS,
  GOAL_SHORTHAND,
  SAMPLE_GOAL_JSON,
  type GoalHelpTab,
  type SchemaField,
} from '@/utils/goalHelp'
import SlideOver from '@/components/ui/SlideOver.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'

const app = useAppStore()
const router = useRouter()
const { goalHelpOpen, goalHelpTab } = storeToRefs(app)

const tab = computed<GoalHelpTab>({
  get: () => goalHelpTab.value,
  set: (value) => app.setGoalHelpTab(value),
})
const steps = computed(() => GOAL_HELP_STEPS[tab.value])

// The schema table is grouped, because "which of these hangs off a point?" is
// the question a flat list of nineteen rows makes hardest to answer.
const SCOPES: { key: SchemaField['scope']; label: string }[] = [
  { key: 'document', label: 'The document' },
  { key: 'goal', label: 'Each goal' },
  { key: 'point', label: 'Each point' },
]
const fieldsIn = (scope: SchemaField['scope']) =>
  GOAL_SCHEMA_FIELDS.filter((f) => f.scope === scope)

const copied = ref(false)
async function copySchema() {
  try {
    await navigator.clipboard.writeText(SAMPLE_GOAL_JSON)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard blocked. The sample is on screen and selectable, so this is a
    // convenience that failed rather than an error worth a toast.
  }
}

// Hands the sample to the import screen and goes there, rather than importing
// it from here: the point of a sample is to be edited before it is written.
function loadSample() {
  app.seedGoalImport(SAMPLE_GOAL_JSON)
  void router.push('/import/goals')
}
</script>

<template>
  <SlideOver :open="goalHelpOpen" size="lg" title="How to add a goal" @close="app.closeGoalHelp()">
    <div class="ghelp">
      <p class="ghelp__lede">
        Three ways in, and they end in the same place — a goal with a name, an optional timeline and
        a list of points.
      </p>

      <Tabs v-model="tab" :tabs="GOAL_HELP_TABS" />

      <!-- The walkthrough. An ordered list, so the numbering is the document's
           rather than something painted on with CSS counters. -->
      <ol class="ghelp__steps">
        <li v-for="step in steps" :key="step.title" class="ghelp__step">
          <h3 class="ghelp__steptitle">{{ step.title }}</h3>
          <p class="ghelp__stepbody">{{ step.body }}</p>

          <!-- What the step produces. A miniature drawn from the same tokens as
               the real thing — never a screenshot, which would be stale by the
               next theme and unreadable in the other one. -->
          <div class="ghelp__demo" :class="`ghelp__demo--${step.demo.kind}`" aria-hidden="false">
            <template v-if="step.demo.kind === 'card'">
              <span class="ghelp__demotitle">{{ step.demo.title }}</span>
              <span class="ghelp__demometa">{{ step.demo.meta }}</span>
            </template>
            <template v-else-if="step.demo.kind === 'points'">
              <span v-for="line in step.demo.lines" :key="line" class="ghelp__demopoint">
                <Icon name="check-square" size="xs" />
                <span>{{ line }}</span>
              </span>
            </template>
            <code v-else-if="step.demo.kind === 'code'" class="ghelp__democode">{{
              step.demo.code
            }}</code>
            <span v-else class="ghelp__demofield">{{ step.demo.title }}</span>
          </div>
        </li>
      </ol>

      <!-- ---- the shorthand ------------------------------------------------ -->
      <section class="ghelp__block">
        <h3 class="ghelp__blocktitle">Shorthand</h3>
        <p class="ghelp__note">
          Works in a point wherever you type one — the create form, a pasted document, a link.
          Whatever you write is stripped out of the text and stored as the field.
        </p>
        <div class="ghelp__cheats">
          <div v-for="entry in GOAL_SHORTHAND" :key="entry.token" class="ghelp__cheat">
            <code class="ghelp__token">{{ entry.token }}</code>
            <span class="ghelp__cheatmeans">{{ entry.means }}</span>
            <span class="ghelp__cheatex">{{ entry.example }}</span>
          </div>
        </div>
      </section>

      <!-- ---- the schema --------------------------------------------------- -->
      <section class="ghelp__block">
        <div class="ghelp__blockhead">
          <h3 class="ghelp__blocktitle">The JSON</h3>
          <Button variant="ghost" size="sm" @click="copySchema">
            {{ copied ? 'Copied' : 'Copy sample' }}
          </Button>
          <Button variant="primary" size="sm" @click="loadSample">Load sample goal</Button>
        </div>

        <pre class="ghelp__sample"><code>{{ SAMPLE_GOAL_JSON }}</code></pre>

        <div v-for="scope in SCOPES" :key="scope.key" class="ghelp__scope">
          <h4 class="ghelp__scopetitle">{{ scope.label }}</h4>
          <!-- Its own scroller: a five-column table inside a drawer is the one
               place horizontal scrolling is right, and the drawer itself must
               never scroll sideways. -->
          <div class="ghelp__tablewrap">
            <table class="ghelp__table">
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
                <tr v-for="row in fieldsIn(scope.key)" :key="`${row.scope}.${row.field}`">
                  <th scope="row">
                    <code>{{ row.field }}</code>
                  </th>
                  <td>{{ row.type }}</td>
                  <td>{{ row.required ? 'Yes' : 'No' }}</td>
                  <td>
                    <code>{{ row.example }}</code>
                  </td>
                  <td>
                    <!-- Said on the row rather than in a footnote: a reader who
                         only reads this line still learns the field will not
                         survive an import. -->
                    <span v-if="row.source === 'app'" class="ghelp__badge">Set in the app</span>
                    {{ row.notes }}
                  </td>
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
.ghelp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
.ghelp__lede,
.ghelp__note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.ghelp__steps {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin: 0;
  padding-left: var(--sp-4);
  min-width: 0;
}
.ghelp__step {
  min-width: 0;
}
.ghelp__step::marker {
  color: var(--theme-accent);
  font-weight: 700;
}
.ghelp__steptitle {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
}
.ghelp__stepbody {
  margin: 2px 0 var(--sp-2);
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
/* The miniature. Deliberately flatter than a real card — it is an illustration
   of one, and anything that reads as clickable here would be a lie. */
.ghelp__demo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-text) 3%, transparent);
}
.ghelp__demotitle {
  font-size: var(--text-xs);
  font-weight: 600;
}
.ghelp__demometa,
.ghelp__demofield {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ghelp__demopoint {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ghelp__democode {
  min-width: 0;
  overflow-x: auto;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  white-space: pre;
}
.ghelp__block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.ghelp__blockhead {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.ghelp__blocktitle {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.ghelp__cheats {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.ghelp__cheat {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-1) 0;
  border-bottom: 1px solid var(--glass-border);
}
.ghelp__token {
  font-weight: 700;
  color: var(--theme-accent);
}
.ghelp__cheatmeans {
  min-width: 0;
  font-size: var(--text-xs);
}
.ghelp__cheatex {
  grid-column: 2;
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ghelp__sample {
  margin: 0;
  min-width: 0;
  max-height: 240px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-text) 4%, transparent);
  font-size: var(--text-2xs);
  line-height: 1.6;
}
.ghelp__scope {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.ghelp__scopetitle {
  margin: var(--sp-2) 0 0;
  font-size: var(--text-xs);
  font-weight: 600;
}
.ghelp__tablewrap {
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
.ghelp__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-2xs);
}
.ghelp__table th,
.ghelp__table td {
  padding: var(--sp-2);
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--glass-border);
}
.ghelp__table thead th {
  color: var(--theme-dim);
  font-weight: 600;
  white-space: nowrap;
}
.ghelp__table tbody th {
  font-weight: 600;
  white-space: nowrap;
}
.ghelp__table td:last-child {
  min-width: 220px;
  color: var(--theme-dim);
}
.ghelp__badge {
  display: inline-block;
  margin-right: var(--sp-1);
  padding: 0 var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-accent);
  color: var(--theme-accent);
  font-size: var(--text-2xs);
  white-space: nowrap;
}
</style>
