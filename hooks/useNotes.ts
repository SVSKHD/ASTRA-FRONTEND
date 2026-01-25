import { useState, useCallback, useEffect } from 'react';
import { Note, notesService } from '../services/notesService';

export const useNotes = () => {
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadNotes = useCallback(async () => {
        try {
            setLoading(true);
            const data = await notesService.fetchNotes();
            setNotes(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Failed to load notes');
        } finally {
            setLoading(false);
        }
    }, []);

    const createNote = async (note: Pick<Note, 'title' | 'content'>) => {
        try {
            const newNote = {
                ...note,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            await notesService.addNote(newNote);
            await loadNotes(); // Refresh list
            return true;
        } catch (err) {
            console.error(err);
            setError('Failed to create note');
            return false;
        }
    };

    const updateNote = async (id: string, note: Partial<Note>) => {
        try {
            await notesService.updateNote(id, {
                ...note,
                updatedAt: Date.now()
            });
            await loadNotes(); // Refresh list
            return true;
        } catch (err) {
            console.error(err);
            setError('Failed to update note');
            return false;
        }
    };

    const deleteNote = async (id: string) => {
        try {
            await notesService.deleteNote(id);
            await loadNotes(); // Refresh list
            return true;
        } catch (err) {
            console.error(err);
            setError('Failed to delete note');
            return false;
        }
    };

    // Initial load
    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    return {
        notes,
        loading,
        error,
        createNote,
        updateNote,
        deleteNote,
        refreshNotes: loadNotes
    };
};
