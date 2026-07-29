// Public-share link state + actions for a single item.
//
// Deliberately generic over entity type and item so the same globe toggle can
// front todos today and notes / ideas / trips later with no changes here: pass
// the item type and a ref to the item, get back the reactive share state and
// the handful of actions the button and its popover need.
//
// Persistence is split cleanly: the item's own share fields (isPublic, shareId,
// sharedAt) live in the workspace doc and are written through the store's
// patchItem; the frozen snapshot a signed-out visitor reads lives in the
// aureon-shares mirror doc, written by publishShare / torn down by
// unpublishShare. The URL never carries the payload — only the share id.
//
// Every mutation is optimistic: the local item flips first so the icon responds
// instantly, and a rejected write rolls the fields back and raises an error
// toast.

import { computed, ref, type Ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { nanoid } from '@/utils/nanoid'
import { copyText } from '@/utils/clipboard'
import { buildPublicShareUrl } from '@/utils/share'
import type { ItemType, Shareable } from '@/types'

// The item only needs an id and the share fields; anything else on it is the
// snapshot's business, not this composable's.
type ShareableItem = { id: number } & Partial<Shareable>

const SHARE_ID_LENGTH = 12

export function useShareLink(entityType: ItemType, docRef: Ref<ShareableItem | null | undefined>) {
  const app = useAppStore()
  const auth = useAuthStore()

  const shareId = computed<string | null>(() => docRef.value?.shareId ?? null)
  const isShared = computed(() => docRef.value?.isPublic === true && !!shareId.value)
  const shareUrl = computed(() =>
    shareId.value ? buildPublicShareUrl(entityType, shareId.value) : '',
  )

  // Per-item in-flight guard, so a double-tap or a toggle-mid-copy on this row
  // cannot interleave two writes — while leaving other rows' globes live.
  const busy = ref(false)
  function setBusy(v: boolean) {
    busy.value = v
  }

  async function copyLink(): Promise<boolean> {
    if (!shareUrl.value) return false
    const ok = await copyText(shareUrl.value)
    app.showToastMsg(ok ? 'Link copied' : 'Copy the link from the address bar')
    return ok
  }

  async function enable(): Promise<void> {
    const item = docRef.value
    if (!item || busy.value) return
    if (!auth.isSignedIn) {
      app.showToastMsg('Sign in to share')
      return
    }
    setBusy(true)
    // Reuse an existing id if one survives (never stopped), otherwise mint one
    // — the mint happens exactly once per share lifetime.
    const nextId = item.shareId || nanoid(SHARE_ID_LENGTH)
    const prev = { isPublic: item.isPublic, shareId: item.shareId, sharedAt: item.sharedAt }
    app.patchItem(entityType, item.id, {
      isPublic: true,
      shareId: nextId,
      sharedAt: Date.now(),
    })
    try {
      await app.publishShare(entityType, item.id)
      await copyLink()
    } catch (error) {
      console.error('[Aureon] Enable share failed:', error)
      app.patchItem(entityType, item.id, prev)
      app.showToastMsg('Could not enable sharing')
    } finally {
      setBusy(false)
    }
  }

  // "Stop sharing": revoke access and null the id so the next enable mints a
  // fresh one — an old link cannot be resurrected.
  async function stopSharing(): Promise<void> {
    const item = docRef.value
    if (!item || busy.value) return
    setBusy(true)
    const prev = { isPublic: item.isPublic, shareId: item.shareId, sharedAt: item.sharedAt }
    const revokedId = item.shareId
    app.patchItem(entityType, item.id, { isPublic: false, shareId: null, sharedAt: null })
    try {
      if (revokedId) await app.unpublishShare(revokedId)
      app.showToastMsg('Sharing disabled')
    } catch (error) {
      console.error('[Aureon] Stop share failed:', error)
      app.patchItem(entityType, item.id, prev)
      app.showToastMsg('Could not disable sharing')
    } finally {
      setBusy(false)
    }
  }

  // Primary click / Enter / Space on the globe: enable + copy when off,
  // re-copy when already on. Turning it OFF is intentionally not the primary
  // action — that lives behind "Stop sharing" so a share is never revoked by an
  // accidental second click on the link people are handing out.
  async function activate(): Promise<void> {
    if (isShared.value) await copyLink()
    else await enable()
  }

  function openLink(): void {
    if (!shareUrl.value || typeof window === 'undefined') return
    window.open(shareUrl.value, '_blank', 'noopener')
  }

  return {
    isShared,
    busy,
    shareId,
    shareUrl,
    activate,
    enable,
    stopSharing,
    copyLink,
    openLink,
  }
}
