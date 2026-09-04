<script setup lang="ts">
// `/dev/login?next=` (section 38).
//
// The harness's way into the REAL demo account, as opposed to the fixture: it
// signs in with the credentials from `.env.local` and then goes wherever `next`
// says. It exists so a screenshot can be taken of the app reading Firestore,
// which is the only run that proves the queries and the indexes are right.
//
// THREE THINGS KEEP IT OUT OF PRODUCTION, and one is not enough:
//
//   1. the route is only registered under `import.meta.env.DEV`, which is a
//      static false in a production build, so the branch and this component are
//      dropped by the bundler rather than shipped and guarded;
//   2. the password comes from `VITE_DEMO_PASSWORD`, which lives only in
//      `.env.local` — gitignored, never committed, and absent from every
//      deploy environment, so even a mistakenly-shipped build has nothing to
//      sign in with;
//   3. it refuses to run at all when either is missing, and says which.
//
// The password is read once into a local and never logged, never put in a
// query string, and never written to storage.
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth, firebaseEnabled } from '@/firebase'

const route = useRoute()
const router = useRouter()
const status = ref('Signing in…')

onMounted(async () => {
  const email = String(import.meta.env.VITE_DEMO_EMAIL ?? '')
  const password = String(import.meta.env.VITE_DEMO_PASSWORD ?? '')
  if (!import.meta.env.DEV) {
    status.value = 'Not available.'
    return
  }
  if (!firebaseEnabled) {
    status.value = 'Firebase is not configured — set VITE_FIREBASE_* in .env.local.'
    return
  }
  if (!email || !password) {
    status.value = 'Set VITE_DEMO_EMAIL and VITE_DEMO_PASSWORD in .env.local (never committed).'
    return
  }
  try {
    if (!auth) {
      status.value = 'Auth could not be loaded.'
      return
    }
    // Imported here rather than at the top so the password path is not part of
    // any chunk the production build could reach.
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    await signInWithEmailAndPassword(auth, email, password)
    // `next` is a path within this app and nothing else: an absolute URL here
    // would make this an open redirect that signs somebody in on the way out.
    const next = String(route.query.next ?? '/trades')
    await router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/trades')
  } catch (err) {
    status.value = `Sign-in failed: ${(err as { code?: string }).code ?? 'unknown'}`
  }
})
</script>

<template>
  <main class="devlogin">
    <p>{{ status }}</p>
  </main>
</template>

<style scoped>
.devlogin {
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-width: 0;
  padding: var(--sp-4);
  font-size: var(--text-sm);
  color: var(--text-primary, var(--theme-text));
  background: var(--bg, var(--theme-surface));
}
</style>
