<script setup lang="ts">
// The panel an empty month gets instead of a shrug.
//
// It shows up under the empty table, offers one button, and answers with the
// four facts that separate "the fetch is broken" from "September has no trades
// in it": what was queried, what the exact query returned, what the account
// owns anywhere in that collection, and which months those rows are actually
// in. Every finding names the fix rather than the symptom.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { useCollectionProbe } from '@/composables/useCollectionProbe'
import type { CollectionKey } from '@/utils/collections'

const props = defineProps<{
  collectionKey: CollectionKey
  field: string
  from: string
  to: string
  /** What the reader calls this data, for the button's label. */
  label: string
}>()

const probe = useCollectionProbe({
  key: props.collectionKey,
  field: props.field,
  from: () => props.from,
  to: () => props.to,
})

const report = computed(() => probe.report.value)

const ICONS = {
  ok: 'check',
  warn: 'alert-circle',
  error: 'alert-circle',
} as const
</script>

<template>
  <section class="probe">
    <div class="probe__head">
      <div class="probe__intro">
        <strong>Nothing here for this month.</strong>
        <span>
          An empty result and a broken query look identical on screen. This asks the database which
          one it is.
        </span>
      </div>
      <Button variant="ghost" size="sm" :loading="probe.busy.value" @click="probe.run()">
        {{ report || probe.error.value ? 'Check again' : `Why is ${props.label} empty?` }}
      </Button>
    </div>

    <p v-if="probe.error.value" class="probe__note">{{ probe.error.value }}</p>

    <template v-if="report">
      <!-- The facts first, because half the time the reader can see the answer
           in them before reading a word of the explanation. -->
      <dl class="probe__facts">
        <div>
          <dt>Collection</dt>
          <dd>{{ report.collection }}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{{ report.uid }}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>{{ report.from }} → {{ report.to }}</dd>
        </div>
        <div>
          <dt>Matched this month</dt>
          <dd>{{ report.monthCount }}</dd>
        </div>
        <div>
          <dt>Yours in this collection</dt>
          <dd>{{ report.ownedCount }}{{ report.ownedCapped ? '+' : '' }}</dd>
        </div>
        <div v-if="report.months.length">
          <dt>Months with rows</dt>
          <dd>{{ report.months.slice(0, 8).join(', ') }}</dd>
        </div>
      </dl>

      <ul class="probe__findings">
        <li v-for="(f, i) in report.findings" :key="i" :class="`is-${f.level}`">
          <Icon :name="ICONS[f.level]" size="sm" />
          <div>
            <strong>{{ f.title }}</strong>
            <span>{{ f.detail }}</span>
            <a
              v-if="report.indexUrl"
              class="probe__link"
              :href="report.indexUrl"
              target="_blank"
              rel="noreferrer noopener"
            >
              Create the index
              <Icon name="external-link" size="xs" />
            </a>
          </div>
        </li>
      </ul>

      <p v-if="report.alternates.length" class="probe__note">
        Also checked:
        <template v-for="(a, i) in report.alternates" :key="a.name">
          <span v-if="i">, </span>
          <code>{{ a.name }}</code>
          <span>{{ a.error ? ` (${a.error})` : a.found ? ' — has rows' : ' — empty' }}</span>
        </template>
      </p>
    </template>
  </section>
</template>

<style scoped>
.probe {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px dashed var(--theme-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
}
.probe__head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  min-width: 0;
}
.probe__intro {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 260px;
  min-width: 0;
}
.probe__intro strong {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.probe__intro span,
.probe__note {
  font-size: var(--text-xs);
  color: var(--theme-dim);
  line-height: 1.5;
  margin: 0;
}
.probe__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-2) var(--sp-4);
  margin: 0;
  min-width: 0;
}
.probe__facts div {
  min-width: 0;
}
.probe__facts dt {
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.probe__facts dd {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--theme-text);
  /* A uid and a collection name are data, and long: they wrap rather than
     pushing the grid wider than the panel. */
  overflow-wrap: anywhere;
  min-width: 0;
}
.probe__findings {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  list-style: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.probe__findings li {
  display: flex;
  gap: var(--sp-2);
  min-width: 0;
}
.probe__findings li > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.probe__findings strong {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.probe__findings span {
  font-size: var(--text-xs);
  color: var(--theme-dim);
  line-height: 1.5;
}
/* The same three tone tokens Alert uses, so a warning here is the colour a
   warning is everywhere else. Only the icon takes the tone; the text stays
   readable, because colour is never the only thing carrying the level — the
   sentence says it too. */
.probe__findings .is-ok > .ui-icon {
  color: var(--theme-success);
}
.probe__findings .is-warn > .ui-icon {
  color: var(--theme-warning);
}
.probe__findings .is-error > .ui-icon {
  color: var(--theme-danger);
}
.probe__link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  align-self: flex-start;
  margin-top: 4px;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-accent);
}
.probe__note code {
  font-family: var(--font-mono);
  color: var(--theme-text);
}
</style>
