// Sign-in, through Supabase Auth (Supabase migration, phase 3).
//
// It used to be Firebase Authentication, with Supabase trusting Firebase's
// tokens through third-party auth. Firebase is gone from sign-in entirely now:
// one Supabase session (src/supabase.ts) is the user, the token the database
// checks, and the token `/api/github` checks.
//
// WHAT CHANGED FOR THE READER
//
//   • Sign-in is email + passcode (Supabase password sign-in). Google sign-in —
//     and with it the Google Calendar token — is off for now and will be wired
//     back later. GitHub sign-in is still OAuth: a redirect that comes back to
//     the page with the session in the URL.
//   • A new Supabase account has a new user id. Existing data was written under
//     the Firebase uid, so it is moved across once, in SQL — see
//     docs/SUPABASE_NORMALISATION_PLAN.md, "Phase 3".

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AuthError, Session, User as SbUser } from '@supabase/supabase-js'
import { supabase, supabaseEnabled } from '@/supabase'
import { setCalendarToken } from '@/utils/gcal'
// Section 27a: sign-out must forget the device's session identity.
import { clearSessionId } from '@/utils/sessionId'
import type { AureonUser } from '@/types'

const GOOGLE_COLOR = 'oklch(0.62 0.15 255)'
const GITHUB_COLOR = 'oklch(0.5 0.02 260)'

/**
 * The in-tab fixture (section 38), read here without importing the dev module.
 *
 * `@/dev/fixture` pulls the whole seed in with it, and a static import from a
 * store would put it in the production bundle. The expression is the same one
 * `fixtureEnabled()` uses, and it folds to `false` at build time.
 */
const FIXTURE = import.meta.env.DEV && String(import.meta.env.VITE_FIXTURE ?? '') === '1'

const allowedUids = (import.meta.env.VITE_ALLOWED_UIDS || '')
  .split(',')
  .map((value: string) => value.trim())
  .filter((value: string) => value && !value.startsWith('REPLACE_'))

const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS || '8svskhd@gmail.com')
  .split(',')
  .map((value: string) => value.trim().toLowerCase())
  .filter((value: string) => value && !value.startsWith('replace_'))

/**
 * The one email allowed to sign in, when there is exactly one — the sign-in
 * card fills it in so the owner only types the passcode.
 */
export const ownerEmail = allowedEmails.length === 1 ? allowedEmails[0] : ''

/** The owner allowlist. Ids are Supabase user ids now; emails work unchanged. */
export function isUserAllowed(user: { uid: string; email?: string | null }): boolean {
  const email = (user.email || '').toLowerCase()
  return allowedUids.includes(user.uid) || (!!email && allowedEmails.includes(email))
}

function initialOf(name: string): string {
  return (name || 'U').trim().charAt(0).toUpperCase() || 'U'
}

function hasGithubIdentity(user: SbUser): boolean {
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? []
  return (
    providers.includes('github') || (user.identities ?? []).some((i) => i.provider === 'github')
  )
}

function fromSupabase(user: SbUser): AureonUser {
  const provider = user.app_metadata?.provider === 'github' ? 'github' : 'google'
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const name =
    String(meta.full_name || meta.name || meta.user_name || '') ||
    (user.email ? user.email.split('@')[0] : 'User')
  return {
    uid: user.id,
    name,
    email: user.email || '',
    provider,
    initial: initialOf(name),
    color: provider === 'github' ? GITHUB_COLOR : GOOGLE_COLOR,
  }
}

function authMessage(error: AuthError | Error | string): string {
  const message = typeof error === 'string' ? error : error.message
  const lower = message.toLowerCase()
  if (lower.includes('provider is not enabled') || lower.includes('unsupported provider'))
    return 'Enable this sign-in provider in Supabase → Authentication → Sign In / Providers.'
  if (lower.includes('redirect'))
    return 'Add this address under Supabase → Authentication → URL Configuration → Redirect URLs.'
  if (lower.includes('manual linking'))
    return 'Turn on "Allow manual linking" in Supabase → Authentication → Sign In / Providers.'
  return `Sign-in failed: ${message}`
}

// Supabase says "Invalid login credentials" for a wrong email and a wrong
// passcode alike, which is right: saying which one was wrong tells a stranger
// which email has an account.
function passcodeMessage(error: AuthError): string {
  const lower = error.message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'That email and passcode do not match.'
  if (lower.includes('email not confirmed'))
    return 'Confirm this account in Supabase → Authentication → Users first.'
  if (lower.includes('rate limit') || error.status === 429)
    return 'Too many attempts. Wait a minute and try again.'
  return authMessage(error)
}

/** Where the OAuth round trip returns to: this page, this tab, no fragment. */
function returnTo(): string {
  const { origin, pathname, search } = window.location
  return origin + pathname + search
}

/**
 * An error the provider sent back on the redirect (the user cancelled, a
 * redirect URL is not allowed…). It arrives in the query string, and the URL
 * is cleaned so a reload does not show it again.
 */
