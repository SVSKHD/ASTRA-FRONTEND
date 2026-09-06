<script setup lang="ts">
// The header strip for the tabs that are a plain list rather than a day
// accordion. Its only job is to open the create dialog — which is the whole
// point: the add-form that used to sit here is now in the dialog, and the tab
// keeps the space.
//
// IT TELEPORTS INTO THE SHELL'S TOP STRIP (section 44, item 3). The reminder
// pill was fixed to the top-right of the viewport and covered the "+ New todo"
// button that lives in this row. Putting the pill in the strip and this row in
// the strip beside it is what makes the two unable to overlap: they are
// siblings in one flex row, so the browser lays them out with respect to each
// other, which is exactly what two fixed elements can never do.
//
// The teleport is conditional and defaults to off. A toolbar mounted with no
// shell around it — the screenshot stage, the share page, every unit test —
// renders exactly where it stands, as it always did. A `<Teleport disabled>`
// leaves the content in place rather than dropping it, which is why this is one
// element with a flag rather than two branches of a `v-if`.
//
// THE KEY IS LOAD-BEARING, and it cost an afternoon. Vue resolves a Teleport's
// `to` selector ONCE, when the Teleport mounts, and caches the node. This
// toolbar mounts inside the shell's slot content, which Vue patches before the
// shell's own `onMounted` runs — so at that instant `#shell-strip-actions` does
// not exist yet, the cached target is `null`, and flipping `disabled` later
// throws `Cannot read properties of null (reading 'insertBefore')` and silently
// leaves the row where it was. Keying on the flag makes the flip a REMOUNT
// rather than an update, and a remount re-runs the selector against a DOM that
// now has the strip in it.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { STRIP_ACTIONS_ID, shellStripReady } from '@/components/shell/shellKeys'

// `newLabel` is optional: the News and Code tabs are read-only views of things
// that happen elsewhere, and a create button on them would be a button with
// nothing to create (sections 39–40).
defineProps<{ title: string; newLabel?: string }>()
defineEmits<{ (e: 'new'): void }>()

const { s } = useStyles()

const teleportDisabled = computed(() => !shellStripReady.value)
</script>

<template>
  <Teleport
    :key="teleportDisabled ? 'in-place' : 'strip'"
    :to="`#${STRIP_ACTIONS_ID}`"
    :disabled="teleportDisabled"
  >
    <div :style="s.dayToolbar" class="list-toolbar">
      <span v-if="teleportDisabled" :style="s.dayGroupLabelBase">{{ title }}</span>
      <!-- Optional header actions (e.g. a link expand/collapse toggle) sit between
           the title and the create button. -->
      <slot name="actions" />
      <button v-if="newLabel"  :style="s.newBtn" v-hover-style="s.addBtnHover" @click="$emit('new')">
        + {{ newLabel }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
/* In the strip the row must shrink rather than push the reminder off the edge:
   a toolbar with six filter buttons and a long title is wider than a 390px
   screen, and something has to give. It wraps, and its own children ellipsis. */
.list-toolbar {
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
}
</style>
