import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
const ONLY_UID = String(process.env.FIREBASE_UID || '').trim()
const PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || '').trim()

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this migration.')
  process.exit(1)
}

initializeApp({
  credential: applicationDefault(),
  ...(PROJECT_ID ? { projectId: PROJECT_ID } : {}),
})

const db = getFirestore()

// These are still written by existing Firebase Functions in phase 1. Moving
// their readers before moving their writers would create a split-brain feed.
const KEEP_IN_FIRESTORE = new Set(['forex', 'gh-repos', 'gh-pulls', 'gh-comments', 'users'])

function plain(value) {
  if (value instanceof Timestamp) return value.toMillis()
  if (value instanceof Date) return value.getTime()
  if (Array.isArray(value)) return value.map(plain)
  if (value && typeof value === 'object') {
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
      return { latitude: value.latitude, longitude: value.longitude }
    }
    if (typeof value.path === 'string' && value.firestore) return value.path
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
  }
  return value
}

function ownerOf(namespace, id, data) {
  if (typeof data.userId === 'string' && data.userId) return data.userId
  if (typeof data.ownerId === 'string' && data.ownerId) return data.ownerId
  if (namespace === 'Astra-users' || namespace === 'aureon-notes') return id
  return ''
}

async function upsert(rows) {
  if (!rows.length) return
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/astra_documents?on_conflict=namespace,doc_id`,
    {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    },
  )

  if (!response.ok) {
    throw new Error(`Supabase import failed (${response.status}): ${await response.text()}`)
  }
}

const collections = await db.listCollections()
let written = 0
let skipped = 0

for (const collection of collections) {
  const namespace = collection.id
  if (KEEP_IN_FIRESTORE.has(namespace)) {
    console.log(`skip mirror: ${namespace}`)
    continue
  }

  let batch = []
  let namespaceWritten = 0

  for await (const snapshot of collection.stream()) {
    const raw = snapshot.data()
    const userId = ownerOf(namespace, snapshot.id, raw)
    if (!userId || (ONLY_UID && userId !== ONLY_UID)) {
      skipped += 1
      continue
    }

    batch.push({
      namespace,
      doc_id: snapshot.id,
      user_id: userId,
      data: plain(raw),
      updated_at: new Date().toISOString(),
    })

    if (batch.length >= 500) {
      await upsert(batch)
      written += batch.length
      namespaceWritten += batch.length
      batch = []
    }
  }

  if (batch.length) {
    await upsert(batch)
    written += batch.length
    namespaceWritten += batch.length
  }

  console.log(`migrated ${namespace}: ${namespaceWritten}`)
}

console.log(
  `done: ${written} documents migrated${ONLY_UID ? ` for uid ${ONLY_UID}` : ''}; ${skipped} skipped`,
)
