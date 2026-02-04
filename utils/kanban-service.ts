import { db } from "./firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  where,
  getDocs,
  writeBatch,
  or,
  arrayUnion,
} from "firebase/firestore";
import { UserProfile } from "../context/UserContext";

export type ColumnType =
  | "Backlog"
  | "To Do"
  | "In Progress"
  | "In Review"
  | "Testing"
  | "Done"
  | "Dock"
  | "Finished"
  | "Parked";

export type Priority = "Low" | "Medium" | "High";

export interface Task {
  id: string;
  boardId: string;
  content: string;
  description?: string;
  priority?: Priority;
  deadline?: any;
  estimatedTime?: number;
  timeSpent?: number;
  column: ColumnType;
  userId: string;
  createdAt: any;
  githubRepo?: string;
  githubBranch?: string;
  githubPath?: string;
  assignedTo?: string; // UserId
  isSharable?: boolean;
}

export interface Board {
  id: string;
  name: string;
  columns?: ColumnType[];
  userId: string;
  createdAt: any;
  members?: UserProfile[]; // Shared members
  memberIds?: string[]; // For querying
  isSharable?: boolean;
}

export const createBoard = async (
  name: string,
  userId: string,
  columns: ColumnType[] = ["Dock", "In Progress", "Finished", "Parked"],
) => {
  try {
    const docRef = await addDoc(collection(db, "astra-boards"), {
      name,
      columns,
      userId,
      createdAt: serverTimestamp(),
      members: [],
      memberIds: [],
    });
    return docRef.id;
  } catch (e) {
    console.error("Error creating board: ", e);
    throw e;
  }
};

export const subscribeToBoards = (
  userId: string,
  callback: (boards: Board[]) => void,
  onError?: (error: any) => void,
) => {
  if (!userId) return () => {};

  const q = query(
    collection(db, "astra-boards"),
    or(
      where("userId", "==", userId),
      where("memberIds", "array-contains", userId),
    ),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const boards = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as Board,
      );
      callback(boards);
    },
    (error) => {
      console.error("Error subscribing to boards:", error);
      if (onError) onError(error);
    },
  );
};

export const subscribeToTasks = (
  boardId: string,
  callback: (tasks: Task[]) => void,
  onError?: (error: any) => void,
) => {
  // Query 'astra-tasks' collection where 'boardId' matches the current board
  // Note: Removed orderBy("createdAt") to avoid needing a composite index for now. Sorting client-side.
  const q = query(
    collection(db, "astra-tasks"),
    where("boardId", "==", boardId),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as Task,
      );

      // Sort client-side
      tasks.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tB - tA; // Descending
      });

      callback(tasks);
    },
    (error) => {
      console.error("Error subscribing to tasks:", error);
      if (onError) onError(error);
    },
  );
};

export const addTask = async (
  boardId: string,
  content: string,
  column: ColumnType,
  userId: string,
) => {
  await addDoc(collection(db, "astra-tasks"), {
    boardId,
    content,
    column,
    userId,
    priority: "Medium",
    createdAt: serverTimestamp(),
  });
};

// Helper to remove undefined keys
const cleanData = (data: any) => {
  const clean: any = {};
  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) {
      clean[key] = data[key];
    }
  });
  return clean;
};

export const createTask = async (
  boardId: string,
  taskData: Partial<Task>,
  column: ColumnType,
  userId: string,
) => {
  // Clean up undefined values from taskData if necessary, but Firestore handles them or we can just pass.
  // Ensure critical fields
  await addDoc(collection(db, "astra-tasks"), {
    boardId,
    content: taskData.content,
    description: taskData.description || "",
    priority: taskData.priority || "Medium",
    deadline: taskData.deadline ?? null,
    estimatedTime: taskData.estimatedTime ?? null,
    timeSpent: taskData.timeSpent ?? 0,
    column,
    userId,
    githubRepo: taskData.githubRepo ?? null,
    githubBranch: taskData.githubBranch ?? null,
    githubPath: taskData.githubPath ?? null,
    createdAt: serverTimestamp(),
  });
};

export const updateTask = async (taskId: string, updates: Partial<Task>) => {
  const taskRef = doc(db, "astra-tasks", taskId);
  // Remove id/boardId/createdAt from updates if present to avoid overwriting immutables if passed carelessly,
  // though Firestore ignores undefineds often, let's just pass updates directly for now as Partial<Task> is safe enough
  // if we control the input.
  // Actually, we should probably exclude id from the payload.
  const { id, ...data } = updates as any;
  const sanitizedData = cleanData(data);
  await updateDoc(taskRef, sanitizedData);
};

export const moveTask = async (taskId: string, newColumn: ColumnType) => {
  const taskRef = doc(db, "astra-tasks", taskId);
  await updateDoc(taskRef, {
    column: newColumn,
  });
};

export const deleteTask = async (taskId: string) => {
  await deleteDoc(doc(db, "astra-tasks", taskId));
};

export const deleteBoard = async (boardId: string) => {
  try {
    console.log("Starting deletion for board:", boardId);
    // 1. Get all tasks for this board
    const q = query(
      collection(db, "astra-tasks"),
      where("boardId", "==", boardId),
    );
    const snapshot = await getDocs(q);

    // 2. Batch delete tasks
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // 3. Delete the board itself
    const boardRef = doc(db, "astra-boards", boardId);
    batch.delete(boardRef);

    // 4. Commit batch
    await batch.commit();
  } catch (e) {
    console.error("Error deleting board:", e);
    throw e;
  }
};

export const addMemberToBoard = async (
  boardId: string,
  member: UserProfile,
) => {
  const boardRef = doc(db, "astra-boards", boardId);
  await updateDoc(boardRef, {
    members: arrayUnion(member),
    memberIds: arrayUnion(member.id),
  });
};

export const updateBoard = async (boardId: string, updates: Partial<Board>) => {
  const boardRef = doc(db, "astra-boards", boardId);
  await updateDoc(boardRef, updates);
};
