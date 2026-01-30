import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  Calendar,
  Flag,
  AlignLeft,
  Trash2,
  Clock,
  Timer,
} from "lucide-react";
import { Task, Priority } from "../utils/kanban-service";
import { DatePicker } from "./ui/DatePicker";

interface TaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string | undefined, updates: Partial<Task>) => void;
  onDelete?: (taskId: string) => void;
  initialTask?: Task | null;
}

export const TaskDialog = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialTask,
}: TaskDialogProps) => {
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [deadline, setDeadline] = useState("");
  const [estimatedTime, setEstimatedTime] = useState("");
  const [timeSpent, setTimeSpent] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        setContent(initialTask.content);
        setDescription(initialTask.description || "");
        setPriority(initialTask.priority || "Medium");
        setEstimatedTime(initialTask.estimatedTime?.toString() || "");
        setTimeSpent(initialTask.timeSpent?.toString() || "");

        if (initialTask.deadline) {
          // Check if it's a Firestore timestamp (has toDate) or string/date
          const d = initialTask.deadline.toDate
            ? initialTask.deadline.toDate()
            : new Date(initialTask.deadline);
          // Format to YYYY-MM-DD for date input
          const iso = d.toISOString().split("T")[0];
          setDeadline(iso);
        } else {
          setDeadline("");
        }
      } else {
        // Create Mode - Reset
        setContent("");
        setDescription("");
        setPriority("Medium");
        setDeadline("");
        setEstimatedTime("");
        setTimeSpent("");
      }
    }
  }, [isOpen, initialTask]);

  // Body scroll lock
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
    if (content.trim()) {
      const updates: Partial<Task> = {
        content,
        description,
        priority,
        deadline: deadline ? new Date(deadline) : null,
        estimatedTime: estimatedTime ? parseFloat(estimatedTime) : undefined,
        timeSpent: timeSpent ? parseFloat(timeSpent) : undefined,
      };
      onSave(initialTask?.id, updates);
      onClose();
    }
  };

  const handleDelete = () => {
    if (initialTask && onDelete) {
      if (confirm("Are you sure you want to delete this task?")) {
        onDelete(initialTask.id);
        onClose();
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
        className="relative w-full max-w-2xl bg-[#111] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-2 text-white/50 text-sm font-medium uppercase tracking-wider">
            {initialTask ? (
              <>
                <span
                  className={`w-2 h-2 rounded-full ${priority === "High" ? "bg-red-400" : priority === "Medium" ? "bg-yellow-400" : "bg-blue-400"}`}
                />
                {priority} Priority
              </>
            ) : (
              <>Wait to create...</>
            )}
          </div>
          <div className="flex items-center gap-2">
            {initialTask && onDelete && (
              <button
                onClick={handleDelete}
                className="p-2 rounded-full hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                title="Delete Task"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {/* Title Input */}
          <div className="space-y-2">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-transparent text-2xl font-bold text-white placeholder:text-white/20 focus:outline-none"
              placeholder="Task Title"
              autoFocus
            />
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Priority */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                  <Flag size={12} /> Priority
                </label>
                <div className="flex gap-2">
                  {(["Low", "Medium", "High"] as Priority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        priority === p
                          ? "bg-white/10 border-white/20 text-white"
                          : "bg-transparent border-transparent text-white/30 hover:bg-white/5"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deadline */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                  <Calendar size={12} /> Deadline
                </label>
                <DatePicker
                  value={deadline}
                  onChange={setDeadline}
                  placeholder="Select deadline"
                />
              </div>
            </div>

            {/* Right Column - Time Logging */}
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                <Clock size={12} /> Time Tracking (Hrs)
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-white/30 uppercase">
                    Estimated
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={estimatedTime}
                      onChange={(e) => setEstimatedTime(e.target.value)}
                      placeholder="0"
                      className="w-full bg-white/5 border border-white/5 rounded-lg pl-3 pr-2 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/20"
                    />
                    <Timer
                      size={14}
                      className="absolute right-2 top-2 text-white/20"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-white/30 uppercase">
                    Spent
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={timeSpent}
                      onChange={(e) => setTimeSpent(e.target.value)}
                      placeholder="0"
                      className="w-full bg-white/5 border border-white/5 rounded-lg pl-3 pr-2 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/20"
                    />
                    <Clock
                      size={14}
                      className="absolute right-2 top-2 text-white/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-3 pt-4 border-t border-white/5">
            <label className="flex items-center gap-2 text-sm font-medium text-white/60">
              <AlignLeft size={16} /> Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details about this task..."
              className="w-full h-32 bg-white/5 border border-white/5 rounded-xl p-4 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:bg-white/10 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-xl text-sm font-semibold bg-white text-black hover:bg-white/90 transition-colors"
          >
            {initialTask ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
