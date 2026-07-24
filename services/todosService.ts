import { db } from "../utils/firebase";
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
  writeBatch,
} from "firebase/firestore";

export interface Todo {
  id: string;
  userId: string;
  title: string;
  notes?: string;
  dueDate?: number | null; // epoch ms
  completed: boolean;
  order: number;
  createdAt?: any; // server timestamp
  updatedAt?: any; // server timestamp
  completedAt?: any | null; // server timestamp
}

export const TODOS_COLLECTION = "astra_todos";

const cleanData = (data: any) => {
  const clean: any = {};
  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) clean[key] = data[key];
  });
  return clean;
};

export const subscribeToTodos = (
  userId: string,
  callback: (todos: Todo[]) => void,
  onError?: (error: any) => void,
) => {
  if (!userId) return () => {};

  const q = query(
    collection(db, TODOS_COLLECTION),
    where("userId", "==", userId),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const todos = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Todo,
      );
      // Sort client-side to avoid a composite index: by order, then newest.
      todos.sort((a, b) => {
        const oa = a.order ?? Number.MAX_SAFE_INTEGER;
        const ob = b.order ?? Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        const ca = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const cb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return cb - ca;
      });
      callback(todos);
    },
    (error) => {
      console.error("Error subscribing to todos:", error);
      if (onError) onError(error);
    },
  );
};

export const addTodo = async (
  userId: string,
  data: Partial<Todo>,
): Promise<string> => {
  const docRef = await addDoc(
    collection(db, TODOS_COLLECTION),
    cleanData({
      userId,
      title: data.title || "",
      notes: data.notes || "",
      dueDate: data.dueDate ?? null,
      completed: false,
      order: data.order ?? Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: null,
    }),
  );
  return docRef.id;
};

export const updateTodo = async (id: string, updates: Partial<Todo>) => {
  const ref = doc(db, TODOS_COLLECTION, id);
  const { id: _omit, ...rest } = updates as any;
  await updateDoc(ref, cleanData({ ...rest, updatedAt: serverTimestamp() }));
};

// Toggle completion, stamping/clearing completedAt server-side.
export const setTodoCompleted = async (id: string, completed: boolean) => {
  const ref = doc(db, TODOS_COLLECTION, id);
  await updateDoc(ref, {
    completed,
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
};

export const deleteTodo = async (id: string) => {
  await deleteDoc(doc(db, TODOS_COLLECTION, id));
};

// Persist a new ordering for a set of todo ids (batched).
export const reorderTodos = async (orderedIds: string[]) => {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, TODOS_COLLECTION, id), {
      order: index,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
};
