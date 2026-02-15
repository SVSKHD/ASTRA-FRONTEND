import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  DollarSign,
  User as UserIcon,
  Loader2,
  Calendar,
  X,
  IndianRupee,
} from "lucide-react";
import { auth } from "@/utils/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  addJournalEntry,
  fetchJournalEntries,
  deleteJournalEntry,
  JournalEntry,
} from "@/services/journalService";
import { Portal } from "../ui/Portal";

/* 
const DialogPortal = ({ children }: { children: React.ReactNode }) => {
// ...
}; 
*/
// It's better to remove the internal definition entirely.

export const JournalView = () => {
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hasExpense, setHasExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState<string>("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadEntries(currentUser.uid);
      } else {
        setEntries([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadEntries = async (userId: string) => {
    setLoading(true);
    try {
      const data = await fetchJournalEntries(userId);
      setEntries(data);
    } catch (error) {
      console.error("Failed to load journal entries", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const newEntry = await addJournalEntry({
        userId: user.uid,
        title,
        description,
        hasExpense,
        expenseAmount: hasExpense ? parseFloat(expenseAmount) || 0 : undefined,
        userAvatar: user.photoURL || undefined,
      });

      setEntries((prev) => [newEntry, ...prev]);

      // Reset form
      handleCloseDialog();
    } catch (error) {
      console.error("Failed to add entry", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setTitle("");
    setDescription("");
    setHasExpense(false);
    setExpenseAmount("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    try {
      await deleteJournalEntry(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    } catch (error) {
      console.error("Failed to delete entry", error);
    }
  };

  // Group entries by date
  const groupedEntries = entries.reduce(
    (groups, entry) => {
      const date = entry.createdAt?.seconds
        ? new Date(entry.createdAt.seconds * 1000).toLocaleDateString(
            undefined,
            {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            },
          )
        : "Just now";
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(entry);
      return groups;
    },
    {} as Record<string, JournalEntry[]>,
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[400px]">
        <Loader2 className="animate-spin text-white/50" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 relative min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 sticky top-0 z-20 bg-transparent backdrop-blur-xl py-4 border-b border-white/5">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Journal
          </h1>
          <p className="text-white/50 text-sm">
            Capture your thoughts & expenses
          </p>
        </div>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="bg-white text-black px-4 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-white/90 transition-all shadow-lg shadow-white/10"
        >
          <Plus size={20} />
          New Entry
        </button>
      </div>

      {/* Timeline View */}
      <div className="relative pl-8 border-l border-white/10 space-y-12">
        {entries.length === 0 ? (
          <div className="text-center py-12 text-white/30 ml-[-2rem]">
            <Calendar className="mx-auto mb-4 opacity-50" size={48} />
            <p>No journal entries yet. Start writing today!</p>
          </div>
        ) : (
          Object.entries(groupedEntries).map(([date, groupEntries]) => (
            <div key={date} className="relative">
              {/* Date Header */}
              <div className="absolute -left-[41px] flex items-center gap-4 mb-6">
                <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-4 border-blue-500 box-content z-10" />
                <h2 className="text-lg font-bold text-blue-400 bg-black/40 px-2 py-1 rounded-lg backdrop-blur-md border border-white/5">
                  {date}
                </h2>
              </div>

              {/* Entries for this date */}
              <div className="space-y-6 pt-2">
                {groupEntries.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white/5 border border-white/5 rounded-3xl p-6 hover:bg-white/10 transition-all group relative ml-4"
                  >
                    {/* Timeline connector dot for individual entry */}
                    <div className="absolute -left-[30px] top-8 w-3 h-3 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />

                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="flex-shrink-0">
                          {entry.userAvatar ? (
                            <img
                              src={entry.userAvatar}
                              alt="Avatar"
                              className="w-10 h-10 rounded-full object-cover border border-white/10 shadow-lg"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/50 border border-white/5">
                              <UserIcon size={20} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                              {entry.createdAt?.seconds
                                ? new Date(
                                    entry.createdAt.seconds * 1000,
                                  ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Just now"}
                            </span>
                            <h3 className="text-xl font-bold text-white break-words">
                              {entry.title}
                            </h3>
                          </div>

                          <p className="text-white/70 whitespace-pre-wrap leading-relaxed break-words font-light">
                            {entry.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3">
                        {entry.hasExpense && (
                          <div className="flex items-center gap-1 text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20">
                            <IndianRupee size={14} />
                            <span className="font-bold text-lg">
                              {entry.expenseAmount?.toLocaleString("en-IN") ||
                                "0"}
                            </span>
                          </div>
                        )}

                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          title="Delete entry"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Entry Dialog */}
      <AnimatePresence>
        {isDialogOpen && (
          <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Plus size={20} className="text-blue-400" />
                    New Journal Entry
                  </h3>
                  <button
                    onClick={handleCloseDialog}
                    className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                  <form
                    id="journal-form"
                    onSubmit={handleSubmit}
                    className="space-y-6"
                  >
                    <div>
                      <label className="block text-sm font-medium text-white/50 mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        placeholder="Entry Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 text-lg transition-all"
                        required
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white/50 mb-1">
                        Description
                      </label>
                      <textarea
                        placeholder="Write your thoughts..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 min-h-[200px] resize-none transition-all custom-scrollbar leading-relaxed"
                        required
                      />
                    </div>

                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                      <label className="flex items-center justify-between cursor-pointer group mb-4">
                        <span className="text-white font-medium flex items-center gap-2">
                          <span
                            className={`p-2 rounded-lg ${hasExpense ? "bg-green-500/20 text-green-400" : "bg-white/5 text-white/40"}`}
                          >
                            <IndianRupee size={18} />
                          </span>
                          Add Expense
                        </span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={hasExpense}
                            onChange={(e) => setHasExpense(e.target.checked)}
                            className="sr-only"
                          />
                          <div
                            className={`w-12 h-6 rounded-full transition-colors duration-300 ${hasExpense ? "bg-green-500" : "bg-white/20"}`}
                          >
                            <div
                              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${hasExpense ? "translate-x-6" : "translate-x-0"}`}
                            />
                          </div>
                        </div>
                      </label>

                      <AnimatePresence>
                        {hasExpense && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="relative">
                              <IndianRupee
                                size={20}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-green-400"
                              />
                              <input
                                type="number"
                                placeholder="0.00"
                                value={expenseAmount}
                                onChange={(e) =>
                                  setExpenseAmount(e.target.value)
                                }
                                className="w-full bg-black/20 border border-green-500/30 rounded-xl pl-12 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-green-500/50 transition-all text-xl font-mono"
                                min="0"
                                step="0.01"
                                required={hasExpense}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </form>
                </div>

                <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end gap-3">
                  <button
                    onClick={handleCloseDialog}
                    className="px-6 py-3 rounded-xl hover:bg-white/10 text-white font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="journal-form"
                    disabled={submitting}
                    className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-white/10 flex items-center gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <span>Post Entry</span>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>
    </div>
  );
};
