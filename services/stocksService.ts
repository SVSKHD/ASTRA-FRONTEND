import { db } from "../utils/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

export interface Stock {
  id: string;
  userId: string;
  symbol: string;
  name: string;
  reason: string; // why-tracking notes
  targetPrice?: number | null;
  watchPrice?: number | null;
  tags?: string[];
  noteIds: string[];
  createdAt: number;
  updatedAt: number;
  isShared?: boolean;
}

const STOCKS_COLLECTION = "astra_stocks";

export const stocksService = {
  async fetchStocks(userId: string): Promise<Stock[]> {
    if (!userId) return [];

    const q = query(
      collection(db, STOCKS_COLLECTION),
      where("userId", "==", userId),
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Stock,
    );

    // Sort in memory to avoid needing a Firebase compound index.
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async addStock(stock: Omit<Stock, "id">): Promise<string> {
    const docRef = await addDoc(collection(db, STOCKS_COLLECTION), stock);
    return docRef.id;
  },

  async updateStock(id: string, stock: Partial<Stock>): Promise<void> {
    const stockRef = doc(db, STOCKS_COLLECTION, id);
    await updateDoc(stockRef, stock);
  },

  async deleteStock(id: string): Promise<void> {
    const stockRef = doc(db, STOCKS_COLLECTION, id);
    await deleteDoc(stockRef);
  },
};
