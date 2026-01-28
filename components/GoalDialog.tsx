import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, Flag, AlignLeft } from "lucide-react";
import { Goal, GoalPriority, addGoal, updateGoal } from "@/utils/goals-service";
import { useUser } from "@/context/UserContext";
import { DatePicker } from "@/components/ui/DatePicker";

interface GoalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  goal?: Goal | null; // If present, we are editing
}

export const GoalDialog = ({ isOpen, onClose, goal }: GoalDialogProps) => {
  const { user } = useUser();
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<GoalPriority>("medium");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (goal) {
        setTitle(goal.title);
        setDeadline(goal.deadline);
        setPriority(goal.priority);
        setNotes(goal.notes);
      } else {
        // Reset for new goal
        setTitle("");
        setDeadline("");
        setPriority("medium");
        setNotes("");
      }
    }
  }, [isOpen, goal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title || !deadline) return;

    setLoading(true);
    try {
      if (goal) {
        await updateGoal(goal.id, {
          title,
          deadline,
          priority,
          notes,
        });
      } else {
        await addGoal({
          title,
          deadline,
          priority,
          notes,
          status: "active",
          userId: user.id,
        });
      }
      onClose();
    } catch (error) {
      console.error("Failed to save goal", error);
    } finally {
      setLoading(false);
    }
  };

  return (
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
            className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden ring-1 ring-white/10"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold text-white mb-6">
              {goal ? "Edit Goal" : "New Goal"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Goal Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all font-medium"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-white/50 font-medium ml-1 flex items-center gap-1">
                    <Calendar size={12} /> Deadline
                  </label>
                  <DatePicker
                    value={deadline}
                    onChange={setDeadline}
                    placeholder="Select deadline"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-white/50 font-medium ml-1 flex items-center gap-1">
                    <Flag size={12} /> Priority
                  </label>
                  <div className="relative">
                    <select
                      value={priority}
                      onChange={(e) =>
                        setPriority(e.target.value as GoalPriority)
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all appearance-none text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-white/50 font-medium ml-1 flex items-center gap-1">
                  <AlignLeft size={12} /> Notes
                </label>
                <textarea
                  placeholder="Add details, milestones, or reminders..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all min-h-[100px] resize-none text-sm"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {loading
                    ? "Saving..."
                    : goal
                      ? "Save Changes"
                      : "Create Goal"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
