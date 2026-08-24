import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
  linkWithPopup,
  type User as FbUser,
  type AuthProvider,
  type UserCredential,
} from 'firebase/auth'
import { auth, firebaseEnabled } from '@/firebase'
import { CALENDAR_SCOPE, hasCalendarToken, setCalendarToken } from '@/utils/gcal'
// Section 27a: sign-out must forget the device's session identity.
import { clearSessionId } from '@/utils/sessionId'
import type { AureonUser } from '@/types'

const GOOGLE_COLOR = 'oklch(0.62 0.15 255)'
const GITHUB_COLOR = 'oklch(0.5 0.02 260)'

const allowedUids = (import.meta.env.VITE_ALLOWED_UIDS || '')
  .split(',')
  .map((value: string) => value.trim())
  .filter((value: string) => value && !value.startsWith('REPLACE_'))

const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS || '8svskhd@gmail.com')
  .split(',')
  .map((value: string) => value.trim().toLowerCase())
  .filter((value: string) => value && !value.startsWith('replace_'))

export function isFirebaseUserAllowed(user: FbUser): boolean {
  const email = (user.email || '').toLowerCase()
  return allowedUids.includes(user.uid) || (!!email && allowedEmails.includes(email))
}

function initialOf(name: string): string {
  return (name || 'U').trim().charAt(0).toUpperCase() || 'U'
}

function fromFirebase(user: FbUser): AureonUser {
  const providerId = user.providerData[0]?.providerId || ''
  const provider = providerId.includes('github') ? 'github' : 'google'
  const name = user.displayName || (user.email ? user.email.split('@')[0] : 'User')
  return {
    uid: user.uid,
    name,
    email: user.email || '',
    provider,
    initial: initialOf(name),
    color: provider === 'github' ? GITHUB_COLOR : GOOGLE_COLOR,
  }
}

function authMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : String(error)
  if (code.includes('unauthorized-domain'))
    return 'Add this website domain under Firebase Authentication → Settings → Authorized domains.'
  if (code.includes('operation-not-allowed'))
    return 'Enable this sign-in provider in Firebase Authentication → Sign-in method.'
  if (code.includes('popup-closed-by-user') || message.includes('popup-closed-by-user'))
    return 'Sign-in was cancelled.'
  if (
    code.includes('account-exists-with-different-credential') ||
    message.includes('account-exists-with-different-credential')
  )
    return 'This email already uses another sign-in provider.'
  return `Authentication failed${code ? ` (${code})` : ''}. Check Firebase Authentication settings.`
}

// Firebase surfaces the Google OAuth access token exactly once, on the result
// of the sign-in call. There is no refresh token in the browser, so this is
// held in memory and expires after roughly an hour.
function captureCalendarToken(result: UserCredential) {
  const credential = GoogleAuthProvider.credentialFromResult(result)
  if (credential?.accessToken) setCalendarToken(credential.accessToken)
}

