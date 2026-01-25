import { db } from "../utils/firebase";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    orderBy,
    Timestamp
} from "firebase/firestore";

export interface Note {
    id: string;
    title: string;
    content: string;
    createdAt: number;
    updatedAt: number;
}

const NOTES_COLLECTION = "astra_notes";

export const notesService = {
    async fetchNotes(): Promise<Note[]> {
        const q = query(
            collection(db, NOTES_COLLECTION),
            orderBy("updatedAt", "desc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Note));
    },

    async addNote(note: Omit<Note, "id">): Promise<string> {
        const docRef = await addDoc(collection(db, NOTES_COLLECTION), note);
        return docRef.id;
    },

    async updateNote(id: string, note: Partial<Note>): Promise<void> {
        const noteRef = doc(db, NOTES_COLLECTION, id);
        await updateDoc(noteRef, note);
    },

    async deleteNote(id: string): Promise<void> {
        const noteRef = doc(db, NOTES_COLLECTION, id);
        await deleteDoc(noteRef);
    }
};
