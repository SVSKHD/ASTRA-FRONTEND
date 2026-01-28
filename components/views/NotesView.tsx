import React, { useState } from "react";
import {
  Plus,
  Clock,
  Share2,
  Trash2,
  Loader2,
  Eye,
  Maximize2,
  AlertCircle,
} from "lucide-react";
import { NoteDialog, Note as DialogNote } from "../NoteDialog";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { AnimatePresence, motion } from "framer-motion";
import { useNotes } from "../../hooks/useNotes";
import { Note } from "../../services/notesService";

// Helper to map Service Note to Dialog Note if needed, though they are compatible
const mapToDialogNote = (note: Note): DialogNote => ({
  ...note,
});

export const NotesView = () => {
  const { notes, loading, createNote, updateNote, deleteNote } = useNotes();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<DialogNote | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "view">("edit");
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    noteId: string | null;
  }>({
    isOpen: false,
    noteId: null,
  });

  const handleCreateUpdateNote = async (noteData: Partial<DialogNote>) => {
    if (noteData.id) {
      // Update
      await updateNote(noteData.id, {
        title: noteData.title,
        content: noteData.content,
      });
    } else {
      // Create
      if (noteData.title && noteData.content) {
        await createNote({
          title: noteData.title,
          content: noteData.content,
        });
      }
    }
  };

  const handleOpenCreate = () => {
    setEditingNote(null);
    setViewMode("edit");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (note: Note) => {
    setEditingNote(mapToDialogNote(note));
    setViewMode("edit");
    setIsDialogOpen(true);
  };

  const handleOpenView = (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    setEditingNote(mapToDialogNote(note));
    setViewMode("view");
    setIsDialogOpen(true);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmation({ isOpen: true, noteId: id });
  };

  const confirmDeleteNote = async () => {
    if (deleteConfirmation.noteId) {
      await deleteNote(deleteConfirmation.noteId);
    }
    setDeleteConfirmation({ isOpen: false, noteId: null });
  };

  const handleShare = (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    // Assuming we might have a route for sharing or just raw content
    const url = `${window.location.origin}/notes/${note.id}`;
    navigator.clipboard.writeText(url);
    alert(`Link copied to clipboard: ${url}`);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-white/50">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <button
            onClick={handleOpenCreate}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors border border-white/5"
          >
            <Plus size={20} className="text-white/80" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6 overflow-y-auto">
        {notes.map((note) => (
          <div
            key={note.id}
            onClick={() => handleOpenEdit(note)}
            className="p-5 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all cursor-pointer group flex flex-col h-64 relative overflow-hidden"
          >
            <h3 className="font-semibold text-lg text-white/90 mb-2 group-hover:text-blue-200 transition-colors line-clamp-1 pr-16">
              {note.title}
            </h3>

            <div
              className="text-sm text-white/60 line-clamp-6 prose prose-invert prose-sm"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />

            <div className="mt-auto pt-4 flex items-center justify-between text-xs text-white/30 border-t border-white/5">
              <div className="flex items-center gap-2">
                <Clock size={12} />
                <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
              </div>

              <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all duration-200">
                <button
                  onClick={(e) => handleOpenView(e, note)}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white/40 hover:text-white transition-all"
                  title="View"
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenEdit(note);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white/40 hover:text-white transition-all"
                  title="Edit"
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  onClick={(e) => handleShare(e, note)}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white/40 hover:text-white transition-all"
                  title="Share"
                >
                  <Share2 size={14} />
                </button>
                <button
                  onClick={(e) => handleDelete(e, note.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20 pointer-events-none" />
          </div>
        ))}

        {/* Empty State */}
        {notes.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-white/30">
            <p>No notes yet</p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 text-blue-400 hover:underline"
            >
              Create one
            </button>
          </div>
        )}
      </div>

      <DeleteConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, noteId: null })}
        onConfirm={confirmDeleteNote}
        title="Delete Note"
        description={
          <p>
            Are you sure you want to delete{" "}
            <span className="text-white font-medium">
              "{notes.find((n) => n.id === deleteConfirmation.noteId)?.title}"
            </span>
            ? This action cannot be undone.
          </p>
        }
      />

      <AnimatePresence>
        {isDialogOpen && (
          <NoteDialog
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            onSave={handleCreateUpdateNote}
            initialNote={editingNote}
            readOnly={viewMode === "view"}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
