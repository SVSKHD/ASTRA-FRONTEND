import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Share2 } from "lucide-react";
import dynamic from "next/dynamic";

const NoteEditor = dynamic(
  () => import("./NoteEditor").then((mod) => mod.NoteEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] w-full bg-white/5 animate-pulse rounded-lg" />
    ),
  },
);

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface NoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Partial<Note>) => void;
  initialNote?: Note | null;
  readOnly?: boolean;
}

export const NoteDialog = ({
  isOpen,
  onClose,
  onSave,
  initialNote,
  readOnly = false,
}: NoteDialogProps) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (initialNote) {
        setTitle(initialNote.title);
        setContent(initialNote.content);
      } else {
        setTitle("");
        setContent("<p></p>");
      }
    }
  }, [isOpen, initialNote]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleSave = () => {
    if (title.trim()) {
      onSave({
        id: initialNote?.id,
        title,
        content,
      });
      onClose();
    }
  };

  const handleShare = () => {
    if (initialNote?.id) {
      const url = `${window.location.origin}/notes/${initialNote.id}`;
      navigator.clipboard.writeText(url);
      alert(`Link copied to clipboard: ${url}`);
    } else {
      alert("Please save the note before sharing.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-4xl h-[80vh] bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note Title"
            className="bg-transparent text-2xl font-bold text-white placeholder:text-white/20 focus:outline-none w-full disabled:opacity-70 disabled:cursor-default"
            autoFocus={!readOnly}
            disabled={readOnly}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleShare}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              title="Share note"
            >
              <Share2 size={20} />
            </button>
            {!readOnly && (
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-colors"
              >
                {initialNote ? "Update" : "Save"}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 p-6 overflow-hidden">
          <NoteEditor
            content={content}
            onChange={setContent}
            editable={!readOnly}
          />
        </div>
      </motion.div>
    </div>
  );
};
