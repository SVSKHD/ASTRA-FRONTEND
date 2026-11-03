<script setup lang="ts">
// How to allocate the money, in sentences (section 35b).
//
// The advice itself is computed in `expensePlan` so it can be tested; this only
// lays it out. Each line leads with a glyph AND a word-carrying title, so the
// tone is never told by colour alone.
import Icon from '@/components/ui/Icon.vue'
import type { Advice, AdviceTone } from '@/utils/expensePlan'
import type { IconName } from '@/components/ui/icons'

defineProps<{ advice: Advice[] }>()

const GLYPH: Record<AdviceTone, IconName> = {
  good: 'check',
  warn: 'alert-circle',
  bad: 'alert-circle',
  info: 'flag',
}
</script>

<template>
  <section class="adv">
    <h3 class="ui-label">How to allocate</h3>
    <ul class="adv__list">
      <li v-for="a in advice" :key="a.id" class="adv__item" :class="`is-${a.tone}`">
        <Icon :name="GLYPH[a.tone]" size="sm" class="adv__glyph" />
        <div class="adv__body">
          <p class="adv__title">{{ a.title }}</p>
          <p class="adv__detail">{{ a.detail }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.adv {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
}
.adv h3 {
  margin: 0;
}
.adv__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.adv__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2);
  border-left: 3px solid var(--theme-dim);
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--text-primary, currentcolor) 4%, transparent);
}
.adv__item:hover {
  background: color-mix(in oklch, var(--text-primary, currentcolor) 8%, transparent);
}
.adv__glyph {
  margin-top: 2px;
  color: var(--theme-dim);
}
.is-good {
  border-left-color: var(--theme-success);
}
.is-good .adv__glyph {
  color: var(--theme-success);
}
.is-warn {
  border-left-color: var(--theme-warning);
}
.is-warn .adv__glyph {
  color: var(--theme-warning);
}
.is-bad {
  border-left-color: var(--theme-danger);
}
.is-bad .adv__glyph {
  color: var(--theme-danger);
}
.is-info {
  border-left-color: var(--theme-accent);
}
.is-info .adv__glyph {
  color: var(--theme-accent);
}
.adv__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.adv__title,
.adv__detail {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.adv__title {
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
.adv__detail {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
