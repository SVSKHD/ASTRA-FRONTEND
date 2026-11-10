<script setup lang="ts">
// The trading panel's navigation (src/trading/sections.ts has the list and why
// it is grouped). Tablet and desktop: a grouped sidebar. Phone: one button that
// names the current section and opens every section, grouped, in a sheet —
// fifteen tabs do not fit a phone's width, and a scrolling strip hides most of
// them.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import Icon from '@/components/ui/Icon.vue'
import { useUiStore } from '@/stores/ui'
import { grouped, SECTIONS, type SectionKey } from '@/trading/sections'

const props = defineProps<{
  section: SectionKey
  /** Counts shown beside a section (the Paper approvals). */
  badges?: Partial<Record<SectionKey, number>>
}>()
const emit = defineEmits<{ go: [SectionKey] }>()

const { isPhone } = storeToRefs(useUiStore())
const groups = grouped()
const current = computed(() => SECTIONS.find((s) => s.key === props.section) ?? SECTIONS[0])
const sheetOpen = ref(false)

function pick(key: SectionKey) {
  sheetOpen.value = false
  if (key !== props.section) emit('go', key)
}
</script>

<template>
  <template v-if="isPhone">
    <button
      type="button"
      class="tnav-phone"
      :aria-expanded="sheetOpen"
      aria-haspopup="dialog"
      data-testid="trading-nav-phone"
      @click="sheetOpen = true"
    >
      <Icon :name="current.icon" size="md" class="tnav__icon" />
      <span class="tnav-phone__label">{{ current.label }}</span>
      <span class="tnav-phone__hint">All sections</span>
      <Icon name="chevron-down" size="sm" />
    </button>
    <BottomSheet :open="sheetOpen" title="Trading sections" @close="sheetOpen = false">
      <nav class="tnav tnav--sheet" aria-label="Trading sections">
        <section v-for="g in groups" :key="g.key" class="tnav__group">
          <h3 class="tnav__heading">{{ g.label }}</h3>
          <button
            v-for="s in g.sections"
            :key="s.key"
            type="button"
            class="tnav__item"
            :class="{ 'is-on': s.key === section }"
            :aria-current="s.key === section ? 'page' : undefined"
            @click="pick(s.key)"
          >
            <Icon :name="s.icon" size="md" class="tnav__icon" />
            <span class="tnav__label">{{ s.label }}</span>
            <span
              v-if="badges?.[s.key]"
              class="tnav__badge"
              :aria-label="`${badges[s.key]} waiting`"
              >{{ badges[s.key] }}</span
            >
          </button>
        </section>
      </nav>
    </BottomSheet>
  </template>

  <nav v-else class="tnav tnav--side" aria-label="Trading sections">
    <section v-for="g in groups" :key="g.key" class="tnav__group">
      <h3 class="tnav__heading">{{ g.label }}</h3>
      <button
        v-for="s in g.sections"
        :key="s.key"
        type="button"
        class="tnav__item"
        :class="{ 'is-on': s.key === section }"
        :aria-current="s.key === section ? 'page' : undefined"
        @click="pick(s.key)"
      >
        <Icon :name="s.icon" size="sm" class="tnav__icon" />
        <span class="tnav__label">{{ s.label }}</span>
        <span v-if="badges?.[s.key]" class="tnav__badge" :aria-label="`${badges[s.key]} waiting`">{{
          badges[s.key]
        }}</span>
      </button>
    </section>
  </nav>
</template>

<style scoped>
.tnav {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.tnav--side {
  position: sticky;
  top: var(--sp-4);
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  background: var(--glass-bg);
}
.tnav__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tnav__heading {
  margin: 0 0 var(--sp-1);
  padding: 0 var(--sp-2);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.tnav__item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  min-height: 36px;
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.tnav__item:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--theme-text);
}
.tnav__item:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.tnav__item.is-on {
  background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--theme-accent) 35%, transparent);
  color: var(--theme-text);
}
.tnav__item.is-on .tnav__icon {
  color: var(--theme-accent);
}
.tnav__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tnav__badge {
  flex-shrink: 0;
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  text-align: center;
}
.tnav--sheet .tnav__item {
  min-height: 44px;
  font-size: var(--text-md);
}
@media (pointer: coarse) {
  .tnav__item {
    min-height: 44px;
  }
}
.tnav-phone {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  background: var(--glass-bg);
  color: var(--theme-text);
  font-size: var(--text-md);
  cursor: pointer;
}
.tnav-phone__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-weight: var(--weight-semibold);
}
.tnav-phone__hint {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
@media (prefers-reduced-motion: reduce) {
  .tnav__item {
    transition: none;
  }
}
</style>
