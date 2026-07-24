import React, { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Plus } from "lucide-react";

interface EditableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
}

// Dropdown that also lets the user type a brand-new value (editable dropdown).
export const EditableSelect: React.FC<EditableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "Select…",
  icon,
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [query, options]);

  const commit = (val: string) => {
    onChange(val.trim());
    setOpen(false);
    setQuery("");
  };

  const canCreate =
    query.trim() &&
    !options.some((o) => o.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white cursor-pointer transition-all hover:bg-white/[0.07] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      >
        {icon && <span className="text-white/50 mr-2">{icon}</span>}
        <span
          className={`flex-grow text-sm text-left ${!value && "text-white/30"}`}
        >
          {value || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="absolute left-0 right-0 top-full mt-2 z-[120] bg-black/95 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-3xl"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) commit(query);
              }}
              placeholder="Search or create…"
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-2 focus:outline-none focus:border-white/30 placeholder:text-white/25"
            />
            <div className="max-h-52 overflow-y-auto custom-scrollbar">
              {filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => commit(opt)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                >
                  {opt}
                  {value === opt && (
                    <Check size={14} className="text-blue-400" />
                  )}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  onClick={() => commit(query)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-blue-300 hover:bg-white/10 transition-colors text-left"
                >
                  <Plus size={14} /> Create “{query.trim()}”
                </button>
              )}
              {filtered.length === 0 && !canCreate && (
                <p className="text-xs text-white/30 text-center py-3">
                  No options
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
