import { db } from "./firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

export type GoalPriority = "low" | "medium" | "high";
export type GoalStatus = "active" | "completed";

export interface Goal {
  id: string;
  title: string;
  deadline: string; // ISO date string YYYY-MM-DD
  priority: GoalPriority;
  notes: string;
  status: GoalStatus;
  userId: string;
  createdAt?: any;
}

const COLLECTION_NAME = "astra-goals";

export const addGoal = async (goal: Omit<Goal, "id" | "createdAt">) => {
  try {
    await addDoc(collection(db, COLLECTION_NAME), {
      ...goal,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error adding goal:", error);
    throw error;
  }
};

export const updateGoal = async (id: string, updates: Partial<Goal>) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, updates);
  } catch (error) {
    console.error("Error updating goal:", error);
    throw error;
  }
};

export const deleteGoal = async (id: string) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (error) {
    console.error("Error deleting goal:", error);
    throw error;
  }
};

export const subscribeToGoals = (
  userId: string,
  callback: (goals: Goal[]) => void,
) => {
  if (!userId) return () => {};

  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId),
  );

  return onSnapshot(q, (snapshot) => {
    const goals = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Goal[];
    // Sort client-side
    goals.sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return b.createdAt.seconds - a.createdAt.seconds;
      }
      return 0;
    });
    callback(goals);
  });
};
