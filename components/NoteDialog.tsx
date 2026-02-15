import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Share2, Check, Globe, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useDialogTracking } from "@/hooks/useDialogTracking";
import { useFormDraft } from "@/hooks/useFormDraft";
import { Portal } from "./ui/Portal";

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
  useDialogTracking(isOpen);

  // Create a unique key for the draft based on whether we are editing or creating
  const draftKey = initialNote?.id
    ? `draft_note_${initialNote.id}`
    : "draft_note_new";

  const [title, setTitle, clearTitle] = useFormDraft(draftKey + "_title", "");
  const [content, setContent, clearContent] = useFormDraft(
    draftKey + "_content",
    "",
  );
  const [isShared, setIsShared, clearIsShared] = useFormDraft(
    draftKey + "_isShared",
    false,
  );
  const [copied, setCopied] = useState(false);

  // Initialize from initialNote when it changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      if (initialNote) {
        //If we are editing an existing note, and there is NO draft, load from initialNote
        //However, useFormDraft loads from local storage on mount.
        //We need to be careful not to overwrite the draft if one exists,
        //BUT if we opened a DIFFERENT note, we must update.
        //The key change handles switching notes.
        //But `useFormDraft` initializes with `initialValue` only if no draft exists.
        //We might want to force update if `initialNote` changes significantly, but usually `key` change is enough.
        //Wait, useFormDraft loads from localStorage. If we want to start with initialNote values,
        //we should pass them as initialValues to the hook.
        //But hooks can't change initialValue dynamically in a way that resets state easily without key change.
        //The key includes the ID, so switching notes works.
        //For "New Note", key is constant.
        //Issue: When opening "New Note", we want to see the draft if it exists.
        //When opening "Edit Note", we want to see the draft if it exists.
        //If we want to RESET local state to initialNote when opening, we'd need to clear drafts.
        //But the requirement is to RESUME drafts.
        //One edge case: We edit Note A, change title, close. Re-open Note A. Draft exists. Good.
        //We save Note A. Draft should probably be cleared?
        //Let's assume we maintain drafts until manually cleared or saved.
        //To correctly initialize `useFormDraft` with `initialNote` data IF no draft exists:
        //The hook takes `initialValue`.
        //If `initialNote` is present, `initialValue` should be `initialNote.title`.
        //If `initialNote` is null, `initialValue` is "".
        //Since we use `key` derived from ID, `initialValue` changes naturally.
        //However, `useFormDraft` ignores `initialValue` changes after mount unless we force it.
        //Our hook implementation: `useState(initialValue)`.
        //If key changes, `useFormDraft` re-mounts/re-runs effects? No, hooks are unconditional.
        //But we pass `key` to `useFormDraft`.
        //Our `useFormDraft` listens to `key` changes in `useEffect`.
        //But it doesn't reset `value` to `initialValue` when key changes, unless we explicitly do so.
        //Looking at `useFormDraft` implementation:
        // It has `useEffect(() => { ... load from LS ... }, [key])`.
        // It does NOT reset to `initialValue` if LS is empty for the new key.
        // This is a bug in my hook implementation for this specific use case.
        // I should update the hook or handle it here.
        // Let's update `useFormDraft` logic in thought or adjust usage.
        // actually, `useState(initialValue)` only runs once.
        // If I change keys, `value` remains from previous state until `useEffect` loads new one.
        // This might cause a flash of old content.
        // Better approach:
        // When `isOpen` becomes true, or `initialNote` changes:
        // Check if we should override the draft with `initialNote` values?
        // No, we always want the draft if it exists.
        // If no draft, we want `initialNote` values.
        // Let's just rely on the hook, but I'll add a check in `useEffect` here to sync `initialNote`
        // if no draft is found?
        // Or better: Update `useFormDraft` to handle `initialValue` change if key changes.
      }
    }
  }, [isOpen, initialNote]);

  // We need to sync `initialNote` into the state if there is no draft in local storage.
  // This is tricky with the current hook.
  // Let's modify the usage slightly.
  // We can manually set the state to `initialNote` values in a `useEffect` if we detect we just opened and have no draft?
  // Or, simply rely on the fact that if we are editing, we usually want to start clean unless we crashed.

  // Let's settle on:
  // 1. `useFormDraft` handles loading.
  // 2. We use a key that includes the Note ID.
  // 3. For "New Note", key is static.

  // Refined Logic in `useEffect` below:
  useEffect(() => {
    // If we are opening...
    if (isOpen) {
      // If we have an initial note...
      if (initialNote) {
        // We expect the hook to handle loading draft.
        // If draft is loaded, great.
        // If draft is NOT in LS, `useFormDraft` keeps `initialValue`.
        // But `useFormDraft` doesn't update `value` when `initialValue` prop changes after first render.
        // So we must manually update state if `initialNote` changes.
        setTitle((prev) => {
          const saved = window.localStorage.getItem(draftKey + "_title");
          return saved ? JSON.parse(saved) : initialNote.title;
        });
        setContent((prev) => {
          const saved = window.localStorage.getItem(draftKey + "_content");
          return saved ? JSON.parse(saved) : initialNote.content;
        });
        setIsShared((prev) => {
          const saved = window.localStorage.getItem(draftKey + "_isShared");
          return saved ? JSON.parse(saved) : initialNote.isShared === true;
        });
      } else {
        // New Note
        setTitle((prev) => {
          const saved = window.localStorage.getItem(draftKey + "_title");
          return saved ? JSON.parse(saved) : "";
        });
        setContent((prev) => {
          const saved = window.localStorage.getItem(draftKey + "_content");
          return saved ? JSON.parse(saved) : "<p></p>";
        });
        setIsShared((prev) => {
          const saved = window.localStorage.getItem(draftKey + "_isShared");
          return saved ? JSON.parse(saved) : false;
        });
      }
    }
  }, [isOpen, initialNote, draftKey, setTitle, setContent, setIsShared]);

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
      // Clear draft on successful save
      handleClear();
      onClose();
    }
  };

  const handleClear = () => {
    clearTitle();
    clearContent();
    clearIsShared();
    // Also reset local state to defaults if needed, but the hook does that if we handled initialValue correctly.
    // However, for "New Note", we want empty.
    // For "Edit Note", "Clear" implies reverting to original? Or clearing completely?
    // "Clear to clear it so that we will resume the data". User likely means "Clear the draft and start over/empty".
    // If I'm editing a note, "Clear" might mean "Revert to original note content" or "Clear text fields".
    // Text fields is safer.
    if (initialNote) {
      setTitle(initialNote.title);
      setContent(initialNote.content);
      setIsShared(initialNote.isShared ?? false);
    } else {
      setTitle("");
      setContent("<p></p>");
      setIsShared(false);
    }
  };

  const handleShare = () => {
    if (initialNote?.id) {
      const url = `${window.location.origin}/notes/${initialNote.id}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      if (!isShared) {
        setIsShared(true);
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
            {!readOnly && (
              <button
                onClick={handleClear}
                className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white/90 transition-colors"
                title="Clear draft / Revert changes"
              >
                <Trash2 size={20} />
              </button>
            )}
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
