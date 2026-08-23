<script setup lang="ts">
// The panel Select, MultiSelect and Combobox all open (section 25b).
//
// Portalled to the body, because a listbox that lives inside its own field is
// clipped by the first scrolling ancestor and — inside a dialog — is *still*
// clipped when positioned fixed, since a transform or a backdrop-filter makes
// the dialog the containing block for fixed children. The detail dialogs have
// both. That is acceptance 129, and it is not fixable from inside the field.
//
// Position comes from placePopover, the same arithmetic the date picker uses:
// below by default, flipping above only when below genuinely cannot hold the
// list and above can hold more of it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'
import { placePopover } from '@/utils/popoverPlace'
import type { ListOption } from '@/composables/useListbox'

const props = withDefaults(
  defineProps<{
    open: boolean
    options: ListOption[]
    activeIndex: number
    /** Values currently chosen — one for a Select, many for a MultiSelect. */
    selected: string[]
    anchor: HTMLElement | null
    listboxId: string
    emptyText?: string
    loading?: boolean
  }>(),
  { emptyText: 'No results', loading: false },
)
const emit = defineEmits<{ choose: [ListOption]; hover: [number] }>()

const panel = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0, width: 0, maxHeight: 320 })

function reposition() {
  const a = props.anchor
  const el = panel.value
  if (!a || !el || typeof window === 'undefined') return
  const box = a.getBoundingClientRect()
  const own = el.getBoundingClientRect()
  const placed = placePopover(
    { top: box.top, left: box.left, width: box.width, height: box.height },
    { top: 0, left: 0, width: box.width, height: own.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
  // The panel matches the field's width, which is what makes it read as
  // belonging to the field rather than floating over it.
  pos.value = { top: placed.top, left: placed.left, width: box.width, maxHeight: placed.maxHeight }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    reposition()
  },
)
// Keep the highlight in view when the arrows walk past the fold.
watch(
  () => props.activeIndex,
  async (i) => {
    if (!props.open) return
    await nextTick()
    panel.value?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({
      block: 'nearest',
    })
  },
)

onMounted(() => {
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})

// Ungrouped options come first, then each group under its heading, in the order
// the groups first appear. Sorting the groups would reorder a list the caller
// deliberately ordered.
const sections = computed(() => {
  const out: { group?: string; items: { option: ListOption; index: number }[] }[] = []
  props.options.forEach((option, index) => {
    const key = option.group
    let section = out.find((s) => s.group === key)
    if (!section) {
      section = { group: key, items: [] }
      out.push(section)
    }
    section.items.push({ option, index })
  })
  return out
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      class="ui-lb"
      :style="{
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        width: `${pos.width}px`,
        maxHeight: `${Math.max(120, pos.maxHeight)}px`,
      }"
    >
      <ul :id="listboxId" class="ui-lb__list" role="listbox" :aria-busy="loading">
        <template v-for="section in sections" :key="section.group ?? '—'">
          <li v-if="section.group" class="ui-lb__group" role="presentation">
            {{ section.group }}
          </li>
          <li
            v-for="entry in section.items"
            :id="`${listboxId}-opt-${entry.index}`"
            :key="entry.option.value"
            class="ui-lb__opt"
            :class="{
              'is-active': entry.index === activeIndex,
              'is-selected': selected.includes(entry.option.value),
              'is-disabled': entry.option.disabled,
            }"
            :data-index="entry.index"
            role="option"
            :aria-selected="selected.includes(entry.option.value)"
            :aria-disabled="entry.option.disabled"
            @mousedown.prevent="!entry.option.disabled && emit('choose', entry.option)"
            @mousemove="emit('hover', entry.index)"
          >
            <Icon v-if="entry.option.icon" :name="entry.option.icon as IconName" size="xs" />
            <span class="ui-lb__label">{{ entry.option.label }}</span>
            <!-- A checkmark rather than only a tint: the tint also marks the
                 keyboard highlight, and one appearance for two states means a
                 keyboard user cannot tell what is chosen from where they are. -->
            <Icon
              v-if="selected.includes(entry.option.value)"
              name="check"
              size="xs"
              class="ui-lb__tick"
            />
          </li>
        </template>
        <li v-if="!options.length" class="ui-lb__empty" role="presentation">
          {{ loading ? 'Loading…' : emptyText }}
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-lb {
  position: fixed;
  z-index: 81;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-subtle, var(--glass-border));
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  box-shadow: var(--glass-shadow);
  color: var(--text-primary, var(--theme-text));
}
.ui-lb__list {
  margin: 0;
  padding: var(--sp-1);
  list-style: none;
  min-width: 0;
}
.ui-lb__group {
  padding: var(--sp-2) var(--sp-2) var(--sp-1);
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, var(--theme-dim));
}
.ui-lb__opt {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2);
  border-radius: var(--radius-control);
  font-size: var(--text-base);
  line-height: var(--lh-base);
  cursor: pointer;
}
.ui-lb__opt > :first-child:not(.ui-lb__label) {
  grid-column: 1;
}
.ui-lb__label {
  grid-column: 2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-lb__tick {
  grid-column: 3;
  color: var(--theme-accent);
}
.ui-lb__opt.is-active {
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
}
.ui-lb__opt.is-selected {
  font-weight: var(--weight-medium);
}
.ui-lb__opt.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ui-lb__empty {
  padding: var(--sp-3) var(--sp-2);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-muted, var(--theme-dim));
}
</style>
