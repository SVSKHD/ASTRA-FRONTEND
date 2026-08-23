<script setup lang="ts">
// The rendered side of a note.
//
// Takes markdown source and nothing else: no HTML ever arrives here from a
// caller, so there is exactly one place where a note becomes DOM and it is the
// sanitised pipeline. Rendering is memoised on the source string, so a parent
// that re-renders for an unrelated reason does not re-parse the note.
//
// Everything expensive is conditional on the note actually needing it — the
// highlighter is fetched only when there is a fence, the progressive control
// appears only past the size threshold, the lightbox mounts only on a click.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { internalPath, renderMarkdownResult } from '@/utils/mdRender'
import { fenceLabel, highlightFences } from '@/utils/mdHighlight'
import { blockCount, progressive } from '@/utils/mdChunks'

const props = withDefaults(
  defineProps<{
    source: string
    // Only an interactive view writes a ticked box back to the source.
    interactive?: boolean
    // A search term to mark in the rendering. The match is found in the source;
    // this highlights it where the reader is actually looking.
    highlight?: string
  }>(),
  { interactive: false, highlight: '' },
)
const emit = defineEmits<{ 'toggle-task': [number] }>()

const router = useRouter()
const { c } = useStyles()

// --- progressive rendering --------------------------------------------------
const expanded = ref(false)
watch(
  () => props.source,
  () => {
    expanded.value = false
  },
)
const split = computed(() => progressive(props.source))
const visibleSource = computed(() =>
  split.value.truncated && !expanded.value ? split.value.head : props.source,
)
const restBlocks = computed(() => (split.value.truncated ? blockCount(split.value.rest) : 0))

// A plain computed *is* the memo: Vue caches it against the source, so typing in
// the editor re-renders only when the debounced source actually changed.
const rendered = computed(() => renderMarkdownResult(visibleSource.value))
const html = computed(() => rendered.value.html)

const body = ref<HTMLElement | null>(null)

// --- fences: language label, copy button, lazy highlighting -----------------
let copiedTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(copiedTimer))

async function decorate() {
  await nextTick()
  const root = body.value
  if (!root) return

  for (const pre of Array.from(root.querySelectorAll('pre.md-fence'))) {
    if ((pre as HTMLElement).dataset.decorated) continue
    ;(pre as HTMLElement).dataset.decorated = 'true'
    const head = document.createElement('div')
    head.className = 'md-fence-head'
    const label = document.createElement('span')
    label.textContent = fenceLabel((pre as HTMLElement).dataset.lang || '')
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'md-fence-copy'
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => {
      const text = pre.querySelector('code')?.textContent ?? ''
      void navigator.clipboard?.writeText(text)
      copy.textContent = 'Copied'
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        copy.textContent = 'Copy'
      }, 1500)
    })
    head.append(label, copy)
    pre.parentNode?.insertBefore(head, pre)
  }

  // A broken image shows its alt text rather than the browser's broken glyph.
  for (const img of Array.from(root.querySelectorAll('img.md-img'))) {
    const el = img as HTMLImageElement
    if (el.dataset.guarded) continue
    el.dataset.guarded = 'true'
    el.addEventListener('error', () => {
      const alt = document.createElement('span')
      alt.className = 'md-img-broken'
      alt.textContent = el.getAttribute('alt') || 'Image unavailable'
      el.replaceWith(alt)
    })
  }

  // The highlighter is fetched here and only here — after a render that
  // actually produced a fence (acceptance 83).
  if (rendered.value.hasCode) void highlightFences(root)
}

watch(html, decorate, { immediate: true, flush: 'post' })

// --- lightbox ---------------------------------------------------------------
const lightbox = ref('')

function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return

  // A ticked box writes back to the markdown source rather than living in the
  // DOM, so the parent is told which box it was and edits the text.
  if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    // The re-render comes from the new source; letting the DOM change too would
    // make the box flicker between the two.
    event.preventDefault()
    if (!props.interactive) return
    const boxes = Array.from(body.value?.querySelectorAll('input[type="checkbox"]') ?? [])
    const index = boxes.indexOf(target)
    if (index >= 0) emit('toggle-task', index)
    return
  }

  if (target instanceof HTMLImageElement && target.classList.contains('md-img')) {
    lightbox.value = target.getAttribute('src') || ''
    return
  }

  // An in-app link routes rather than reloading the whole SPA.
  const anchor = target.closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') || ''
  // A same-page anchor (the table of contents) scrolls rather than navigating.
  if (href.startsWith('#')) {
    event.preventDefault()
    body.value?.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  const path = anchor.hasAttribute('data-internal') ? internalPath(href) : null
  if (!path) return
  event.preventDefault()
  void router.push(path)
}

// --- search highlighting ----------------------------------------------------
// Applied to the rendered text rather than the source, so the reader sees the
// match where they are reading it. Text nodes only — never inside a tag, which
// is what keeps this from being able to inject markup.
watch(
  [html, () => props.highlight],
  () => {
    void nextTick(() => markMatches())
  },
  // Immediate, because a note is usually opened *from* a search — the term is
  // already set when the view mounts and would otherwise never be marked.
  { immediate: true, flush: 'post' },
)

function markMatches() {
  const root = body.value
  if (!root) return
  for (const old of Array.from(root.querySelectorAll('mark.md-hit'))) {
    old.replaceWith(document.createTextNode(old.textContent || ''))
  }
  const term = props.highlight.trim()
  if (term.length < 2) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.parentElement?.closest('pre')) continue
    if ((node.textContent || '').toLowerCase().includes(term.toLowerCase())) hits.push(node)
  }
  for (const node of hits) {
    const text = node.textContent || ''
    const fragment = document.createDocumentFragment()
    let cursor = 0
    for (;;) {
      const found = text.toLowerCase().indexOf(term.toLowerCase(), cursor)
      if (found === -1) break
      fragment.append(document.createTextNode(text.slice(cursor, found)))
      const hit = document.createElement('mark')
      hit.className = 'md-hit'
      hit.textContent = text.slice(found, found + term.length)
      fragment.append(hit)
      cursor = found + term.length
    }
    fragment.append(document.createTextNode(text.slice(cursor)))
    node.replaceWith(fragment)
  }
}

const style = computed(() => pxify({ color: c.value.text, ...typeStep('sm'), lineHeight: 1.6 }))
const moreBtn = computed(() =>
  pxify({
    width: '100%',
    marginTop: 12,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px dashed ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    ...typeStep('xs'),
    cursor: 'pointer',
  }),
)
const lightboxStyle = pxify({
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'rgba(0,0,0,0.82)',
  cursor: 'zoom-out',
})
const lightboxImg = pxify({ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 })
</script>

<template>
  <div>
    <!-- eslint-disable-next-line vue/no-v-html -- the only source is the
         sanitised pipeline in utils/mdRender; see the module comment there. -->
    <div ref="body" class="md" :style="style" v-html="html" @click="onClick"></div>
    <button v-if="split.truncated && !expanded" :style="moreBtn" @click="expanded = true">
      Show the rest of this note ({{ restBlocks }} more block{{ restBlocks === 1 ? '' : 's' }})
    </button>
    <div
      v-if="lightbox"
      :style="lightboxStyle"
      role="dialog"
      aria-modal="true"
      aria-label="Image"
      @click="lightbox = ''"
    >
      <img :src="lightbox" :style="lightboxImg" alt="" />
    </div>
  </div>
</template>
