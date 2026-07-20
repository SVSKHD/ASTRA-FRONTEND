import { db } from '@/utils/firebase'
import {
  collection,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'

// ─── Types ─────────────────────────────────────────────────────

export interface TradingEntry {
  id: string
  date: string // ISO date string (YYYY-MM-DD)
  profitUsd: number
  profitInr: number // auto-converted
  startPrice?: number // market price at session start
  entryPrice: number // position entry price
  exitPrice?: number // position exit price
  noOfTrades?: number // number of trades in this entry
  note?: string
}

export interface TradingBot {
  id: string
  userId: string
  title: string
  description: string
  entries: TradingEntry[]
  noOfTrades?: number
  slug?: string // URL slug for public share link

  createdAt: Timestamp
  updatedAt: Timestamp
}

// Builds a URL-safe, collision-resistant slug: "alpha-scout-ab12c"
export const makeSlug = (title: string, id: string): string => {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = id.slice(0, 5)
  return base ? `${base}-${suffix}` : suffix
}

const COLLECTION = 'astra-trading-journal'

// ─── Bot CRUD ──────────────────────────────────────────────────

/**
 * Synchronously builds a TradingBot with a client-generated ID and kicks off
 * the Firestore write in the background. Consumers should add `bot` to local
 * state immediately and `.catch()` on `persisted` to revert on failure.
 */
export const createTradingBot = (
  data: Pick<TradingBot, 'userId' | 'title' | 'description'>,
): { bot: TradingBot; persisted: Promise<void> } => {
  const docRef = doc(collection(db, COLLECTION))
  const now = Timestamp.now()
  const slug = makeSlug(data.title, docRef.id)

  const bot: TradingBot = {
    id: docRef.id,
    userId: data.userId,
    title: data.title,
    description: data.description,
    entries: [],
    slug,
    createdAt: now,
    updatedAt: now,
  }

  const persisted = setDoc(docRef, {
    userId: data.userId,
    title: data.title,
    description: data.description,
    entries: [],
    slug,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return { bot, persisted }
}

export const fetchTradingBots = async (userId: string): Promise<TradingBot[]> => {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  )

  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as TradingBot[]
}

export const updateTradingBot = async (
  botId: string,
  data: Partial<Pick<TradingBot, 'title' | 'description' | 'entries' | 'noOfTrades' | 'slug'>>,
): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, botId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export const deleteTradingBot = async (botId: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION, botId))
}

// Public lookup for the shareable page. Queries by slug and falls back to a
// direct-by-id lookup so old bots without a slug still resolve.
export const fetchTradingBotBySlug = async (slugOrId: string): Promise<TradingBot | null> => {
  const q = query(collection(db, COLLECTION), where('slug', '==', slugOrId))
  const snap = await getDocs(q)
  if (!snap.empty) {
    const d = snap.docs[0]
    return { id: d.id, ...d.data() } as TradingBot
  }

  // Fallback: treat the param as a doc id (legacy bots / direct links)
  const byId = await getDoc(doc(db, COLLECTION, slugOrId))
  if (byId.exists()) {
    return { id: byId.id, ...byId.data() } as TradingBot
  }
  return null
}

// ─── Entry helpers ─────────────────────────────────────────────

export const makeTradingEntry = (entry: Omit<TradingEntry, 'id'>): TradingEntry => ({
  ...entry,
  id: crypto.randomUUID(),
})
