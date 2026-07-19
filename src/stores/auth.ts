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

function initialOf(name: string): string {
  return (name || 'U').trim().charAt(0).toUpperCase() || 'U'
}

function fromFirebase(u: FbUser): AureonUser {
  const providerId = u.providerData[0]?.providerId || ''
  const provider = providerId.includes('github') ? 'github' : 'google'
  const name = u.displayName || (u.email ? u.email.split('@')[0] : 'User')
  return {
    name,
    email: u.email || '',
    provider,
    initial: initialOf(name),
    color: provider === 'github' ? GITHUB_COLOR : GOOGLE_COLOR,
  }
}

const mockGoogleUser = (): AureonUser => ({
  name: 'Alex Rivera',
  email: 'alex@gmail.com',
  provider: 'google',
  initial: 'A',
  color: GOOGLE_COLOR,
})
const mockGithubUser = (): AureonUser => ({
  name: 'octodev',
  email: 'octo@users.noreply.github.com',
  provider: 'github',
  initial: 'O',
  color: GITHUB_COLOR,
})

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AureonUser | null>(null)
  const authOpen = ref(true)
  const guested = ref(false)
  const githubLinked = ref(false)
  const avatarMenuOpen = ref(false)
  const githubPanelOpen = ref(false)

  const ghRepos = ref<Repo[] | null>(null)
  const ghLoadingRepos = ref(false)
  const ghSearch = ref('')
  const expandedRepoId = ref<string | null>(null)

  const isSignedIn = computed(() => !!user.value)
  const avatarInitial = computed(() => (user.value ? user.value.initial : 'G'))
  const avatarName = computed(() => (user.value ? user.value.name : 'Guest'))
  const avatarSub = computed(() =>
    user.value ? user.value.email : 'Local only · not synced',
  )
  const avatarColor = computed(() => (user.value ? user.value.color : 'oklch(0.7 0.02 260)'))
  const ghMenuLabel = computed(() => (githubLinked.value ? 'GitHub repos' : 'Link GitHub'))

  // Restore any existing Firebase session.
  if (firebaseEnabled && auth) {
    onAuthStateChanged(auth, (u) => {
      if (u) {
        user.value = fromFirebase(u)
        authOpen.value = false
        guested.value = false
      }
    })
  }

  function loadRepos() {
    ghLoadingRepos.value = true
    // Real GitHub API would go here:
    //   fetch('https://api.github.com/user/repos?sort=pushed', { headers: { Authorization: 'token ' + ghToken } })
    setTimeout(() => {
      ghRepos.value = mockRepos(Date.now())
      ghLoadingRepos.value = false
    }, 900)
  }

  async function loginGoogle() {
    if (firebaseEnabled && auth) {
      try {
        await signInWithPopup(auth, new GoogleAuthProvider())
        // onAuthStateChanged sets the user.
        return
      } catch (err) {
        console.error('[Aureon] Google sign-in failed:', err)
      }
    }
    // Local fallback (no Firebase configured, or popup blocked).
    user.value = mockGoogleUser()
    authOpen.value = false
    guested.value = false
  }

  async function loginGithub() {
    if (firebaseEnabled && auth) {
      try {
        const provider = new GithubAuthProvider()
        provider.addScope('repo')
        await signInWithPopup(auth, provider)
        githubLinked.value = true
        loadRepos()
        return
      } catch (err) {
        console.error('[Aureon] GitHub sign-in failed:', err)
      }
    }
    user.value = mockGithubUser()
    authOpen.value = false
    guested.value = false
    githubLinked.value = true
    loadRepos()
  }

  function continueGuest() {
    authOpen.value = false
    guested.value = true
  }
  function openAuth() {
    authOpen.value = true
    avatarMenuOpen.value = false
  }
  async function signOut() {
    if (firebaseEnabled && auth) {
      try {
        await fbSignOut(auth)
      } catch (err) {
        console.error('[Aureon] Sign-out failed:', err)
      }
    }
    user.value = null
    githubLinked.value = false
    ghRepos.value = null
    avatarMenuOpen.value = false
    githubPanelOpen.value = false
    authOpen.value = true
    guested.value = false
  }
  function toggleAvatarMenu() {
    avatarMenuOpen.value = !avatarMenuOpen.value
  }
  async function linkGithub() {
    if (firebaseEnabled && auth && auth.currentUser) {
      try {
        const provider = new GithubAuthProvider()
        provider.addScope('repo')
        await linkWithPopup(auth.currentUser, provider)
      } catch (err) {
        console.error('[Aureon] GitHub link failed:', err)
      }
    }
    githubLinked.value = true
    loadRepos()
  }
  function openGithubPanel() {
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
  function setGhSearch(v: string) {
    ghSearch.value = v
  }

  return {
    user,
    authOpen,
    guested,
    githubLinked,
    avatarMenuOpen,
    githubPanelOpen,
    ghRepos,
    ghLoadingRepos,
    ghSearch,
    expandedRepoId,
    isSignedIn,
    avatarInitial,
    avatarName,
    avatarSub,
    avatarColor,
    ghMenuLabel,
    loginGoogle,
    loginGithub,
    continueGuest,
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
