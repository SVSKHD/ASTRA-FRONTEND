import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check } from "lucide-react";

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export const ShareDialog = ({
  isOpen,
  onClose,
  title,
  content,
}: ShareDialogProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1C1C1E] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="font-semibold text-white">{title}</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={content}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 font-mono focus:outline-none focus:border-white/30 transition-colors pr-12 truncate"
                />
                <button
                  onClick={handleCopy}
                  className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/5"
                  title="Copy link"
                >
                  {copied ? (
                    <Check size={14} className="text-green-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>

              <p className="text-xs text-center text-white/30">
                Anyone with this link can view this item.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
