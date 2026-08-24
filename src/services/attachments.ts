// Uploading and removing a receipt (section 27b).
//
// The rules live in utils/attachments.ts and are applied before anything
// touches the network; this file is only the network. That split is what lets
// the size and type limits be tested without Firebase, and it keeps the one
// thing that can fail slowly — the upload — separate from the things that fail
// instantly.

import { auth, loadStorage } from '@/firebase'
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