function needsRedirect(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  return [
    'auth/popup-blocked',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment',
  ].includes(code)
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AureonUser | null>(null)
  const authOpen = ref(true)
  const authReady = ref(false)
  const authBusy = ref(false)
  const authError = ref('')
  const githubLinked = ref(false)
  const avatarMenuOpen = ref(false)
  const githubPanelOpen = ref(false)
  // Settings → Security → Devices (section 27a). Panel state rather than a route
  // because it is a settings surface, and settings here live in the account menu.
  const securityPanelOpen = ref(false)

  const isSignedIn = computed(() => !!user.value)
  const hasAllowlist = computed(() => allowedUids.length > 0 || allowedEmails.length > 0)
  const configurationReady = computed(() => firebaseEnabled && hasAllowlist.value)
  const avatarInitial = computed(() => user.value?.initial || 'A')
  const avatarName = computed(() => user.value?.name || 'Aureon')
  const avatarSub = computed(() => user.value?.email || '')
  const avatarColor = computed(() => user.value?.color || 'oklch(0.7 0.02 260)')
  const ghMenuLabel = computed(() => (githubLinked.value ? 'GitHub repos' : 'Link GitHub'))

  if (!firebaseEnabled || !auth) {
    authReady.value = true
    authError.value = 'Firebase is not configured. Add the VITE_FIREBASE_* environment values.'
  } else {
    const configuredAuth = auth
    getRedirectResult(configuredAuth)
      .then((result) => {
        if (result) captureCalendarToken(result)
      })
      .catch((error) => {
        authError.value = authMessage(error)
      })
    onAuthStateChanged(configuredAuth, async (firebaseUser) => {
      if (!firebaseUser) {
        user.value = null
        authOpen.value = true
        authReady.value = true
        return
      }

      if (!isFirebaseUserAllowed(firebaseUser)) {
        authError.value = hasAllowlist.value
          ? 'This Firebase account is not allowed to use Aureon.'
          : 'Set VITE_ALLOWED_UIDS or VITE_ALLOWED_EMAILS before signing in.'
        user.value = null
        authOpen.value = true
        authReady.value = true
        await fbSignOut(configuredAuth)
        return
      }

      user.value = fromFirebase(firebaseUser)
      githubLinked.value = firebaseUser.providerData.some((provider) =>
        provider.providerId.includes('github'),
      )
      authError.value = ''
      authOpen.value = false
      authReady.value = true
    })
  }

  async function loginWithProvider(provider: AuthProvider) {
    if (!firebaseEnabled || !auth) {
      authError.value = 'Firebase is not configured. Replace the environment placeholders first.'
      return
    }
    authBusy.value = true
    authError.value = ''
    try {
      captureCalendarToken(await signInWithPopup(auth, provider))
    } catch (error) {
      if (needsRedirect(error)) {
        authError.value = 'Popup unavailable. Continuing sign-in in this window…'
        try {
          await signInWithRedirect(auth, provider)
          return
        } catch (redirectError) {
          authError.value = authMessage(redirectError)
        }
      } else {
        authError.value = authMessage(error)
      }
    } finally {
      authBusy.value = false
    }
  }

  async function loginGoogle() {
    const provider = new GoogleAuthProvider()
    provider.addScope(CALENDAR_SCOPE)
    provider.setCustomParameters({ prompt: 'select_account' })
    await loginWithProvider(provider)
  }

  // Re-consent for calendar access only. The access token lives about an hour
  // and Firebase issues no browser refresh token, so this is the recovery path
  // when a calendar call comes back 401.
  async function reconnectCalendar(): Promise<boolean> {
    if (!auth) return false
    const provider = new GoogleAuthProvider()
    provider.addScope(CALENDAR_SCOPE)
    provider.setCustomParameters({ prompt: 'consent' })
    try {
      captureCalendarToken(await signInWithPopup(auth, provider))
      return hasCalendarToken()
    } catch (error) {
      console.error('[Aureon] Calendar reconnect failed:', error)
      return false
    }
  }

  async function loginGithub() {
    const provider = new GithubAuthProvider()
    provider.addScope('repo')
    provider.setCustomParameters({ allow_signup: 'true' })
    await loginWithProvider(provider)
  }

  function openAuth() {
    authOpen.value = true
    avatarMenuOpen.value = false
  }

  async function signOut() {
    if (auth) {
      try {
        await fbSignOut(auth)
      } catch (error) {
        console.error('[Aureon] Sign-out failed:', error)
      }
    }
    user.value = null
    githubLinked.value = false
    setCalendarToken(null)
    avatarMenuOpen.value = false
    githubPanelOpen.value = false
    securityPanelOpen.value = false
    // Forget this install's session id (section 27a). Without this, signing back
    // in on a machine someone deliberately revoked would reuse the killed id —
    // which the server refuses to resurrect, leaving the user signed in to
    // nothing. A fresh sign-in is honestly a new session, so it gets a new id.
    clearSessionId()
    authOpen.value = true
  }

  function toggleAvatarMenu() {
    avatarMenuOpen.value = !avatarMenuOpen.value
  }

  async function linkGithub() {
    if (!auth?.currentUser) return
    try {
      const provider = new GithubAuthProvider()
      provider.addScope('repo')
      await linkWithPopup(auth.currentUser, provider)
      githubLinked.value = true
    } catch (error) {
      console.error('[Aureon] GitHub link failed:', error)
    }
  }

  function openGithubPanel() {
    if (!user.value) return
    // The panel itself loads the installation's repos through ghProxy when it
    // opens; nothing to prefetch here.
    githubPanelOpen.value = true
    avatarMenuOpen.value = false
  }
  function closeGithubPanel() {
    githubPanelOpen.value = false
  }

  function openSecurityPanel() {
    if (!user.value) return
    securityPanelOpen.value = true
    avatarMenuOpen.value = false
  }
  function closeSecurityPanel() {
    securityPanelOpen.value = false
  }
  return {
    user,
    authOpen,
    authReady,
    authBusy,
    authError,
    githubLinked,
    avatarMenuOpen,
    githubPanelOpen,
    securityPanelOpen,
    isSignedIn,
    configurationReady,
    avatarInitial,
    avatarName,
    avatarSub,
    avatarColor,
    ghMenuLabel,
    loginGoogle,
    loginGithub,
    reconnectCalendar,
    openAuth,
    signOut,
    toggleAvatarMenu,
    linkGithub,
    openGithubPanel,
    closeGithubPanel,
    openSecurityPanel,
    closeSecurityPanel,
  }
})
