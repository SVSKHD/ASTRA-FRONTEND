"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Unlock, Delete } from "lucide-react";
import { useUser } from "@/context/UserContext";

interface LockScreenProps {
  isLocked: boolean;
  onUnlock: () => void;
}

export default function LockScreen({ isLocked, onUnlock }: LockScreenProps) {
  const { user } = useUser();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (pin.length === 4) {
      const correctPin = user?.pin || process.env.NEXT_PUBLIC_LOCK_PASSWORD;
      if (pin === correctPin) {
        setSuccess(true);
        setTimeout(() => {
          onUnlock();
          setPin("");
          setSuccess(false);
        }, 800);
      } else {
        setError(true);
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 500);
      }
    }
  }, [pin, onUnlock, user]);

  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (/^[0-9]$/.test(key)) {
        if (pin.length < 4 && !success) {
          setPin((prev) => prev + key);
          setError(false);
        }
      } else if (key === "Backspace") {
        setPin((prev) => prev.slice(0, -1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLocked, pin, success]);

  const handleNumClick = (num: string) => {
    if (pin.length < 4 && !success) {
      setPin((prev) => prev + num);
      setError(false);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  // Staggered children variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    },
    exit: { opacity: 0 }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { delay: 0.2 } }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-3xl overflow-hidden"
        >
          {/* Background Effects */}
          <div className="absolute inset-0 z-0">
            <div className="absolute top-[-20%] left-[-20%] w-[800px] h-[800px] bg-indigo-500/20 rounded-full blur-[150px] animate-pulse-slow" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[800px] h-[800px] bg-purple-500/20 rounded-full blur-[150px] animate-pulse-slow delay-1000" />
            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.05]" />
          </div>

          {/* Dialog Container */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 bg-black/40 backdrop-blur-2xl border border-white/10 p-6 md:p-12 rounded-[3.5rem] shadow-[0_0_80px_rgba(0,0,0,0.5)] flex flex-col items-center gap-6 md:gap-10 max-w-sm w-full mx-4 overflow-hidden"
          >
            {/* Shine Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />

            <motion.div
              variants={itemVariants}
              animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
              className="flex flex-col items-center gap-6 relative z-10"
            >
              <h1 className="text-5xl font-extralight tracking-tight text-white mb-2 drop-shadow-xl font-sans">
                Astra
              </h1>
              <motion.div
                initial={{ background: "rgba(255,255,255,0.1)" }}
                animate={
                  success
                    ? { background: "rgba(34, 197, 94, 0.2)", borderColor: "rgba(34, 197, 94, 0.4)" }
                    : { background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.1)" }
                }
                className="flex items-center gap-2 px-6 py-2 rounded-full backdrop-blur-3xl border shadow-lg transition-colors duration-500"
              >
                {success ? (
                  <Unlock size={14} className="text-green-400" />
                ) : (
                  <Lock size={14} className="text-white/70" />
                )}
                <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${success ? "text-green-400" : "text-white/70"}`}>
                  {success ? "Welcome Back" : "System Locked"}
                </span>
              </motion.div>
            </motion.div>

            {/* Pins dots */}
            <motion.div variants={itemVariants} className="flex gap-4 mb-2 relative z-10">
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={
                    success
                      ? { scale: [1, 1.5, 1], backgroundColor: "#4ade80", borderColor: "#4ade80", boxShadow: "0 0 20px #4ade80" }
                      : { scale: 1 }
                  }
                  transition={{ delay: i * 0.1 }}
                  className={`w-4 h-4 rounded-full border border-white/20 transition-all duration-300 ${pin.length > i
                    ? "bg-white border-white shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                    : "bg-transparent"
                    }`}
                />
              ))}
            </motion.div>

            {/* Keypad */}
            <motion.div variants={itemVariants} className="grid grid-cols-3 gap-x-4 gap-y-4 md:gap-x-6 md:gap-y-6 relative z-10 transition-all">
              {[
                { num: "1" }, { num: "2" }, { num: "3" },
                { num: "4" }, { num: "5" }, { num: "6" },
                { num: "7" }, { num: "8" }, { num: "9" },
              ].map(({ num }) => (
                <motion.button
                  whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.15)" }}
                  whileTap={{ scale: 0.9 }}
                  key={num}
                  onClick={() => handleNumClick(num)}
                  disabled={success}
                  className="w-16 h-16 rounded-full bg-white/5 backdrop-blur-md border border-white/5 shadow-lg flex flex-col items-center justify-center transition-colors group outline-none focus:ring-1 focus:ring-white/30"
                >
                  <span className="text-2xl font-light text-white/90 group-hover:text-white transition-colors">
                    {num}
                  </span>
                </motion.button>
              ))}

              <div /> {/* Empty slot */}

              <motion.button
                whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.15)" }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleNumClick("0")}
                disabled={success}
                className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/5 backdrop-blur-md border border-white/5 shadow-lg flex flex-col items-center justify-center transition-colors group outline-none focus:ring-1 focus:ring-white/30"
              >
                <span className="text-xl md:text-2xl font-light text-white/90 group-hover:text-white transition-colors">0</span>
              </motion.button>

              <div className="flex items-center justify-center">
                <motion.button
                  whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleBackspace}
                  disabled={success}
                  className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors hover:bg-white/5 outline-none focus:ring-1 focus:ring-white/20"
                >
                  <Delete size={22} strokeWidth={1.5} />
                </motion.button>
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="text-white/20 text-[10px] mt-2 font-mono tracking-widest uppercase relative z-10">
              Authorized Access Only
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
