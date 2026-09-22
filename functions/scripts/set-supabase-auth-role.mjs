import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || '').trim()
const ONLY_UID = String(process.env.FIREBASE_UID || '').trim()

initializeApp({
  credential: applicationDefault(),
  ...(PROJECT_ID ? { projectId: PROJECT_ID } : {}),
})

const auth = getAuth()
let updated = 0

async function apply(user) {
  const claims = { ...(user.customClaims || {}), role: 'authenticated' }
  await auth.setCustomUserClaims(user.uid, claims)
  updated += 1
  console.log(`role=authenticated: ${user.uid}`)
}

if (ONLY_UID) {
  await apply(await auth.getUser(ONLY_UID))
} else {
  let pageToken
  do {
    const page = await auth.listUsers(1000, pageToken)
    for (const user of page.users) await apply(user)
    pageToken = page.pageToken
  } while (pageToken)
}

console.log(`done: updated ${updated} Firebase user(s)`)
console.log('Users must obtain a new Firebase ID token (sign out/in is the simplest way).')
