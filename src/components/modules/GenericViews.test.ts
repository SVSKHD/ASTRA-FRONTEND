// The generic views render from a sample manifest + JSON Schema, and honour
// the rules: hidden is never rendered, approval files a request and says
// nothing ran, confirm asks first, secrets never appear.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  PATCH: vi.fn(),
  DELETE: vi.fn(),
}))
vi.mock('@/api/client', () => ({
  aureon: api,
  errorMessage: (e: { detail?: string } | undefined, f: string) => e?.detail ?? f,
  onApiSchema: () => () => {},
  onUnauthorized: () => () => {},
}))

import GenericList from './GenericList.vue'
import GenericForm from './GenericForm.vue'
import GenericAction from './GenericAction.vue'
import type { ManifestView } from '@/modules/manifest'

const res = (data: unknown, status = 200) => ({
  data,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status, headers: new Headers() },
})
function router(path = '/modules/notes') {
  const r = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/modules/:key?', component: { template: '<div />' } },
      { path: '/dev/inbox', component: { template: '<div />' } },
    ],
  })
  void r.push(path)
  return r
}
const stubs = {
  Modal: { props: ['open', 'title'], template: '<div v-if="open" class="modal"><slot /></div>' },
}

const LIST: ManifestView = {
  kind: 'list',
  id: 'list',
  title: 'Notes',
  method: 'GET',
  path: '/api/notes',
  danger: 'none',
  path_params: [],
  columns: [
    { key: 'title', label: 'Title' },
    { key: 'created_at', label: 'Created', format: 'datetime' },
    { key: 'api_key', label: 'API key' },
  ],
  items_path: 'items',
  total_path: 'total',
  filters: [{ name: 'q', required: false, schema: { type: 'string' } }],
  pagination: { style: 'offset', limit: 'limit', offset: 'offset' },
}
const ROW_ACTION = (over: Partial<ManifestView>): ManifestView => ({
  kind: 'action',
  id: 'publish',
  title: 'Publish',
  method: 'POST',
  path: '/api/notes/{note_id}/publish',
  danger: 'none',
  path_params: ['note_id'],
  row: true,
  ...over,
})

describe('<GenericList />', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

  it('renders the declared columns, sends filters from the URL, paginates, hides secrets', async () => {
    api.GET.mockResolvedValue(
      res({
        items: [{ id: 7, title: 'First', created_at: null, api_key: 'sk-live-1' }],
        total: 45,
      }),
    )
    const r = router('/modules/notes?q=first&page=2')
    await r.isReady()
    const w = mount(GenericList, {
      props: { view: LIST, pageSize: 20 },
      global: { plugins: [r], stubs },
    })
    await flushPromises()
    expect(api.GET).toHaveBeenCalledWith('/api/notes', {
      params: { query: { q: 'first', limit: 20, offset: 20 } },
    })
    expect(w.text()).toContain('First')
    expect(w.text()).toContain('Created')
    expect(w.text()).not.toContain('API key')
    expect(w.text()).not.toContain('sk-live-1')
    expect(w.text()).toContain('Page 2 of 3')
  })

  it('shows an error with a retry, and an empty state', async () => {
    api.GET.mockResolvedValueOnce(res({ detail: 'boom' }, 500))
    const r = router()
    await r.isReady()
    const w = mount(GenericList, { props: { view: LIST }, global: { plugins: [r], stubs } })
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toContain('boom')
    api.GET.mockResolvedValueOnce(res({ items: [], total: 0 }))
    await w.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Nothing here')
  })

  it('runs a row action with the row’s id', async () => {
    api.GET.mockResolvedValue(res({ items: [{ id: 7, title: 'First' }], total: 1 }))
    api.POST.mockResolvedValue(res({ ok: true }))
    const r = router()
    await r.isReady()
    const w = mount(GenericList, {
      props: { view: LIST, rowActions: [ROW_ACTION({})] },
      global: { plugins: [r], stubs },
    })
    await flushPromises()
    await w.get('[data-testid="action-publish"]').trigger('click')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/notes/7/publish', {})
  })
})

describe('<GenericForm />', () => {
  it('generates inputs from the schema and validates before sending', async () => {
    const w = mount(GenericForm, {
      props: {
        schema: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', maxLength: 10 },
            secret_token: { type: 'string' },
          },
        },
      },
    })
    expect(w.findAll('input').length).toBe(2)
    expect(w.find('input[type="password"]').exists()).toBe(true)
    await w.get('form').trigger('submit')
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('Required.')
    const [title, token] = w.findAll('input')
    await title.setValue('Hello')
    await token.setValue('s3cret')
    await w.get('form').trigger('submit')
    expect(w.emitted('submit')?.[0]).toEqual([{ title: 'Hello', secret_token: 's3cret' }])
    // The secret is cleared once sent.
    expect((w.find('input[type="password"]').element as HTMLInputElement).value).toBe('')
  })
})

describe('<GenericAction /> rules', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

  it('never renders a hidden operation', () => {
    const w = mount(GenericAction, {
      props: { view: ROW_ACTION({ danger: 'hidden' }), params: { note_id: 1 } },
      global: { plugins: [router()], stubs },
    })
    expect(w.find('button').exists()).toBe(false)
    expect(w.html()).not.toContain('Publish')
  })

  it('asks before a confirm operation', async () => {
    api.POST.mockResolvedValue(res({ ok: true }))
    const w = mount(GenericAction, {
      props: {
        view: ROW_ACTION({ danger: 'confirm', confirm: 'Really publish?' }),
        params: { note_id: 1 },
      },
      global: { plugins: [router()], stubs },
    })
    await w.get('[data-testid="action-publish"]').trigger('click')
    expect(api.POST).not.toHaveBeenCalled()
    expect(w.text()).toContain('Really publish?')
    await w.get('[data-testid="action-confirm"]').trigger('click')
    await flushPromises()
    expect(api.POST).toHaveBeenCalledWith('/api/notes/1/publish', {})
  })

  it('files an approval request and says nothing has run', async () => {
    api.POST.mockResolvedValue(
      res(
        {
          approval_id: 'ap-1',
          kind: 'notes.publish',
          target: 'note 1',
          expires_at: '2026-11-05T00:00:00Z',
          artifact_sha256: 'abcdef123',
        },
        202,
      ),
    )
    const w = mount(GenericAction, {
      props: { view: ROW_ACTION({ danger: 'approval' }), params: { note_id: 1 } },
      global: { plugins: [router()], stubs },
    })
    expect(w.text()).toContain('Publish (needs approval)')
    await w.get('[data-testid="action-publish"]').trigger('click')
    expect(w.text()).toContain('Nothing runs until an admin approves it')
    await w.get('[data-testid="action-confirm"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Approval required')
    expect(w.text()).toContain('Nothing has run yet')
    expect(w.emitted('done')).toBeUndefined()
  })
})
