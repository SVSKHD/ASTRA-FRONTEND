// Attaching files to an AI chat message: what is accepted before uploading, the
// upload itself (multipart, CSRF), and that the ids go with the message.
import { describe, expect, it, vi } from 'vitest'
import {
  AttachmentError,
  kindOf,
  MAX_IMAGE_BYTES,
  refusal,
  sizeText,
  uploadAttachment,
} from '@/ai/attachments'
import { streamChat } from '@/ai/aureonChat'

describe('what can be attached', () => {
  it('knows the kinds by name and refuses the rest early', () => {
    expect(kindOf('chart.PNG')).toBe('image')
    expect(kindOf('statement.pdf')).toBe('pdf')
    expect(kindOf('sales.xlsx')).toBe('table')
    expect(kindOf('data.csv')).toBe('table')
    expect(kindOf('setup.exe')).toBe(null)
    expect(refusal({ name: 'setup.exe', size: 10 })).toContain('only')
    expect(refusal({ name: 'big.jpg', size: MAX_IMAGE_BYTES + 1 })).toBe(
      'Photos are limited to 5 MB.',
    )
    expect(refusal({ name: 'big.pdf', size: 11 * 1024 * 1024 })).toBe('Files are limited to 10 MB.')
    expect(refusal({ name: 'ok.pdf', size: 1000 })).toBe(null)
    expect(sizeText(2_500_000)).toBe('2.4 MB')
  })
})

describe('uploadAttachment', () => {
  it('posts the file as multipart and returns the id', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
      return new Response(
        JSON.stringify({
          id: 'a1',
          name: 'x.png',
          kind: 'image',
          media_type: 'image/png',
          size: 3,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    })
    const out = await uploadAttachment(
      new File([new Uint8Array([1, 2, 3])], 'x.png'),
      fetchImpl as typeof fetch,
    )
    expect(out.id).toBe('a1')
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/ai/attachments')
  })

  it("says the server's reason when it refuses", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ detail: { code: 'unsupported_type', message: 'photos only' } }),
        { status: 415 },
      )
    await expect(
      uploadAttachment(new File(['x'], 'x.png'), fetchImpl as typeof fetch),
    ).rejects.toEqual(new AttachmentError('photos only', 415))
  })
})

describe('streamChat', () => {
  it('sends the attachment ids with the message', async () => {
    let sent: Record<string, unknown> = {}
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response('event: done\ndata: {"conversation_id":"c1"}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    })
    for await (const _ of streamChat({
      message: 'what is this?',
      chatKey: null,
      attachments: ['a1', 'a2'],
      fetchImpl: fetchImpl as typeof fetch,
    })) {
      /* drain */
    }
    expect(sent.attachments).toEqual(['a1', 'a2'])
  })
})
