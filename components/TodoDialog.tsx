import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Circle,
  Trash2,
  AlertTriangle,
  CalendarDays,
} from "lucide-react";
import { Todo } from "../services/todosService";
import { useDialogTracking } from "@/hooks/useDialogTracking";
import { DatePicker } from "./ui/DatePicker";
import {
  toDateInputValue,
  toDate,
  fullTimestamp,
  dueLabel,
  isOverdue,
} from "../utils/time";

interface TodoDialogProps {
  todo: Todo;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Todo>) => void;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export const TodoDialog: React.FC<TodoDialogProps> = ({
  todo,
  isOpen,
  onClose,
  onUpdate,
  onToggle,
  onDelete,
}) => {
  useDialogTracking(isOpen);
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes || "");

  useEffect(() => {
    setTitle(todo.title);
    setNotes(todo.notes || "");
  }, [todo.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const dateStr = toDateInputValue(todo.dueDate);
  const timeStr = (() => {
    const d = toDate(todo.dueDate);
    if (!d) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  })();

  const applyDateTime = (newDate: string, newTime: string) => {
    if (!newDate) {
      onUpdate(todo.id, { dueDate: null });
      return;
    }
    const [y, m, d] = newDate.split("-").map(Number);
    let hours = 9;
    let minutes = 0;
    if (newTime) {
      const [hh, mm] = newTime.split(":").map(Number);
      hours = hh;
      minutes = mm;
    }
    const ms = new Date(y, m - 1, d, hours, minutes).getTime();
    onUpdate(todo.id, { dueDate: ms });
  };

  const overdue = isOverdue(todo.dueDate, todo.completed);

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
            className="relative w-full max-w-lg bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10"
          >
            <div className="flex items-start justify-between gap-3 p-6 border-b border-white/5">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button
                  onClick={() => onToggle(todo.id, !todo.completed)}
                  className={`mt-1 flex items-center justify-center w-8 h-8 shrink-0 rounded-full border transition-colors ${
                    todo.completed
                      ? "bg-emerald-500 border-emerald-500 text-black"
                      : "border-white/20 text-transparent hover:border-emerald-400"
                  }`}
                >
                  {todo.completed ? <Check size={16} /> : <Circle size={4} />}
                </button>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() =>
                    title.trim() !== todo.title &&
                    onUpdate(todo.id, { title: title.trim() })
                  }
                  placeholder="Todo title"
                  className={`bg-transparent text-xl font-bold focus:outline-none w-full placeholder:text-white/20 ${
                    todo.completed ? "text-white/40 line-through" : "text-white"
                  }`}
                />
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {todo.dueDate && (
                <div
                  className={`flex items-center gap-2 text-sm font-medium ${
                    overdue ? "text-red-300" : "text-white/70"
                  }`}
                >
                  {overdue ? (
                    <AlertTriangle size={15} />
                  ) : (
                    <CalendarDays size={15} />
                  )}
                  {overdue ? "Overdue — " : ""}
                  {dueLabel(todo.dueDate)}
                </div>
              )}

              <div>
                <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() =>
                    notes !== (todo.notes || "") && onUpdate(todo.id, { notes })
                  }
                  placeholder="Add details…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none h-24 placeholder:text-white/25 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                    Due date
                  </label>
                  <DatePicker
                    value={dateStr}
                    onChange={(d) => applyDateTime(d, timeStr)}
                    placeholder="No due date"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                    Time
                  </label>
                  <input
                    type="time"
                    value={timeStr}
                    disabled={!dateStr}
                    onChange={(e) => applyDateTime(dateStr, e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-40 [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Full timestamps */}
              <div className="grid grid-cols-1 gap-2 pt-1 text-xs">
                <div className="flex justify-between bg-white/5 border border-white/5 rounded-xl px-3 py-2.5">
                  <span className="text-white/30">Created</span>
                  <span className="text-white/50">
                    {fullTimestamp(todo.createdAt)}
                  </span>
                </div>
                <div className="flex justify-between bg-white/5 border border-white/5 rounded-xl px-3 py-2.5">
                  <span className="text-white/30">Updated</span>
                  <span className="text-white/50">
                    {fullTimestamp(todo.updatedAt)}
                  </span>
                </div>
                {todo.completed && todo.completedAt && (
                  <div className="flex justify-between bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-3 py-2.5">
                    <span className="text-emerald-300/50">Completed</span>
                    <span className="text-emerald-300/70">
                      {fullTimestamp(todo.completedAt)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => {
                    onDelete(todo.id);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors text-sm font-medium"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
