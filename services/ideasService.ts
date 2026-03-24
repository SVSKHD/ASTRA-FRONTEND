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

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  date: number;
}

export interface Idea {
  id: string;
  userId: string;
  title: string;
  description: string;
  noteIds: string[];
  timeline: TimelineEvent[];
  createdAt: number;
  updatedAt: number;
  isShared?: boolean;
}

const IDEAS_COLLECTION = "astra_ideas";

export const ideasService = {
  async fetchIdeas(userId: string): Promise<Idea[]> {
    if (!userId) return [];

    const q = query(
      collection(db, IDEAS_COLLECTION),
      where("userId", "==", userId),
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Idea,
    );

    // Sort in memory to bypass the requirement for a Firebase compound index
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async addIdea(idea: Omit<Idea, "id">): Promise<string> {
    const docRef = await addDoc(collection(db, IDEAS_COLLECTION), idea);
    return docRef.id;
  },

  async updateIdea(id: string, idea: Partial<Idea>): Promise<void> {
    const ideaRef = doc(db, IDEAS_COLLECTION, id);
    await updateDoc(ideaRef, idea);
  },

  async deleteIdea(id: string): Promise<void> {
    const ideaRef = doc(db, IDEAS_COLLECTION, id);
    await deleteDoc(ideaRef);
  },
};
