import { db } from "@/utils/firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  description: string;
  hasExpense: boolean;
  expenseAmount?: number;
  userAvatar?: string;
  createdAt: Timestamp;
}

const COLLECTION_NAME = "astra-journaling"; // Using astra-journaling as requested

export const addJournalEntry = async (
  entry: Omit<JournalEntry, "id" | "createdAt">,
): Promise<JournalEntry> => {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...entry,
      createdAt: serverTimestamp(),
    });

    return {
      id: docRef.id,
      ...entry,
      createdAt: Timestamp.now(), // Optimistic update
    };
  } catch (error) {
    console.error("Error adding journal entry: ", error);
    throw error;
  }
};

export const fetchJournalEntries = async (
  userId: string,
): Promise<JournalEntry[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as JournalEntry[];
  } catch (error) {
    console.error("Error fetching journal entries: ", error);
    throw error;
  }
};

export const deleteJournalEntry = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (error) {
    console.error("Error deleting journal entry: ", error);
    throw error;
  }
};
