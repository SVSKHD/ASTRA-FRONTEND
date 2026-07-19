import { db } from "./firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  doc,
  deleteDoc,
} from "firebase/firestore";

export interface ChatMessage {
  id?: string;
  text: string;
  sender: string;
  userId: string;
  createdAt: Timestamp | null;
  type?: "text" | "system";
}

const COLLECTION_NAME = "messages";

export const sendMessage = async (
  text: string,
  sender: string,
  userId: string,
) => {
  try {
    await addDoc(collection(db, COLLECTION_NAME), {
      text,
      sender,
      userId,
      createdAt: serverTimestamp(),
      type: "text",
    });
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

export const subscribeToMessages = (
  userId: string,
  callback: (messages: ChatMessage[]) => void,
) => {
  if (!userId) return () => {};

  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId),
    orderBy("createdAt", "asc"), // Oldest first
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as ChatMessage,
    );
    callback(messages);
  });
};
