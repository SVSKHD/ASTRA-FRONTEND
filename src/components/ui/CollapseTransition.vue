<script setup lang="ts">
// The height animation behind every disclosure body that mounts (v-if) or
// shows (v-show) as it opens. Wrap the body element in it:
//
//   <CollapseTransition>
//     <div v-if="open" class="body">…</div>
//   </CollapseTransition>
//
// Opening, the element grows from nothing to its measured height and fades in,
// and its children cascade in (.rx-stagger, disclosure.css). Closing, it folds
// back up before it is removed or hidden. The height comes from scrollHeight
// at the moment of the transition, so there is no max-height guess, and no
// inline height is left behind afterwards.
//
// Reduced motion — or an environment without element.animate, such as the test
// DOM — goes straight to the end state.
const DURATION_IN = 340
const DURATION_OUT = 220
const EASE_IN = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const EASE_OUT = 'cubic-bezier(0.4, 0, 1, 1)'

function still(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof Element === 'undefined' ||
    typeof Element.prototype.animate !== 'function' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

function run(el: Element, done: () => void, opening: boolean) {
  const node = el as HTMLElement
  if (opening) node.classList.add('rx-stagger')
  if (still()) return done()
  const h = node.scrollHeight
  const prevOverflow = node.style.overflow
  node.style.overflow = 'hidden'
  const frames = [
    { height: '0px', opacity: 0 },
    { height: h + 'px', opacity: 1 },
  ]
  const anim = node.animate(opening ? frames : frames.reverse(), {
    duration: opening ? DURATION_IN : DURATION_OUT,
    easing: opening ? EASE_IN : EASE_OUT,
    // Closing holds its last frame until Vue removes or hides the element, so
    // it does not flash back to full height for a frame first.
    fill: opening ? 'none' : 'forwards',
  })
  let settled = false
  anim.onfinish = anim.oncancel = () => {
    if (settled) return
    settled = true
    node.style.overflow = prevOverflow
    // Drop the held closing frame in the same task Vue hides the element, so
    // a v-show body does not reopen at zero height next time.
    if (!opening) anim.cancel()
    done()
  }
}
const onEnter = (el: Element, done: () => void) => run(el, done, true)
const onLeave = (el: Element, done: () => void) => run(el, done, false)
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <slot />
  </Transition>
</template>
