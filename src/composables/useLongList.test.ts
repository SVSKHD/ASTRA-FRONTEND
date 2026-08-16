import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useLongList } from '@/composables/useLongList'

const rows = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('useLongList', () => {
  it('renders a short list whole and reports no windowing', () => {
    const source = ref(rows(40))
    const list = useLongList(source, { threshold: 100 })
    expect(list.windowed.value).toBe(false)
    expect(list.visible.value).toHaveLength(40)
    expect(list.remaining.value).toBe(0)
  })

  it('caps a long list at the threshold', () => {
    const list = useLongList(ref(rows(430)), { threshold: 100 })
    expect(list.windowed.value).toBe(true)
    expect(list.visible.value).toHaveLength(100)
    expect(list.remaining.value).toBe(330)
  })

  it('extends by a step and stops at the end', () => {
    const list = useLongList(ref(rows(250)), { threshold: 100, step: 100 })
    list.more()
    expect(list.visible.value).toHaveLength(200)
    list.more()
    expect(list.visible.value).toHaveLength(250)
    list.more()
    expect(list.visible.value).toHaveLength(250)
    expect(list.remaining.value).toBe(0)
  })

  it('reveals everything on demand', () => {
    const list = useLongList(ref(rows(1000)), { threshold: 100 })
    list.all()
    expect(list.visible.value).toHaveLength(1000)
  })

  it('keeps the reader in place while the list only grows', async () => {
    const source = ref(rows(300))
    const list = useLongList(source, { threshold: 100, step: 100 })
    list.more()
    source.value = rows(320)
    await nextTick()
    expect(list.visible.value).toHaveLength(200)
  })

  it('resets the window when the list shrinks — a new filter starts at the top', async () => {
    const source = ref(rows(300))
    const list = useLongList(source, { threshold: 100, step: 100 })
    list.more()
    source.value = rows(180)
    await nextTick()
    expect(list.visible.value).toHaveLength(100)
  })
})
