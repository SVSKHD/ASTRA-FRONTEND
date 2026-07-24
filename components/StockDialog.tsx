import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share2, TrendingUp, Target, Eye, FileText } from "lucide-react";
import { Stock } from "../services/stocksService";
import { Note } from "../services/notesService";
import { useNotes } from "../hooks/useNotes";
import { useDialogTracking } from "@/hooks/useDialogTracking";
import { NoteDialog, Note as DialogNote } from "./NoteDialog";
import { ShareDialog } from "./ShareDialog";
import { AttachNotes } from "./AttachNotes";
import { TagInput } from "./ui/TagInput";
import { fullTimestamp } from "../utils/time";

const mapToDialogNote = (note: Note): DialogNote => ({
  id: note.id,
  title: note.title,
  content: note.content,
  isShared: note.isShared,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

interface StockDialogProps {
  stock: Stock;
  isOpen: boolean;
  onClose: () => void;
  updateStock: (id: string, updates: Partial<Stock>) => Promise<boolean>;
  allTags: string[];
}

type DetailTab = "details" | "notes";

export const StockDialog: React.FC<StockDialogProps> = ({
  stock,
  isOpen,
  onClose,
  updateStock,
  allTags,
}) => {
  useDialogTracking(isOpen);
  const { notes, createNote, updateNote } = useNotes();
  const [activeTab, setActiveTab] = useState<DetailTab>("details");

  const [name, setName] = useState(stock.name);
  const [symbol, setSymbol] = useState(stock.symbol);
  const [reason, setReason] = useState(stock.reason);
  const [target, setTarget] = useState(
    stock.targetPrice != null ? String(stock.targetPrice) : "",
  );
  const [watch, setWatch] = useState(
    stock.watchPrice != null ? String(stock.watchPrice) : "",
  );

  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<DialogNote | null>(null);
  const [shareDialog, setShareDialog] = useState(false);

  const stockNoteIds = stock.noteIds || [];

  useEffect(() => {
    setName(stock.name);
    setSymbol(stock.symbol);
    setReason(stock.reason);
    setTarget(stock.targetPrice != null ? String(stock.targetPrice) : "");
    setWatch(stock.watchPrice != null ? String(stock.watchPrice) : "");
  }, [stock.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const commit = (updates: Partial<Stock>) => updateStock(stock.id, updates);

  const parsePrice = (v: string): number | null => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const handleCreateOrUpdateNote = async (noteData: Partial<DialogNote>) => {
    if (noteData.id) {
      await updateNote(noteData.id, {
        title: noteData.title,
        content: noteData.content,
        isShared: noteData.isShared,
      });
    } else if (noteData.title && noteData.content) {
      const newId = await createNote({
        title: noteData.title,
        content: noteData.content,
        isShared: noteData.isShared,
      });
      if (newId) {
        await updateStock(stock.id, {
          noteIds: [...stockNoteIds, newId as string],
        });
      }
    }
    setIsNoteDialogOpen(false);
    setEditingNote(null);
  };

  const handleShare = async () => {
    if (!stock.isShared) {
      await updateStock(stock.id, { isShared: true });
      await Promise.all(
        stockNoteIds.map((id) => updateNote(id, { isShared: true })),
      );
    }
    setShareDialog(true);
  };

  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: "details", label: "Details" },
    { id: "notes", label: "Notes", count: stockNoteIds.length },
  ];

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl h-[85vh] bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-300 shrink-0">
                    <TrendingUp size={20} />
                  </div>
                  <div className="min-w-0">
                    <input
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      onBlur={() =>
                        symbol.trim() !== stock.symbol &&
                        commit({ symbol: symbol.trim().toUpperCase() })
                      }
                      placeholder="SYMBOL"
                      className="bg-transparent text-xl font-bold text-white focus:outline-none w-full placeholder:text-white/20 uppercase"
                    />
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() =>
                        name !== stock.name && commit({ name: name.trim() })
                      }
                      placeholder="Company name"
                      className="bg-transparent text-sm text-white/50 focus:outline-none w-full placeholder:text-white/20"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-sm font-medium"
                  >
                    <Share2 size={16} />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-2 px-6 pt-4 shrink-0">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-semibold ${
                      activeTab === t.id
                        ? "bg-white/15 text-white ring-1 ring-white/20"
                        : "text-white/40 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {t.label}
                    {t.count !== undefined && (
                      <span className="bg-white/10 px-1.5 py-0.5 rounded-md text-[10px]">
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {activeTab === "details" ? (
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                        Why I'm tracking this
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        onBlur={() =>
                          reason !== stock.reason && commit({ reason })
                        }
                        placeholder="Thesis, catalysts, what to watch for…"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none h-28 placeholder:text-white/25 leading-relaxed"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center gap-1.5 text-xs text-white/40 font-semibold uppercase tracking-wider mb-2">
                          <Target size={12} /> Target price
                        </label>
                        <input
                          type="number"
                          value={target}
                          onChange={(e) => setTarget(e.target.value)}
                          onBlur={() =>
                            commit({ targetPrice: parsePrice(target) })
                          }
                          placeholder="0.00"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-white/25"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-xs text-white/40 font-semibold uppercase tracking-wider mb-2">
                          <Eye size={12} /> Watch price
                        </label>
                        <input
                          type="number"
                          value={watch}
                          onChange={(e) => setWatch(e.target.value)}
                          onBlur={() =>
                            commit({ watchPrice: parsePrice(watch) })
                          }
                          placeholder="0.00"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-white/25"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                        Tags
                      </label>
                      <TagInput
                        value={stock.tags || []}
                        onChange={(tags) => commit({ tags })}
                        suggestions={allTags}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-white/40">
                      <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5">
                        <span className="text-white/30 block mb-0.5">
                          Created
                        </span>
                        {fullTimestamp(stock.createdAt)}
                      </div>
                      <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5">
                        <span className="text-white/30 block mb-0.5">
                          Updated
                        </span>
                        {fullTimestamp(stock.updatedAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <AttachNotes
                    notes={notes}
                    attachedIds={stockNoteIds}
                    onAttach={(id) =>
                      commit({ noteIds: [...stockNoteIds, id] })
                    }
                    onDetach={(id) =>
                      commit({ noteIds: stockNoteIds.filter((n) => n !== id) })
                    }
                    onOpenNote={(note) => {
                      setEditingNote(mapToDialogNote(note));
                      setIsNoteDialogOpen(true);
                    }}
                    onCreateNote={() => {
                      setEditingNote(null);
                      setIsNoteDialogOpen(true);
                    }}
                  />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNoteDialogOpen && (
          <NoteDialog
            isOpen={isNoteDialogOpen}
            onClose={() => {
              setIsNoteDialogOpen(false);
              setEditingNote(null);
            }}
            onSave={handleCreateOrUpdateNote}
            initialNote={editingNote}
          />
        )}
      </AnimatePresence>

      <ShareDialog
        isOpen={shareDialog}
        onClose={() => setShareDialog(false)}
        title={`Share "${stock.symbol}"`}
        content={
          typeof window !== "undefined"
            ? `${window.location.origin}/stocks/${stock.id}`
            : ""
        }
      />
    </>
  );
};
