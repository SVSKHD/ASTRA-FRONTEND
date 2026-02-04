import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Share2, Check, Globe } from "lucide-react";
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
  isShared?: boolean;
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
  const [isShared, setIsShared] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialNote) {
        setTitle(initialNote.title);
        setContent(initialNote.content);
        // Ensure isShared is boolean, defaulting to false
        setIsShared(initialNote.isShared === true);
      } else {
        setTitle("");
        setContent("<p></p>");
        setIsShared(false);
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
        isShared,
      });
      onClose();
    }
  };

  const handleShare = () => {
    if (initialNote?.id) {
      const url = `${window.location.origin}/notes/${initialNote.id}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Auto-enable sharing if not already enabled (optional UX choice, but requested "how to share")
      if (!isShared) {
        setIsShared(true);
        // We might want to save immediately here, but `onSave` closes the dialog.
        // For now, visual feedback relies on user clicking Save.
        // OR, if we want immediate effect, we'd need a separate prop or async call.
        // Let's stick to state change + user explicitly saving or we auto-save?
        // The robust way: User clicks Share -> Link Copied -> They must click Update to persist 'isShared=true'.
        // I will add a visual indicator that it's shared.
      }
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
          <div className="flex-1 flex items-center gap-3 mr-4 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note Title"
              className="bg-transparent text-2xl font-bold text-white placeholder:text-white/20 focus:outline-none w-full disabled:opacity-70 disabled:cursor-default"
              autoFocus={!readOnly}
              disabled={readOnly}
            />
            {isShared && (
              <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider border border-blue-500/20">
                Global
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsShared(!isShared)}
              className={`p-2 rounded-xl transition-colors ${
                isShared
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-white/5 hover:bg-white/10 text-white/30 hover:text-white/70"
              }`}
              title={isShared ? "Publicly accessible via link" : "Private note"}
            >
              <Globe size={20} />
            </button>
            <button
              onClick={handleShare}
              disabled={!initialNote?.id}
              className={`p-2 rounded-xl transition-colors ${
                copied
                  ? "bg-green-500/20 text-green-500"
                  : "bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
              } disabled:opacity-30 disabled:cursor-not-allowed`}
              title={initialNote?.id ? "Share note" : "Save to share"}
            >
              {copied ? <Check size={20} /> : <Share2 size={20} />}
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
