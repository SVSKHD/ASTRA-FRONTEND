import { db } from "./firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";

export type RecurrenceType =
  | "None"
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Yearly"
  | "Custom";

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dateTime: any; // Timestamp
  recurrence: RecurrenceType;
  customInterval?: number; // In days
  isCompleted: boolean;
  createdAt: any;
}

export const createReminder = async (
  userId: string,
  data: Omit<Reminder, "id" | "userId" | "createdAt" | "isCompleted">,
) => {
  try {
    const docRef = await addDoc(collection(db, "astra-reminders"), {
      ...data,
      userId,
      isCompleted: false,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating reminder:", error);
    throw error;
  }
};

export const subscribeToReminders = (
  userId: string,
  callback: (reminders: Reminder[]) => void,
) => {
  const q = query(
    collection(db, "astra-reminders"),
    where("userId", "==", userId),
    orderBy("dateTime", "asc"),
  );

  return onSnapshot(q, (snapshot) => {
    const reminders = snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Reminder,
    );
    callback(reminders);
  });
};

export const updateReminder = async (
  id: string,
  updates: Partial<Reminder>,
) => {
  const docRef = doc(db, "astra-reminders", id);
  await updateDoc(docRef, updates);
};

export const deleteReminder = async (id: string) => {
  await deleteDoc(doc(db, "astra-reminders", id));
};
