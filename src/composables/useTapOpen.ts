// Binds pressGesture to an element that opens something on click (section 18b).
//
// Spread the returned handlers onto the click zone and the open only fires for a
// real tap — a long press (which starts a drag) and a drag that ends over the
// same row both fall through silently.
//
// One session per element, so several rows can be pressed in sequence without
// the last one's start leaking into the next.

import { ref } from 'vue'
import { beginPress, isTap, type PressStart } from '@/utils/pressGesture'

export function useTapOpen(open: (event: MouseEvent) => void) {
  const start = ref<PressStart | null>(null)

  function onPointerDown(event: PointerEvent) {
    // Only the primary button opens; a right click is for the context menu.
    if (event.button !== 0 && event.pointerType === 'mouse') {
      start.value = null
      return
    }
    start.value = beginPress(event.timeStamp, event.clientX, event.clientY)
  }
  function onPointerCancel() {
    // A cancelled pointer is a gesture the browser took over (a scroll, a drag).
    start.value = { at: -Infinity, x: 0, y: 0 }
  }
  function onClick(event: MouseEvent) {
    const began = start.value
    start.value = null
    if (!isTap(began, event.timeStamp, event.clientX, event.clientY)) return
    open(event)
  }

  return { onPointerDown, onPointerCancel, onClick }
}
