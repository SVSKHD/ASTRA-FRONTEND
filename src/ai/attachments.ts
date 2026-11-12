// Files attached to an AI chat message: photos, PDFs, spreadsheets.
//
//   POST /api/ai/attachments  (multipart `file`, CSRF)  → {id, name, kind, …}
//   POST /api/ai/chat         { …, attachments: [id, …] }
//
// The server checks the type from the bytes and owns the limits (backend
// app/services/chat_attachments.py); the checks here only save a wasted upload
// and say why early. Photos and PDFs reach Claude as they are — they cannot be
// redacted — while a spreadsheet is turned into a text table and redacted like
// any message. The composer says so before sending.

import type { components } from '@/api/client'
import { apiUrl } from '@/api/config'
import { readCsrfToken } from '@/api/csrf'
import type { IconName } from '@/components/ui/icons'

export type AttachmentOut = components['schemas']['ChatAttachmentOut']
export type AttachmentKind = AttachmentOut['kind']

export const MAX_FILES = 5
export const MAX_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.xlsx,.csv,.tsv'

const IMAGE = /\.(png|jpe?g|webp|gif)$/i
const PDF = /\.pdf$/i
const TABLE = /\.(xlsx|csv|tsv)$/i

/** What a file will be, from its name, or null when it is not accepted. */
export function kindOf(name: string): AttachmentKind | null {
  if (IMAGE.test(name)) return 'image'
  if (PDF.test(name)) return 'pdf'
  if (TABLE.test(name)) return 'table'
  return null
}

/** Why a file cannot be attached, or null when it can. */
export function refusal(file: { name: string; size: number }): string | null {
  const kind = kindOf(file.name)
  if (!kind) return 'Photos (PNG, JPEG, WebP, GIF), PDF, Excel (.xlsx), CSV or TSV only.'
  if (file.size === 0) return 'The file is empty.'
  if (kind === 'image' && file.size > MAX_IMAGE_BYTES) return 'Photos are limited to 5 MB.'
  if (file.size > MAX_BYTES) return 'Files are limited to 10 MB.'
  return null
}

export class AttachmentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function serverMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  const msg = (detail as { message?: unknown } | null)?.message
  if (typeof msg === 'string') return msg
  if (status === 413) return 'The file is too large.'
  if (status === 415) return 'This kind of file is not accepted.'
  return `The upload failed (${status}).`
}

export async function uploadAttachment(
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<AttachmentOut> {
  const form = new FormData()
  form.append('file', file, file.name)
  const headers: Record<string, string> = {}
  const csrf = readCsrfToken()
  if (csrf) headers['X-CSRF-Token'] = csrf
  let res: Response
  try {
    res = await fetchImpl(apiUrl('/api/ai/attachments'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    })
  } catch {
    throw new AttachmentError('The upload could not reach the server.', 0)
  }
  const body = (await res.json().catch(() => null)) as unknown
  if (!res.ok) throw new AttachmentError(serverMessage(body, res.status), res.status)
  return body as AttachmentOut
}

/** "2.4 MB", "830 KB". */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export const KIND_ICON: Record<AttachmentKind, IconName> = {
  image: 'image',
  pdf: 'file-text',
  table: 'table',
}
