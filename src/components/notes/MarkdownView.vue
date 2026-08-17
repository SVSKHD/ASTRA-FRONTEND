<script setup lang="ts">
// The rendered side of a note.
//
// Takes markdown source and nothing else: no HTML ever arrives here from a
// caller, so there is exactly one place where a note becomes DOM and it is the
// sanitised pipeline. Rendering is memoised on the source string, so a parent
// that re-renders for an unrelated reason does not re-parse the note.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { internalPath, renderMarkdown } from '@/utils/mdRender'

const props = withDefaults(defineProps<{ source: string; interactive?: boolean }>(), {
  interactive: false,
})
const emit = defineEmits<{ 'toggle-task': [number] }>()

const router = useRouter()
const { c } = useStyles()

// A plain computed *is* the memo: Vue caches it against `source`, so typing in
// the editor re-renders only when the debounced source actually changed.
const html = computed(() => renderMarkdown(props.source))

const body = ref<HTMLElement | null>(null)

function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return

  // A ticked box writes back to the markdown source rather than living in the
  // DOM, so the parent is told which box it was and edits the text.
  if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    if (!props.interactive) {
      event.preventDefault()
      return
    }
    const boxes = Array.from(body.value?.querySelectorAll('input[type="checkbox"]') ?? [])
    const index = boxes.indexOf(target)
    // The re-render comes from the new source; letting the DOM change too would
    // make the box flicker between the two.
    event.preventDefault()
    if (index >= 0) emit('toggle-task', index)
    return
  }

  // An in-app link routes rather than reloading the whole SPA.
  const anchor = target.closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') || ''
  const path = anchor.hasAttribute('data-internal') ? internalPath(href) : null
  if (!path) return
  event.preventDefault()
  void router.push(path)
}

const style = computed(() => pxify({ color: c.value.text, fontSize: 13, lineHeight: 1.6 }))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- the only source is the
       sanitised pipeline in utils/mdRender; see the module comment there. -->
  <div ref="body" class="md" :style="style" v-html="html" @click="onClick"></div>
</template>
