import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut, User as UserIcon, Lock } from "lucide-react";
import { signInWithPopup, signOut, User } from "firebase/auth";
import { auth, googleProvider } from "../utils/firebase";
import { useUser } from "@/context/UserContext";

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export const LoginDialog = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}) => {
  const { user, updateUser } = useUser();
  const [pin, setPin] = useState("");
  const [isEditingPin, setIsEditingPin] = useState(false);

  // Sync local pin state with user context when user loads
  useEffect(() => {
    if (user?.pin) setPin(user.pin);
  }, [user]);

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

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      // Don't close immediately, let user see profile
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleSavePin = async () => {
    if (pin.length === 4) {
      await updateUser({ pin });
      setIsEditingPin(false);
      alert("Lock Screen PIN updated!");
      onClose();
    } else {
      alert("PIN must be 4 digits.");
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d*$/.test(val) && val.length <= 4) {
      setPin(val);
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
            className="relative w-full max-w-sm bg-[#111] border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden ring-1 ring-white/10"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col items-center text-center mt-4">
              {user ? (
                <>
                  <div className="w-20 h-20 rounded-full border-2 border-white/10 mb-4 overflow-hidden">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.username || "User"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        <UserIcon size={32} className="text-white/50" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    {user.username || "User"}
                  </h3>
                  <p className="text-white/40 text-sm mb-6">{user.email}</p>

                  {/* PIN Section */}
                  <div className="w-full bg-white/5 rounded-xl p-4 mb-6 border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
                        <Lock size={14} />
                        Lock Screen PIN
                      </div>
                      {user.pin && !isEditingPin && (
                        <button
                          onClick={() => setIsEditingPin(true)}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Change
                        </button>
                      )}
                    </div>

                    {isEditingPin || !user.pin ? (
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={pin}
                          onChange={handlePinChange}
                          placeholder="0000"
                          className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-center text-white tracking-[0.5em] focus:outline-none focus:border-blue-500/50 transition-colors placeholder:tracking-normal font-mono"
                        />
                        <button
                          onClick={handleSavePin}
                          disabled={pin.length !== 4}
                          className="px-3 py-2 bg-white text-black text-sm font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/90 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-white/50 text-xl tracking-[0.5em]">
                        ••••
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full py-3 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold transition-colors flex items-center justify-center gap-2 border border-red-500/10"
                  >
                    <LogOut size={18} />
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
                    <UserIcon size={32} className="text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    Welcome Back
                  </h3>
                  <p className="text-white/50 text-sm mb-8">
                    Sign in to sync your dashboard settings and preferences
                    across devices.
                  </p>

                  <button
                    onClick={handleGoogleLogin}
                    className="w-full py-3 px-4 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-all flex items-center justify-center gap-3"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.-.19-.58z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
