import React, { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag as TagIcon } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  // Pool of existing tags (across all items) used for autocomplete.
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}

// Chip-style multi-tag input with autocomplete drawn from existing tags.
export const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add tags…",
  className = "",
}) => {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = useMemo(
    () => new Set(value.map((t) => t.toLowerCase())),
    [value],
  );

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    const pool = Array.from(new Set(suggestions.map((s) => s.trim()))).filter(
      (s) => s && !normalized.has(s.toLowerCase()),
    );
    if (!q) return pool.slice(0, 8);
    return pool.filter((s) => s.toLowerCase().includes(q)).slice(0, 8);
  }, [input, suggestions, normalized]);

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (normalized.has(tag.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, tag]);
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length) {
      removeTag(value[value.length - 1]);
    }
  };

  const showSuggestions = focused && filtered.length > 0;

  return (
    <div className={`relative ${className}`}>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 min-h-[46px] cursor-text transition-all focus-within:ring-1 focus-within:ring-blue-500/50 focus-within:border-blue-500/30"
      >
        <TagIcon size={14} className="text-white/30 shrink-0" />
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 bg-blue-500/15 text-blue-200 border border-blue-500/20 px-2.5 py-1 rounded-lg text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="hover:text-white transition-colors"
              aria-label={`Remove ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-white focus:outline-none placeholder:text-white/25 py-0.5"
        />
      </div>

      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            className="absolute left-0 right-0 top-full mt-2 z-[120] bg-black/95 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-3xl max-h-56 overflow-y-auto custom-scrollbar"
          >
            <div className="text-[10px] text-white/30 px-2 py-1 font-bold tracking-widest uppercase">
              Existing tags
            </div>
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(s);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 hover:text-blue-200 transition-colors flex items-center gap-2"
              >
                <TagIcon size={12} className="text-white/30" />
                {s}
              </button>
            ))}
            {input.trim() &&
              !normalized.has(input.trim().toLowerCase()) &&
              !filtered.some(
                (f) => f.toLowerCase() === input.trim().toLowerCase(),
              ) && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(input);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-blue-300 hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                  <span className="text-white/40">Create</span> “{input.trim()}”
                </button>
              )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
