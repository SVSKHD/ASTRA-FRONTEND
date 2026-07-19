import { computed, ref, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const encoder = new TextEncoder()

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

async function pinHash(pin: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${pin}`))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

export const useLockStore = defineStore('lock', () => {
  const app = useAppStore()
  const auth = useAuthStore()
  const { cloudReady, security } = storeToRefs(app)
  const { isSignedIn, user } = storeToRefs(auth)

  const locked = ref(false)
  const lockError = ref('')
  const lockBusy = ref(false)
  const lastActivity = ref(Date.now())
  let initializedUid: string | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let listening = false

  const pinSetupRequired = computed(
    () => isSignedIn.value && cloudReady.value && !security.value.pinHash,
  )
  const canUseApp = computed(
    () => isSignedIn.value && cloudReady.value && !locked.value && !pinSetupRequired.value,
  )

  watch(
    [() => user.value?.uid || null, cloudReady],
    ([uid, ready]) => {
      if (!uid) {
        initializedUid = null
        locked.value = false
        lockError.value = ''
        return
      }
      if (!ready || initializedUid === uid) return
      initializedUid = uid
      locked.value = !!security.value.pinHash && security.value.autoLockEnabled
      lastActivity.value = Date.now()
    },
    { immediate: true },
  )

  function markActivity() {
    if (!canUseApp.value || !security.value.autoLockEnabled) return
    lastActivity.value = Date.now()
  }

  function checkTimeout() {
    if (!canUseApp.value || !security.value.autoLockEnabled) return
    const timeoutMs = Math.max(1, security.value.lockTimeoutMinutes) * 60_000
    if (Date.now() - lastActivity.value >= timeoutMs) lockNow()
  }

  function start() {
    if (listening) return
    listening = true
    window.addEventListener('pointerdown', markActivity, { passive: true })
    window.addEventListener('touchstart', markActivity, { passive: true })
    window.addEventListener('keydown', markActivity)
    document.addEventListener('visibilitychange', markActivity)
    timer = setInterval(checkTimeout, 15_000)
  }

  function stop() {
    if (!listening) return
    listening = false
    window.removeEventListener('pointerdown', markActivity)
    window.removeEventListener('touchstart', markActivity)
    window.removeEventListener('keydown', markActivity)
    document.removeEventListener('visibilitychange', markActivity)
    if (timer) clearInterval(timer)
    timer = null
  }

  async function setPin(pin: string, confirmation: string, neverLock: boolean): Promise<boolean> {
    lockError.value = ''
    if (!/^\d{4,8}$/.test(pin)) {
      lockError.value = 'Use a 4–8 digit PIN.'
      return false
    }
    if (pin !== confirmation) {
      lockError.value = 'PINs do not match.'
      return false
    }
    lockBusy.value = true
    try {
      const salt = randomSalt()
      const hash = await pinHash(pin, salt)
      app.updateSecurity({
        pinHash: hash,
        pinSalt: salt,
        autoLockEnabled: !neverLock,
        lockTimeoutMinutes: 50,
      })
      locked.value = false
      lastActivity.value = Date.now()
      return true
    } catch (error) {
      console.error('[Aureon] PIN setup failed:', error)
      lockError.value = 'Could not secure the PIN.'
      return false
    } finally {
      lockBusy.value = false
    }
  }

  async function unlock(pin: string): Promise<boolean> {
    lockError.value = ''
    if (!/^\d{4,8}$/.test(pin)) {
      lockError.value = 'Enter your 4–8 digit PIN.'
      return false
    }
    lockBusy.value = true
    try {
      const hash = await pinHash(pin, security.value.pinSalt)
      if (hash !== security.value.pinHash) {
        lockError.value = 'Incorrect PIN.'
        return false
      }
      locked.value = false
      lastActivity.value = Date.now()
      return true
    } finally {
      lockBusy.value = false
    }
  }

  function lockNow() {
    if (!security.value.pinHash) return
    auth.avatarMenuOpen = false
    locked.value = true
    lockError.value = ''
  }

  function setAutoLock(enabled: boolean) {
    app.updateSecurity({ autoLockEnabled: enabled, lockTimeoutMinutes: 50 })
    lastActivity.value = Date.now()
  }

  function clearError() {
    lockError.value = ''
  }

  return {
    locked,
    lockError,
    lockBusy,
    pinSetupRequired,
    canUseApp,
    start,
    stop,
    markActivity,
    setPin,
    unlock,
    lockNow,
    setAutoLock,
    clearError,
  }
})
