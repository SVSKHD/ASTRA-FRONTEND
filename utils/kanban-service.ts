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
    where
} from "firebase/firestore";

export type ColumnType = "Backlog" | "To Do" | "In Progress" | "In Review" | "Testing" | "Done" | "Dock" | "Finished" | "Parked";

export type Priority = "Low" | "Medium" | "High";

export interface Task {
    id: string;
    boardId: string;
    content: string;
    description?: string;
    priority?: Priority;
    deadline?: any;
    column: ColumnType;
    createdAt: any;
}

export interface Board {
    id: string;
    name: string;
    columns?: ColumnType[];
    createdAt: any;
}


export const createBoard = async (name: string, columns: ColumnType[] = ["Dock", "In Progress", "Finished", "Parked"]) => {
    try {
        const docRef = await addDoc(collection(db, "astra-boards"), {
            name,
            columns,
            createdAt: serverTimestamp(),
        });
        return docRef.id;
    } catch (e) {
        console.error("Error creating board: ", e);
        throw e;
    }
};

export const subscribeToBoards = (
    callback: (boards: Board[]) => void,
    onError?: (error: any) => void
) => {
    const q = query(collection(db, "astra-boards"), orderBy("createdAt", "desc"));
    return onSnapshot(
        q,
        (snapshot) => {
            const boards = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Board));
            callback(boards);
        },
        (error) => {
            console.error("Error subscribing to boards:", error);
            if (onError) onError(error);
        }
    );
}


export const subscribeToTasks = (
    boardId: string,
    callback: (tasks: Task[]) => void,
    onError?: (error: any) => void
) => {
    // Query 'astra-tasks' collection where 'boardId' matches the current board
    const q = query(
        collection(db, "astra-tasks"),
        where("boardId", "==", boardId),
        orderBy("createdAt", "desc")
    );

    return onSnapshot(
        q,
        (snapshot) => {
            const tasks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Task));
            callback(tasks);
        },
        (error) => {
            console.error("Error subscribing to tasks:", error);
            if (onError) onError(error);
        }
    );
}

export const addTask = async (boardId: string, content: string, column: ColumnType) => {
    await addDoc(collection(db, "astra-tasks"), {
        boardId,
        content,
        column,
        priority: "Medium",
        createdAt: serverTimestamp()
    });
}

export const updateTask = async (taskId: string, updates: Partial<Task>) => {
    const taskRef = doc(db, "astra-tasks", taskId);
    // Remove id/boardId/createdAt from updates if present to avoid overwriting immutables if passed carelessly, 
    // though Firestore ignores undefineds often, let's just pass updates directly for now as Partial<Task> is safe enough 
    // if we control the input.
    // Actually, we should probably exclude id from the payload.
    const { id, ...data } = updates as any;
    await updateDoc(taskRef, data);
}

export const moveTask = async (taskId: string, newColumn: ColumnType) => {
    const taskRef = doc(db, "astra-tasks", taskId);
    await updateDoc(taskRef, {
        column: newColumn
    });
}

export const deleteTask = async (taskId: string) => {
    await deleteDoc(doc(db, "astra-tasks", taskId));
}
