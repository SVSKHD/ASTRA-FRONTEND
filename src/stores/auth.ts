import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  linkWithPopup,
  type User as FbUser,
} from 'firebase/auth'
import { auth, firebaseEnabled } from '@/firebase'
import { mockRepos } from '@/utils/github'
import type { AureonUser, Repo } from '@/types'

const GOOGLE_COLOR = 'oklch(0.62 0.15 255)'
const GITHUB_COLOR = 'oklch(0.5 0.02 260)'

const allowedUids = (import.meta.env.VITE_ALLOWED_UIDS || '')
  .split(',')
  .map((value: string) => value.trim())
  .filter((value: string) => value && !value.startsWith('REPLACE_'))

const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS || '')
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
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('popup-closed-by-user')) return 'Sign-in was cancelled.'
  if (message.includes('popup-blocked')) return 'Allow pop-ups for this site, then try again.'
  if (message.includes('account-exists-with-different-credential'))
    return 'This email already uses another sign-in provider.'
  return 'Authentication failed. Check the Firebase configuration and provider settings.'
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

  const ghRepos = ref<Repo[] | null>(null)
  const ghLoadingRepos = ref(false)
  const ghSearch = ref('')
  const expandedRepoId = ref<string | null>(null)

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
      githubLinked.value = firebaseUser.providerData.some((provider) => provider.providerId.includes('github'))
      authError.value = ''
      authOpen.value = false
      authReady.value = true
    })
  }

  function loadRepos() {
    ghLoadingRepos.value = true
    setTimeout(() => {
      ghRepos.value = mockRepos(Date.now())
      ghLoadingRepos.value = false
    }, 900)
  }

  async function loginGoogle() {
    if (!firebaseEnabled || !auth) {
      authError.value = 'Firebase is not configured. Replace the environment placeholders first.'
      return
    }
    authBusy.value = true
    authError.value = ''
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (error) {
      authError.value = authMessage(error)
    } finally {
      authBusy.value = false
    }
  }

  async function loginGithub() {
    if (!firebaseEnabled || !auth) {
      authError.value = 'Firebase is not configured. Replace the environment placeholders first.'
      return
    }
    authBusy.value = true
    authError.value = ''
    try {
      const provider = new GithubAuthProvider()
      provider.addScope('repo')
      await signInWithPopup(auth, provider)
    } catch (error) {
      authError.value = authMessage(error)
    } finally {
      authBusy.value = false
    }
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
    ghRepos.value = null
    avatarMenuOpen.value = false
    githubPanelOpen.value = false
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
      loadRepos()
    } catch (error) {
      console.error('[Aureon] GitHub link failed:', error)
    }
  }

  function openGithubPanel() {
    if (!user.value) return
    githubPanelOpen.value = true
    avatarMenuOpen.value = false
    if (githubLinked.value && !ghRepos.value && !ghLoadingRepos.value) loadRepos()
  }
  function closeGithubPanel() {
    githubPanelOpen.value = false
  }
  function toggleRepoExpand(id: string) {
    expandedRepoId.value = expandedRepoId.value === id ? null : id
  }
  function setGhSearch(value: string) {
    ghSearch.value = value
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
    ghRepos,
    ghLoadingRepos,
    ghSearch,
    expandedRepoId,
    isSignedIn,
    configurationReady,
    avatarInitial,
    avatarName,
    avatarSub,
    avatarColor,
    ghMenuLabel,
    loginGoogle,
    loginGithub,
    openAuth,
    signOut,
    toggleAvatarMenu,
    linkGithub,
    loadRepos,
    openGithubPanel,
    closeGithubPanel,
    toggleRepoExpand,
    setGhSearch,
  }
})
