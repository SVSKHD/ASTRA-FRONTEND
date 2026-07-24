import React, { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, Search, FileText, Clock, FilePlus2, Plus } from "lucide-react";
import { Note } from "../services/notesService";

interface AttachNotesProps {
  notes: Note[];
  attachedIds: string[];
  onAttach: (noteId: string) => void;
  onDetach: (noteId: string) => void;
  onOpenNote: (note: Note) => void;
  onCreateNote?: () => void;
}

// Searchable picker + attached-note cards. One note may be attached to many
// items; only note IDs are stored (no content duplication). Reused by Ideas
// and Stocks detail dialogs.
export const AttachNotes: React.FC<AttachNotesProps> = ({
  notes,
  attachedIds,
  onAttach,
  onDetach,
  onOpenNote,
  onCreateNote,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const attachedNotes = useMemo(
    () => notes.filter((n) => attachedIds.includes(n.id)),
    [notes, attachedIds],
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = notes.filter((n) => !attachedIds.includes(n.id));
    if (!q) return pool.slice(0, 30);
    return pool
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (n.content || "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [notes, attachedIds, search]);

  const stripHtml = (html: string) =>
    (html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="text-white/60 font-semibold text-sm uppercase tracking-wider">
          Attached Notes
          <span className="ml-2 bg-white/10 px-1.5 py-0.5 rounded-md text-[10px]">
            {attachedIds.length}
          </span>
        </h3>
        <div className="flex gap-2">
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium"
            >
              <Link size={14} /> Attach note
            </button>
            <AnimatePresence>
              {pickerOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="absolute right-0 top-full mt-3 w-80 bg-black/95 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-3xl z-[130]"
                >
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 mb-2">
                    <Search size={14} className="text-white/40" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search all notes…"
                      autoFocus
                      className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-white/25"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    {searchResults.length === 0 ? (
                      <div className="p-4 text-white/30 text-xs text-center">
                        {notes.length === 0
                          ? "No notes yet."
                          : "No matching notes."}
                      </div>
                    ) : (
                      searchResults.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            onAttach(n.id);
                            setPickerOpen(false);
                            setSearch("");
                          }}
                          className="w-full text-left p-3 rounded-xl hover:bg-white/10 transition-colors group"
                        >
                          <div className="text-sm font-medium text-white/80 group-hover:text-blue-300 truncate">
                            {n.title || "Untitled"}
                          </div>
                          <div className="text-xs text-white/30 truncate mt-0.5">
                            {stripHtml(n.content).slice(0, 60) || "Empty note"}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {onCreateNote && (
            <button
              onClick={onCreateNote}
              className="flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl bg-blue-500 text-white border border-blue-400/50 hover:bg-blue-400 transition-colors text-sm font-medium shadow-[0_0_15px_rgba(59,130,246,0.4)]"
            >
              <Plus size={16} /> New note
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {attachedNotes.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-3xl bg-[#0a0a0a]/30">
            <FilePlus2 size={36} className="text-white/10 mb-3" />
            <p className="text-white/40 text-sm font-medium">
              No notes attached yet.
            </p>
            <p className="text-white/20 text-xs mt-1">
              Attach an existing note to keep knowledge linked.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {attachedNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => onOpenNote(note)}
                className="p-4 rounded-2xl bg-[#0a0a0a]/50 border border-white/10 backdrop-blur-xl hover:bg-white/5 hover:border-white/20 transition-all cursor-pointer group flex flex-col relative overflow-hidden"
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <h4 className="font-semibold text-white/90 group-hover:text-blue-300 transition-colors line-clamp-1 flex items-center gap-2">
                    <FileText size={14} className="text-white/30 shrink-0" />
                    {note.title || "Untitled"}
                  </h4>
                  <button
                    title="Detach note"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDetach(note.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 -mr-2 -mt-2 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
                  >
                    <Link size={14} className="line-through" />
                  </button>
                </div>
                <p className="text-xs text-white/50 line-clamp-2 leading-relaxed">
                  {stripHtml(note.content).slice(0, 120) || "Empty note"}
                </p>
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-white/30">
                  <Clock size={11} />
                  {new Date(note.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