function takeRedirectError(): string {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const description =
    url.searchParams.get('error_description') || hash.get('error_description') || ''
  if (!description) return ''
  for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key)
  window.history.replaceState(window.history.state, '', url.pathname + url.search)
  return description.replace(/\+/g, ' ')
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
  const configurationReady = computed(() => supabaseEnabled && hasAllowlist.value)
  const avatarInitial = computed(() => user.value?.initial || 'A')
  const avatarName = computed(() => user.value?.name || 'Aureon')
  const avatarSub = computed(() => user.value?.email || '')
  const avatarColor = computed(() => user.value?.color || 'oklch(0.7 0.02 260)')
  const ghMenuLabel = computed(() => (githubLinked.value ? 'GitHub repos' : 'Link GitHub'))

  async function applySession(session: Session | null) {
    const signedIn = session?.user ?? null

    if (!signedIn) {
      user.value = null
      authOpen.value = true
      authReady.value = true
      return
    }

    if (!isUserAllowed({ uid: signedIn.id, email: signedIn.email })) {
      authError.value = hasAllowlist.value
        ? 'This account is not allowed to use Aureon.'
        : 'Set VITE_ALLOWED_UIDS or VITE_ALLOWED_EMAILS before signing in.'
      user.value = null
      authOpen.value = true
      authReady.value = true
      await supabase?.auth.signOut()
      return
    }

    user.value = fromSupabase(signedIn)
    githubLinked.value = hasGithubIdentity(signedIn)
    authError.value = ''
    authOpen.value = false
    authReady.value = true
  }

  if (!supabaseEnabled || !supabase) {
    authReady.value = true
    authError.value =
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  } else if (FIXTURE) {
    // THE SCREENSHOT HARNESS OWNS `user` (src/dev/DevShot.vue). Attaching the
    // real listener beside it would resolve to "nobody is signed in" a moment
    // later and wipe the demo account. `import.meta.env.DEV` folds to false in
    // a production build, so this branch is dropped by the bundler.
    authReady.value = true
  } else {
    const redirectError = takeRedirectError()
    if (redirectError) authError.value = authMessage(redirectError)
    // Fires once straight away with the stored session (INITIAL_SESSION), then
    // on every sign-in, sign-out and token refresh. The work is deferred off
    // the callback: supabase-js holds a lock while it runs, and calling back
    // into auth from inside it (the allowlist sign-out) would deadlock.
    supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void applySession(session), 0)
    })
  }

  async function signInWith(
    provider: 'github',
    options: { scopes?: string; queryParams?: Record<string, string> },
  ) {
    if (!supabase) {
      authError.value = 'Supabase is not configured.'
      return
    }
    authBusy.value = true
    authError.value = ''
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: returnTo(), ...options },
    })
    // On success the browser is already leaving for the provider.
    if (error) {
      authError.value = authMessage(error)
      authBusy.value = false
    }
  }

  /**
   * Email + passcode (Supabase password sign-in). There is no sign-up here on
   * purpose: the owner's account is created once in the Supabase dashboard, and
   * the allowlist still has the last word on who may use the app.
   */
  async function loginWithPasscode(email: string, passcode: string) {
    if (!supabase) {
      authError.value = 'Supabase is not configured.'
      return
    }
    const address = email.trim()
    if (!address || !passcode) {
      authError.value = 'Enter your email and passcode.'
      return
    }
    authBusy.value = true
    authError.value = ''
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: address,
        password: passcode,
      })
      // Success arrives through onAuthStateChange, like every other sign-in.
      if (error) authError.value = passcodeMessage(error)
    } finally {
      authBusy.value = false
    }
  }

  // Google Calendar needs a Google sign-in, which is off until it is wired
  // back. Nothing to reconnect with yet, so the answer is always "no".
  async function reconnectCalendar(): Promise<boolean> {
    return false
  }

  async function loginGithub() {
    await signInWith('github', { scopes: 'repo' })
  }

  function openAuth() {
    authOpen.value = true
    avatarMenuOpen.value = false
  }

  async function signOut() {
    if (supabase) {
      try {
        await supabase.auth.signOut()
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
    // Forget this install's session id (section 27a). A fresh sign-in is
    // honestly a new session, so it gets a new id.
    clearSessionId()
    authOpen.value = true
  }

  function toggleAvatarMenu() {
    avatarMenuOpen.value = !avatarMenuOpen.value
  }

  // Attach a GitHub identity to the signed-in account. Needs "Allow manual
  // linking" on in the Supabase project; a redirect, like sign-in.
  async function linkGithub() {
    if (!supabase || !user.value) return
    const { error } = await supabase.auth.linkIdentity({
      provider: 'github',
      options: { scopes: 'repo', redirectTo: returnTo() },
    })
    if (error) {
      console.error('[Aureon] GitHub link failed:', error)
      authError.value = authMessage(error)
    }
  }

  function openGithubPanel() {
    if (!user.value) return
    // The panel itself loads the repos through ghProxy when it opens; nothing
    // to prefetch here.
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
    loginWithPasscode,
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
