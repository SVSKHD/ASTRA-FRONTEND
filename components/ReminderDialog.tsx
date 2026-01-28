import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, Clock, RotateCw, Tag } from "lucide-react";
import { RecurrenceType } from "@/utils/reminders-service";

interface ReminderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    dateTime: Date;
    recurrence: RecurrenceType;
    customInterval?: number;
  }) => void;
  initialData?: {
    title: string;
    description: string;
    dateTime: Date;
    recurrence: RecurrenceType;
    customInterval?: number;
  } | null;
}

const RECURRENCE_OPTIONS: RecurrenceType[] = [
  "None",
  "Daily",
  "Weekly",
  "Monthly",
  "Yearly",
  "Custom",
];

export const ReminderDialog = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}: ReminderDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("None");
  const [customInterval, setCustomInterval] = useState<number>(1);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setDescription(initialData.description);
        const d = initialData.dateTime;
        setDate(d.toISOString().split("T")[0]);
        setTime(d.toTimeString().slice(0, 5));
        setRecurrence(initialData.recurrence);
        setCustomInterval(initialData.customInterval || 1);
      } else {
        setTitle("");
        setDescription("");
        const now = new Date();
        setDate(now.toISOString().split("T")[0]);
        // Set time to next hour
        now.setHours(now.getHours() + 1, 0, 0, 0);
        setTime(now.toTimeString().slice(0, 5));
        setRecurrence("None");
        setCustomInterval(1);
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !time) return;

    const dateTime = new Date(`${date}T${time}`);
    onSave({
      title,
      description,
      dateTime,
      recurrence,
      customInterval: recurrence === "Custom" ? customInterval : undefined,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl p-6 shadow-2xl z-[101]"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {initialData ? "Edit Reminder" : "New Reminder"}
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider pl-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider pl-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add details..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider pl-1 flex items-center gap-2">
                    <Calendar size={12} /> Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wider pl-1 flex items-center gap-2">
                    <Clock size={12} /> Time
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors [color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider pl-1 flex items-center gap-2">
                  <RotateCw size={12} /> Repeat
                </label>
                <div className="flex flex-wrap gap-2">
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRecurrence(opt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        recurrence === opt
                          ? "bg-blue-500/20 border-blue-500 text-blue-300"
                          : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {recurrence === "Custom" && (
                  <div className="flex items-center gap-2 mt-3 animate-in fade-in slide-in-from-top-1">
                    <span className="text-xs text-white/50">Every</span>
                    <input
                      type="number"
                      min="1"
                      value={customInterval}
                      onChange={(e) =>
                        setCustomInterval(parseInt(e.target.value) || 1)
                      }
                      className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-center text-white focus:outline-none focus:border-white/30 text-sm"
                    />
                    <span className="text-xs text-white/50">days</span>
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-white/5 text-white/70 font-semibold hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title || !date || !time}
                  className="flex-1 py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {initialData ? "Save Changes" : "Add Reminder"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
