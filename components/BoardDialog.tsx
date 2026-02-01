import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check } from "lucide-react";
import { ColumnType } from "@/utils/kanban-service";

const AVAILABLE_COLUMNS: ColumnType[] = [
  "Backlog",
  "To Do",
  "In Progress",
  "In Review",
  "Testing",
  "Done",
  // Legacy/Custom
  "Dock",
  "Finished",
  "Parked",
];

const DEFAULT_SELECTION: ColumnType[] = [
  "To Do",
  "In Progress",
  "In Review",
  "Done",
];

interface BoardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, columns: ColumnType[]) => void;
  initialName?: string;
  initialColumns?: ColumnType[];
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  isCreation?: boolean;
}

export const BoardDialog = ({
  isOpen,
  onClose,
  onSave,
  initialName = "",
  initialColumns,
  title = "Create New Board",
  subtitle = "Customize your Kanban workflow.",
  confirmLabel = "Create Board",
  isCreation = false,
}: BoardDialogProps) => {
  const [name, setName] = useState(initialName);
  const [columns, setColumns] = useState<ColumnType[]>(
    initialColumns || (isCreation ? DEFAULT_SELECTION : []),
  );

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setColumns(initialColumns || (isCreation ? DEFAULT_SELECTION : []));
    }
  }, [isOpen, initialName, initialColumns, isCreation]);

  const toggleColumn = (column: ColumnType) => {
    setColumns((prev) =>
      prev.includes(column)
        ? prev.filter((c) => c !== column)
        : [...prev, column],
    );
  };

  const handleSave = () => {
    if (name.trim() && columns.length > 0) {
      onSave(name.trim(), columns);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg p-8 rounded-3xl bg-[#111] border border-white/10 shadow-2xl relative"
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white"
        >
          <X size={20} />
        </button>

        {isCreation && (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500 to-blue-500 mb-6 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Plus size={24} className="text-white" />
          </div>
        )}

        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        {subtitle && <p className="text-white/40 mb-6 text-sm">{subtitle}</p>}

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">
              Board Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q1 Roadmap"
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">
              Statuses (Flow)
            </label>
            <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
              {AVAILABLE_COLUMNS.map((col) => {
                const isSelected = columns.includes(col);
                return (
                  <button
                    key={col}
                    onClick={() => toggleColumn(col)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-sm transition-all ${
                      isSelected
                        ? "bg-blue-500/10 border-blue-500/50 text-white"
                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? "border-blue-400 bg-blue-400"
                          : "border-white/30"
                      }`}
                    >
                      {isSelected && <Check size={10} className="text-black" />}
                    </div>
                    {col}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-white/5 text-white/70 font-semibold hover:bg-white/10 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || columns.length === 0}
              className="flex-1 py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
