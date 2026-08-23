<script setup lang="ts" generic="Item extends { id: number }">
// The goals grid (section 19d).
//
// Past ~30 cards it virtualises: the browser is asked to lay out only the rows
// on screen plus a small overscan, rather than 200 cards each carrying a ring,
// a menu and a tick. Below that it renders everything, because virtualising a
// short list costs more than it saves and gets in the way of the browser's own
// work.
//
// A virtualiser measures ROWS, so the grid's column count — which `auto-fill`
// normally decides — is computed here from the measured width and the cards are
// packed into rows to match. The two must agree: the same minimum, the same
// gap, the same four-column cap, all named once in utils/gridRows.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import {
  CARD_HEIGHT_PX,
  CARD_MIN_PX,
  GRID_GAP_PX,
  MAX_COLUMNS,
  columnsFor,
  rowCount,
  rowHeight,
  rowSlice,
  shouldVirtualise,
} from '@/utils/gridRows'

// Generic in the item so the slot hands the caller back its own type rather
// than the minimum this component needs (an id, to key rows by).
const props = defineProps<{ items: Item[]; mobile?: boolean }>()
defineSlots<{ default: (props: { item: Item }) => unknown }>()

const scroller = ref<HTMLElement | null>(null)
const width = ref(0)

// The column count follows the container, not the viewport: this grid sits
// inside a panel whose width the window does not describe.
let observer: ResizeObserver | undefined
onMounted(() => {
  const el = scroller.value
  if (!el) return
  width.value = el.clientWidth
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver((entries) => {
    width.value = entries[0]?.contentRect.width ?? el.clientWidth
  })
  observer.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())

const columns = computed(() => (props.mobile ? 1 : columnsFor(width.value)))
const virtualised = computed(() => shouldVirtualise(props.items.length))
const rows = computed(() => rowCount(props.items.length, columns.value))

const virtualizer = useVirtualizer(
  computed(() => ({
    count: virtualised.value ? rows.value : 0,
    getScrollElement: () => scroller.value,
    estimateSize: () => rowHeight(),
    overscan: 2,
  })),
)
const virtualRows = computed(() => virtualizer.value.getVirtualItems())
const totalHeight = computed(() => virtualizer.value.getTotalSize())

function itemsOnRow(row: number) {
  return rowSlice(props.items, row, columns.value)
}

// The template grid for one row: as many equal tracks as the row has columns,
// so a short last row does not stretch its cards across the width.
const rowTemplate = computed(() => `repeat(${columns.value}, minmax(0, 1fr))`)
// The plain (unvirtualised) grid keeps using auto-fill, which is what the
// browser does best when there is nothing to save.
const autoTemplate = computed(() =>
  props.mobile
    ? '1fr'
    : `repeat(auto-fill, minmax(max(${CARD_MIN_PX}px, calc((100% - ${MAX_COLUMNS - 1} * ${GRID_GAP_PX}px) / ${MAX_COLUMNS})), 1fr))`,
)

defineExpose({ columns, virtualised })
</script>

<template>
  <div ref="scroller" class="ggrid">
    <!-- Long list: only the rows on screen exist in the DOM. -->
    <div v-if="virtualised" class="ggrid__runway" :style="{ height: `${totalHeight}px` }">
      <div
        v-for="row in virtualRows"
        :key="String(row.key)"
        class="ggrid__row"
        :style="{
          transform: `translateY(${row.start}px)`,
          height: `${CARD_HEIGHT_PX}px`,
          gridTemplateColumns: rowTemplate,
        }"
      >
        <template v-for="item in itemsOnRow(row.index)" :key="item.id">
          <slot :item="item" />
        </template>
      </div>
    </div>

    <!-- Short list: the browser's own grid, with nothing in its way. -->
    <div v-else class="ggrid__plain" :style="{ gridTemplateColumns: autoTemplate }">
      <template v-for="item in items" :key="item.id">
        <slot :item="item" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.ggrid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px;
}
.ggrid__runway {
  position: relative;
  width: 100%;
}
/* Each row is absolutely placed by the virtualiser's offset — this is a
   scroll runway, not text layout, so it is the one place out-of-flow
   positioning is the right tool. */
.ggrid__row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  display: grid;
  gap: var(--sp-4);
}
.ggrid__plain {
  display: grid;
  grid-auto-rows: minmax(180px, 1fr);
  gap: var(--sp-4);
  align-content: start;
}
</style>
