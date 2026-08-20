import { describe, expect, it } from 'vitest'
import {
  CARD_MIN_PX,
  GRID_GAP_PX,
  MAX_COLUMNS,
  VIRTUALISE_FROM,
  columnsFor,
  rowCount,
  rowHeight,
  rowSlice,
  shouldVirtualise,
} from '@/utils/gridRows'

describe('how many columns fit', () => {
  it('fits one card on a narrow screen', () => {
    expect(columnsFor(320)).toBe(1)
    expect(columnsFor(CARD_MIN_PX)).toBe(1)
  })

  it('adds a column only when the card and its gap both fit', () => {
    // Two columns need 300 + 16 + 300.
    expect(columnsFor(CARD_MIN_PX * 2 + GRID_GAP_PX - 1)).toBe(1)
    expect(columnsFor(CARD_MIN_PX * 2 + GRID_GAP_PX)).toBe(2)
  })

  it('stops at four however wide the screen is', () => {
    expect(columnsFor(2560)).toBe(MAX_COLUMNS)
    expect(columnsFor(10000)).toBe(MAX_COLUMNS)
  })

  it('reports one column for a container it has not measured yet', () => {
    // Zero would make the row count infinite.
    expect(columnsFor(0)).toBe(1)
    expect(columnsFor(-50)).toBe(1)
    expect(columnsFor(Number.NaN)).toBe(1)
  })
})

describe('packing items into rows', () => {
  it('counts the rows a list needs', () => {
    expect(rowCount(10, 4)).toBe(3)
    expect(rowCount(8, 4)).toBe(2)
    expect(rowCount(1, 4)).toBe(1)
  })

  it('has no rows for an empty list', () => {
    expect(rowCount(0, 4)).toBe(0)
  })

  it('survives a zero column count', () => {
    expect(rowCount(5, 0)).toBe(5)
  })

  it('slices the right items onto each row', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    expect(rowSlice(items, 0, 3)).toEqual([1, 2, 3])
    expect(rowSlice(items, 1, 3)).toEqual([4, 5, 6])
    expect(rowSlice(items, 2, 3)).toEqual([7])
  })

  it('gives an empty slice past the end rather than throwing', () => {
    expect(rowSlice([1, 2], 9, 3)).toEqual([])
  })

  it('rebuilds the whole list from its rows', () => {
    const items = Array.from({ length: 23 }, (_, i) => i)
    const columns = 4
    const rebuilt = Array.from({ length: rowCount(items.length, columns) }, (_, row) =>
      rowSlice(items, row, columns),
    ).flat()
    expect(rebuilt).toEqual(items)
  })
})

describe('when to virtualise', () => {
  it('leaves a short grid alone — virtualising it costs more than it saves', () => {
    expect(shouldVirtualise(0)).toBe(false)
    expect(shouldVirtualise(VIRTUALISE_FROM)).toBe(false)
  })

  it('takes over past the threshold', () => {
    expect(shouldVirtualise(VIRTUALISE_FROM + 1)).toBe(true)
    expect(shouldVirtualise(200)).toBe(true)
  })
})

describe('row height', () => {
  it('includes the gap beneath the row', () => {
    expect(rowHeight(180, 16)).toBe(196)
  })
})
