import { describe, expect, it } from 'vitest'
import { bodyOf, cell, fieldsOf, initialValues, isSecret, safeColumns, validate } from './schema'
import { fillPath, pick } from './request'

const NOTE_IN = {
  type: 'object',
  required: ['title', 'priority'],
  properties: {
    title: { type: 'string', maxLength: 80, title: 'Title' },
    body: { type: 'string', maxLength: 4000 },
    priority: { type: 'integer', minimum: 1, maximum: 5 },
    kind: { type: 'string', enum: ['idea', 'todo'] },
    pinned: { type: 'boolean' },
    api_key: { type: 'string' },
    due: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
    id: { type: 'integer', readOnly: true },
  },
}

describe('fieldsOf', () => {
  it('turns a JSON Schema into typed fields', () => {
    const f = Object.fromEntries(fieldsOf(NOTE_IN).map((x) => [x.name, x]))
    expect(Object.keys(f)).toEqual([
      'title',
      'body',
      'priority',
      'kind',
      'pinned',
      'api_key',
      'due',
    ])
    expect(f.title).toMatchObject({ type: 'string', required: true, label: 'Title', maxLength: 80 })
    expect(f.body.type).toBe('text')
    expect(f.priority).toMatchObject({ type: 'integer', minimum: 1, maximum: 5, required: true })
    expect(f.kind.options?.map((o) => o.value)).toEqual(['idea', 'todo'])
    expect(f.pinned.type).toBe('boolean')
    expect(f.api_key.type).toBe('secret')
    expect(f.due.type).toBe('string')
  })
})

describe('validate / bodyOf', () => {
  const fields = fieldsOf(NOTE_IN)
  it('says what is wrong before anything is sent', () => {
    const v = initialValues(fields)
    expect(validate(fields, v)).toEqual({ title: 'Required.', priority: 'Required.' })
    expect(validate(fields, { ...v, title: 'x', priority: 9 })).toEqual({ priority: 'At most 5.' })
    expect(validate(fields, { ...v, title: 'x', priority: 2.5 })).toEqual({
      priority: 'Enter a whole number.',
    })
  })
  it('sends typed values and leaves empty optional fields out', () => {
    const body = bodyOf(fields, {
      ...initialValues(fields),
      title: 'Hi',
      priority: '3',
      pinned: true,
    })
    expect(body).toEqual({ title: 'Hi', priority: 3, pinned: true })
  })
})

describe('secrets and cells', () => {
  it('never shows a secret column', () => {
    expect(isSecret('apiKey')).toBe(true)
    expect(isSecret('DHAN_ACCESS_TOKEN')).toBe(true)
    expect(isSecret('shipping')).toBe(false)
    expect(isSecret('x', { writeOnly: true })).toBe(true)
    expect(
      safeColumns([
        { key: 'title', label: 'T' },
        { key: 'password', label: 'P' },
      ]),
    ).toEqual([{ key: 'title', label: 'T' }])
    expect(cell('hunter2', { key: 'password' })).toBe('••••')
  })
  it('formats values by column', () => {
    expect(cell(null, { key: 'a' })).toBe('—')
    expect(cell(true, { key: 'a', format: 'boolean' })).toBe('Yes')
    expect(cell({ a: 1 }, { key: 'a' })).toBe('{"a":1}')
  })
})

describe('paths', () => {
  it('fills path parameters safely and refuses a missing one', () => {
    expect(fillPath('/api/x/{id}/run', { id: 'a b/c' })).toBe('/api/x/a%20b%2Fc/run')
    expect(() => fillPath('/api/x/{id}', {})).toThrow(/missing path parameter: id/)
    expect(pick({ a: { b: [1] } }, 'a.b')).toEqual([1])
    expect(pick([1], '')).toEqual([1])
  })
})
