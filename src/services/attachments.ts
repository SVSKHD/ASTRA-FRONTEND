// Uploading and removing a receipt (section 27b).
//
// The rules live in utils/attachments.ts and are applied before anything
// touches the network; this file is only the network. That split is what lets
// the size and type limits be tested without Firebase, and it keeps the one
// thing that can fail slowly — the upload — separate from the things that fail
// instantly.

import { auth, loadStorage } from '@/firebase'
import { apiUrl } from '@/api/config'
import { errorMessage } from '@/api/client'
import { readCsrfToken } from '@/api/csrf'
import { authProvider } from '@/auth/provider'
import { nanoid } from '@/utils/nanoid'
import { attachmentPath, type Attachment } from '@/utils/attachments'

export interface UploadResult {
  attachment: Attachment | null
  error: string | null
}

/**
 * Upload one file and return the attachment record to store on the transaction.
 *
 * Errors come back as a value rather than a throw: this is called in a loop
 * over a multi-file selection, and one failure has to leave the others
 * uploaded rather than abandoning the batch halfway.
 */
export async function uploadAttachment(txnId: number, file: File): Promise<UploadResult> {
  if (attachmentsOnAureon()) {
    // Aureon attaches files to finance ROWS (trades, expenses, withdrawals) and
    // checks the row is yours. A workspace transaction lives inside the
    // workspace document and has no row to attach to.
    return {
      attachment: null,
      error:
        'On Aureon, receipts attach to expenses: open the Expenses tab and use Receipts on the row.',
    }
  }
  const uid = auth?.currentUser?.uid
  if (!uid) return { attachment: null, error: 'Sign in to attach a file.' }
  const handle = await loadStorage()
  if (!handle) return { attachment: null, error: 'Attachments are unavailable right now.' }

  const id = nanoid(16)
  try {
    const ref = handle.st.ref(handle.storage, attachmentPath(uid, txnId, id, file.name))
    // contentType explicitly: Storage infers application/octet-stream from a
    // Blob with no type, and an octet-stream receipt downloads instead of
    // opening, which reads to the user as a broken attachment.
    await handle.st.uploadBytes(ref, file, { contentType: file.type })
    const url = await handle.st.getDownloadURL(ref)
    return {
      attachment: {
        id,
        name: file.name,
        contentType: file.type,
        size: file.size,
        url,
        uploadedAt: Date.now(),
      },
      error: null,
    }
  } catch (err) {
    return {
      attachment: null,
      error: err instanceof Error ? err.message : `Could not upload ${file.name}.`,
    }
  }
}

/**
 * Remove a file from Storage.
 *
 * A failure here is deliberately not surfaced. The caller has already dropped
 * the reference from the transaction, so the user's intent is satisfied and the
 * worst case is an orphaned blob — telling them "the attachment was removed but
 * also an error occurred" describes an internal detail they cannot act on.
 */
export async function deleteAttachment(
  uid: string,
  txnId: number,
  attachment: Attachment,
): Promise<void> {
  // A receipt uploaded to Firebase before the move stays where it is.
  if (attachmentsOnAureon()) return
  const handle = await loadStorage()
  if (!handle) return
  try {
    await handle.st.deleteObject(
      handle.st.ref(handle.storage, attachmentPath(uid, txnId, attachment.id, attachment.name)),
    )
  } catch (err) {
    console.warn('[Aureon] Could not delete attachment blob', err)
  }
}

// ---- Aureon (VITE_AUTH_PROVIDER=aureon) -------------------------------------
//
// /api/finance/attachments: files on the server's data disk, attached to one
// finance row (`kind` + `ref`), listed per row, downloaded with the session
// cookie (same origin), and deleted with the row. The server sniffs the type
// from the bytes (PNG, JPEG, WebP, PDF) and caps the size.

export type FinanceKind = 'trades' | 'expenses' | 'secured'

/** Whether receipts go to Aureon instead of Firebase Storage. */
export function attachmentsOnAureon(): boolean {
  return authProvider() === 'aureon'
}

interface AttachmentOut {
  id: string
  kind: string
  ref: string
  filename: string
  content_type: string
  size_bytes: number
  created_at: string
}

/** The download URL. Same origin, so the session cookie goes with it. */
export function attachmentFileUrl(id: string): string {
  return apiUrl(`/api/finance/attachments/${encodeURIComponent(id)}/file`)
}

export function toAttachment(row: AttachmentOut): Attachment {
  return {
    id: row.id,
    name: row.filename,
    contentType: row.content_type,
    size: row.size_bytes,
    url: attachmentFileUrl(row.id),
    uploadedAt: Date.parse(row.created_at) || Date.now(),
  }
}

/** What an upload refusal means, in the words the person needs. */
function uploadMessage(status: number, body: unknown, name: string): string {
  if (status === 413) return `${name} is too large for the server.`
  if (status === 415) return `${name} is not an image or a PDF the server accepts.`
  if (status === 409) return 'The attachment limit is reached. Delete some old receipts first.'
  if (status === 404) return 'That entry is not saved on the server yet. Try again in a moment.'
  if (status === 503) return 'Attachment storage is not mounted on the server right now.'
  return errorMessage(body, `Could not upload ${name} (HTTP ${status}).`)
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function csrfHeaders(): HeadersInit {
  const token = readCsrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

/** Upload one file against a finance row. Errors come back as a value, as above. */
export async function uploadFinanceAttachment(
  kind: FinanceKind,
  ref: string,
  file: File,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<UploadResult> {
  const form = new FormData()
  form.append('kind', kind)
  form.append('ref', ref)
  form.append('file', file, file.name)
  try {
    const response = await fetchImpl(apiUrl('/api/finance/attachments'), {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeaders(),
      body: form,
    })
    const body = await json(response)
    if (!response.ok)
      return { attachment: null, error: uploadMessage(response.status, body, file.name) }
    return { attachment: toAttachment(body as AttachmentOut), error: null }
  } catch {
    return { attachment: null, error: `Could not upload ${file.name}. Check the connection.` }
  }
}

/** The files on one row, newest first. */
export async function listFinanceAttachments(
  kind: FinanceKind,
  ref: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Attachment[]> {
  const query = new URLSearchParams({ kind, ref })
  const response = await fetchImpl(apiUrl(`/api/finance/attachments?${query}`), {
    credentials: 'include',
  })
  const body = await json(response)
  if (!response.ok)
    throw new Error(errorMessage(body, `Could not load the receipts (HTTP ${response.status}).`))
  return (body as AttachmentOut[]).map(toAttachment)
}

/** Delete one file. Already gone counts as done. */
export async function deleteFinanceAttachment(
  id: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
  const response = await fetchImpl(apiUrl(`/api/finance/attachments/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    credentials: 'include',
    headers: csrfHeaders(),
  })
  if (!response.ok && response.status !== 404) {
    const body = await json(response)
    throw new Error(errorMessage(body, `Could not delete the receipt (HTTP ${response.status}).`))
  }
}
