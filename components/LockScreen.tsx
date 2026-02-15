"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Lock, Unlock, Delete } from "lucide-react";
import { useUser } from "@/context/UserContext";
import useBreakpoints from "@/hooks/useBreakpoints";

interface LockScreenProps {
  isLocked: boolean;
  onUnlock: () => void;
  background?: string;
}

export default function LockScreen({
  isLocked,
  onUnlock,
  background,
}: LockScreenProps) {
  const { user } = useUser();
  const { isMobile } = useBreakpoints();
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
        }, 500);
      } else {
        setError(true);
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 400);
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
  const containerVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
        type: "spring" as const,
        stiffness: 300,
        damping: 30,
      },
    },
    exit: { opacity: 0, scale: 0.95 },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 300, damping: 24 },
    },
  };

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black overflow-hidden select-none"
        >
          {/* Background Layer */}
          <div
            className="absolute inset-0 z-0 transition-[background] duration-500"
            style={{ background: background || "#000000" }}
          />

          {/* Optimized Background Overlay for Mobile */}
          <div className="absolute inset-0 z-0">
            {isMobile ? (
              // Simple gradient overlay for mobile
              <div className="absolute inset-0 bg-black/40" />
            ) : (
              // Heavy blur/overlay for desktop
              <>
                <div className="absolute inset-0 backdrop-blur-3xl bg-black/40" />
              </>
            )}
            {/* Noise only on desktop */}
            {!isMobile && (
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
            )}
          </div>

          {/* Main Container */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-10 flex flex-col items-center w-full max-w-sm px-6"
          >
            {/* Header / Status */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center gap-2 mb-12"
            >
              <div className="flex flex-col items-center">
                <motion.div
                  animate={error ? { x: [-5, 5, -5, 5, 0] } : {}}
                  transition={{ type: "spring", stiffness: 500, damping: 10 }}
                >
                  {success ? (
                    <Unlock size={24} className="text-green-400 mb-2" />
                  ) : (
                    <Lock size={24} className="text-white mb-2" />
                  )}
                </motion.div>
                <h2 className="text-xl font-medium text-white tracking-wide">
                  {success ? "Unlocked" : "Enter Passcode"}
                </h2>
              </div>

              {/* iOS Style Dots */}
              <div className="flex gap-4 mt-6 h-4">
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    initial={false}
                    animate={
                      pin.length > i
                        ? {
                            backgroundColor: success ? "#4ade80" : "#ffffff",
                            borderColor: success ? "#4ade80" : "#ffffff",
                          }
                        : {
                            backgroundColor: "transparent",
                            borderColor: "#ffffff40",
                          }
                    }
                    className="w-3.5 h-3.5 rounded-full border-[1.5px] transition-colors duration-200"
                  />
                ))}
              </div>
            </motion.div>

            {/* iOS Style Keypad */}
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-3 gap-x-6 gap-y-4 w-full max-w-[280px]"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <KeypadButton
                  key={num}
                  value={num.toString()}
                  onClick={() => handleNumClick(num.toString())}
                  disabled={success}
                  isMobile={isMobile}
                />
              ))}
              <div /> {/* Spacer */}
              <KeypadButton
                value="0"
                onClick={() => handleNumClick("0")}
                disabled={success}
                isMobile={isMobile}
              />
              <div className="flex items-center justify-center">
                {pin.length > 0 && (
                  <button
                    onClick={handleBackspace}
                    className="w-full h-full flex items-center justify-center text-white active:opacity-50 transition-opacity"
                  >
                    <span className="text-sm font-medium">Delete</span>
                  </button>
                )}
              </div>
            </motion.div>

            {/* Footer */}
            <motion.button
              variants={itemVariants}
              onClick={() => {
                // Should handle "Forgot Passcode" or "Emergency" logic here if needed
              }}
              className="mt-12 text-white/40 text-sm font-medium tracking-wide active:text-white/60 transition-colors"
            >
              Emergency
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Separate component for iOS-style button interaction
const KeypadButton = ({
  value,
  onClick,
  disabled,
  isMobile,
}: {
  value: string;
  onClick: () => void;
  disabled: boolean;
  isMobile: boolean;
}) => {
  return (
    <motion.button
      whileTap={{ backgroundColor: "rgba(255, 255, 255, 0.4)" }}
      transition={{ duration: 0.1 }}
      onClick={onClick}
      disabled={disabled}
      className={`
        w-[72px] h-[72px] rounded-full 
        flex items-center justify-center 
        text-3xl font-light text-white 
        transition-colors
        active:backdrop-blur-none
        outline-none select-none
        ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
        ${
          isMobile
            ? "bg-white/10 border-0" // Fastest for mobile: no blur, no border, no shadow
            : "bg-white/10 backdrop-blur-md border border-white/5 shadow-lg" // Desktop: Glass effect
        }
      `}
    >
      {value}
    </motion.button>
  );
};
