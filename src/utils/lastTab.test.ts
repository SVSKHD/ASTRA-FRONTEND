import { beforeEach, describe, expect, it } from 'vitest'
import { LAST_TAB_KEY, rememberTab, rememberedTab, tabUrl } from '@/utils/lastTab'

describe('the remembered tab', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a real tab', () => {
    rememberTab('todo')
    expect(rememberedTab()).toBe('todo')
  })

  it('ignores anything stored that is not a tab', () => {
    expect(rememberedTab()).toBe('')
    localStorage.setItem(LAST_TAB_KEY, 'not-a-tab')
    expect(rememberedTab()).toBe('')
  })

  it('builds the address a tab lives at', () => {
    expect(tabUrl('trades')).toBe('/trades')
    expect(tabUrl('tasks')).toBe('/?tab=tasks')
  })
})
