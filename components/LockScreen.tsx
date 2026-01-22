"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Unlock } from "lucide-react";

interface LockScreenProps {
  isLocked: boolean;
  onUnlock: () => void;
}

export default function LockScreen({ isLocked, onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length === 4) {
      const correctPin = process.env.NEXT_PUBLIC_LOCK_PASSWORD ;
      if (pin === correctPin) {
        onUnlock();
        setPin("");
      } else {
        setError(true);
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 500);
      }
    }
  }, [pin, onUnlock]);

  const handleNumClick = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
      setError(false);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(8px)", y: 0 }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)", y: "-100%" }} // Slide up completely
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center text-white bg-black/30"
        >
          <div className="flex flex-col items-center gap-12">
            <motion.div
              animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
              className="flex flex-col items-center gap-6"
            >
              <h1 className="text-3xl font-bold tracking-tight text-white mb-2 drop-shadow-lg">
                Welcome to Astra
              </h1>
              <div className="flex items-center gap-2 bg-black/40 px-6 py-2 rounded-full backdrop-blur-3xl border border-white/5 shadow-2xl">
                <Lock size={16} className="text-white" />
                <span className="text-xs font-medium tracking-wide">
                  Astra is Locked
                </span>
              </div>
            </motion.div>

            {/* Pins dots */}
            <div className="flex gap-6 mb-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 border-white transition-all duration-200 ${pin.length > i ? "bg-white" : "bg-transparent"
                    }`}
                />
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-6 max-w-xs">
              {[
                { num: "1", sub: "" },
                { num: "2", sub: "ABC" },
                { num: "3", sub: "DEF" },
                { num: "4", sub: "GHI" },
                { num: "5", sub: "JKL" },
                { num: "6", sub: "MNO" },
                { num: "7", sub: "PQRS" },
                { num: "8", sub: "TUV" },
                { num: "9", sub: "WXYZ" },
              ].map(({ num, sub }) => (
                <button
                  key={num}
                  onClick={() => handleNumClick(num)}
                  className="w-20 h-20 rounded-full bg-white/10 hover:bg-white/30 backdrop-blur-2xl border border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.1)] flex flex-col items-center justify-center transition-all active:scale-95 active:bg-white/40"
                >
                  <span className="text-3xl font-bold leading-none">
                    {num}
                  </span>
                  {sub && (
                    <span className="text-[9px] font-bold tracking-widest leading-none mt-1 opacity-60">
                      {sub}
                    </span>
                  )}
                </button>
              ))}
              <div className="flex items-center justify-center">
                <button className="text-sm font-semibold text-white/80 hover:text-white transition-colors"></button>
              </div>
              <button
                onClick={() => handleNumClick("0")}
                className="w-20 h-20 rounded-full bg-white/10 hover:bg-white/30 backdrop-blur-2xl border border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.1)] flex flex-col items-center justify-center transition-all active:scale-95 active:bg-white/40"
              >
                <span className="text-3xl font-bold leading-none">0</span>
              </button>
              <div className="flex items-center justify-center">
                <button
                  onClick={handleBackspace}
                  className="text-sm font-semibold text-white/80 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
