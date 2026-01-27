"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { tabsConfig } from "../config/dashboard-tabs";
import {
  Palette,
  Lock,
  User as UserIcon,
  Coins,
  DollarSign,
  Euro,
  IndianRupee,
} from "lucide-react";
import GradientPicker from "./GradientPicker";
import { GreetCard } from "./GreetCard";
import { LoginDialog } from "./LoginDialog";
import { auth } from "../utils/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { useUser } from "@/context/UserContext";
import { useCurrency } from "../hooks/useCurrency";
import { Currency } from "@/context/CurrencyContext";

interface DashboardProps {
  onLock: () => void;
}

export default function Dashboard({ onLock }: DashboardProps) {
  const [activeTabId, setActiveTabId] = useState(tabsConfig[0].id);

  useEffect(() => {
    const saved = localStorage.getItem("astra-active-tab");
    if (saved && tabsConfig.find((t) => t.id === saved)) {
      setActiveTabId(saved);
    }
  }, []);

  const [background, setBackground] = useState("#000000"); // Default black background

  const { user: appUser, loading } = useUser();
  const { currency, setCurrency } = useCurrency();

  const visibleTabs = tabsConfig.filter((tab) => {
    if (!tab.allowedRoles) return true;
    if (!appUser) return false;
    return tab.allowedRoles.includes(appUser.role);
  });

  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const handleDragEnd = (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const { point } = info;

    for (const tab of visibleTabs) {
      // Check both desktop and mobile refs
      const keys = [`desktop-${tab.id}`, `mobile-${tab.id}`];
      
      for (const key of keys) {
        const element = tabRefs.current[key];
        if (element) {
          const rect = element.getBoundingClientRect();
          // Skip hidden elements (0x0)
          if (rect.width === 0 || rect.height === 0) continue;

          if (
            point.x >= rect.left &&
            point.x <= rect.right &&
            point.y >= rect.top &&
            point.y <= rect.bottom
          ) {
            if (tab.id !== activeTabId) {
              handleTabChange(tab.id);
            }
            return; // Found a match, exit
          }
        }
      }
    }
  };

  useEffect(() => {
    if (loading) return;
    const isVisible = visibleTabs.find((t) => t.id === activeTabId);
    if (!isVisible && visibleTabs.length > 0) {
      setActiveTabId(visibleTabs[0].id);
    }
  }, [appUser, activeTabId, visibleTabs, loading]);

  const handleTabChange = (id: string) => {
    setActiveTabId(id);
    localStorage.setItem("astra-active-tab", id);
  };

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [timeLeft, setTimeLeft] = useState(3000);
  const [isActiveMode, setIsActiveMode] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("astra-active-mode");
    if (saved === "true") setIsActiveMode(true);
  }, []);

  const handleActiveModeChange = (checked: boolean) => {
    setIsActiveMode(checked);
    localStorage.setItem("astra-active-mode", String(checked));
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (!isActiveMode && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            onLock();
            return 3000;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (isActiveMode) {
      setTimeLeft(3000);
    }

    return () => clearInterval(interval);
  }, [isActiveMode, timeLeft, onLock]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const activeTab =
    visibleTabs.find((tab) => tab.id === activeTabId) || visibleTabs[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <span className="text-white/40 font-medium tracking-[0.2em] text-sm animate-pulse">
          ASTRA TRADING
        </span>
      </div>
    );
  }

  if (!activeTab) return null; // Or loading state

  return (
    <div className="min-h-screen text-white relative overflow-hidden font-sans">
      <div
        className="fixed inset-0 z-0 transition-[background] duration-500"
        style={{ background: background }}
      >
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-600/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] bg-orange-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto h-screen block">
        {/* Auto-Lock Timer Widget */}
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg">
            <div
              className={`text-sm font-mono font-medium ${timeLeft < 60 ? "text-red-400 animate-pulse" : "text-white/80"}`}
            >
              {formatTime(timeLeft)}
            </div>
            <div className="h-4 w-[1px] bg-white/10" />
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isActiveMode}
                  onChange={(e) => handleActiveModeChange(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="w-4 h-4 rounded border border-white/30 peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-all" />
                <svg
                  className="absolute inset-0 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className="text-xs text-white/60 group-hover:text-white/90 transition-colors">
                I am using it now
              </span>
            </label>
          </div>
        </div>

        <header className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 p-2 pl-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
          {/* Currency Picker */}
          <div className="relative group z-50">
            <button
              onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}
              className={`h-8 px-3 rounded-full border transition-all flex items-center justify-center gap-2 ${
                showCurrencyPicker
                  ? "bg-white/20 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                  : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Coins
                size={14}
                className={showCurrencyPicker ? "text-white" : ""}
              />
              <span className="text-xs font-medium tracking-wide">
                {currency}
              </span>
            </button>
            <AnimatePresence>
              {showCurrencyPicker && (
                <motion.div
                  initial={{
                    opacity: 0,
                    y: 10,
                    scale: 0.95,
                    filter: "blur(10px)",
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{
                    opacity: 0,
                    y: 10,
                    scale: 0.95,
                    filter: "blur(10px)",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="absolute top-12 left-0 min-w-[140px] bg-black/80 backdrop-blur-3xl border border-white/10 rounded-2xl p-1.5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                  <div className="flex flex-col gap-1 relative z-10">
                    {(["USD", "EUR", "INR"] as Currency[]).map((c) => {
                      const Icon =
                        c === "USD"
                          ? DollarSign
                          : c === "EUR"
                            ? Euro
                            : IndianRupee;
                      const isActive = currency === c;
                      return (
                        <button
                          key={c}
                          onClick={() => {
                            setCurrency(c);
                            setShowCurrencyPicker(false);
                          }}
                          className={`px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all duration-300 flex items-center gap-3 group/item relative overflow-hidden ${
                            isActive
                              ? "bg-white/15 text-white border border-white/20"
                              : "text-white/60 hover:bg-white/10 hover:text-white/90 border border-transparent"
                          }`}
                        >
                          <div
                            className={`p-1 rounded-full ${isActive ? "bg-white text-black" : "bg-white/10 text-white/50 group-hover/item:bg-white/20 group-hover/item:text-white"}`}
                          >
                            <Icon size={12} strokeWidth={3} />
                          </div>
                          <span className="flex-1">{c}</span>
                          {isActive && (
                            <motion.div
                              layoutId="active-dot"
                              className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Color Picker */}
          <div className="relative group z-50">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className={`w-8 h-8 rounded-full border transition-all flex items-center justify-center ${showColorPicker ? "bg-white/20 border-white/20 text-white" : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10"}`}
            >
              <Palette size={14} />
            </button>

            <AnimatePresence>
              {showColorPicker && (
                <div className="absolute top-12 left-0">
                  <GradientPicker
                    initialBackground={background}
                    onChange={setBackground}
                    onClose={() => setShowColorPicker(false)}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Separator */}
          <div className="h-4 w-[1px] bg-white/10" />

          {/* Tab Bar - Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {visibleTabs.map((tab) => {
              const isActive = activeTabId === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[`desktop-${tab.id}`] = el;
                  }}
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative px-4 py-1.5 rounded-full text-xs font-medium transition-colors duration-300 flex items-center gap-2 outline-none ${
                    isActive
                      ? "text-white"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-tab-indicator"
                      className="absolute inset-0 bg-white/15 rounded-full ring-1 ring-white/5 shadow-sm"
                      drag="x"
                      dragSnapToOrigin
                      onDragEnd={handleDragEnd}
                      whileDrag={{ cursor: "grabbing" }}
                      style={{ cursor: "grab" }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2 pointer-events-none">
                    <Icon size={14} />
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Separator */}
          <div className="h-4 w-[1px] bg-white/10 hidden md:block" />

          {/* User Login Button */}
          <button
            onClick={() => setIsLoginOpen(true)}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/5 flex items-center justify-center transition-all overflow-hidden"
            title={appUser ? "Account" : "Sign In"}
          >
            {appUser?.avatarUrl ? (
              <img
                src={appUser.avatarUrl}
                alt={appUser.username || "User"}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon size={14} />
            )}
          </button>

          {/* Lock Button */}
          <button
            onClick={onLock}
            className="w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 flex items-center justify-center transition-colors group"
            title="Lock Screen"
          >
            <Lock
              size={14}
              className="group-hover:text-red-300 transition-colors"
            />
          </button>
        </header>

        <div className="md:hidden fixed top-24 left-4 right-4 z-40 pb-6 pointer-events-none">
          <div className="flex items-center justify-between bg-black/60 backdrop-blur-xl p-1 rounded-2xl border border-white/10 pointer-events-auto shadow-2xl">
            {visibleTabs.map((tab) => {
              const isActive = activeTabId === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[`mobile-${tab.id}`] = el;
                  }}
                  onClick={() => handleTabChange(tab.id)}
                  className="flex-1 relative py-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-300 outline-none"
                >
                  {isActive && (
                    <motion.div
                      layoutId="mobile-tab-highlight"
                      className="absolute inset-0 bg-white/10 rounded-xl"
                      transition={{
                        type: "spring",
                        bounce: 0.2,
                        duration: 0.6,
                      }}
                      drag="x"
                      dragSnapToOrigin
                      onDragEnd={handleDragEnd}
                      whileDrag={{ cursor: "grabbing" }}
                      style={{ touchAction: "none" }}
                    />
                  )}
                  <Icon
                    size={18}
                    className={`relative z-10 pointer-events-none ${isActive ? "text-white" : "text-white/50"}`}
                  />
                  <span
                    className={`relative z-10 text-[10px] font-medium pointer-events-none ${isActive ? "text-white" : "text-white/50"}`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <main
          className="w-full h-full overflow-y-auto pt-48 md:pt-32 pb-6 px-4 md:px-8 no-scrollbar mask-gradient-top"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 15%, black 100%)",
          }}
        >
          <GreetCard pageTitle={activeTab.label} caption={activeTab.caption} />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab.id}
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.99 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab.component}
            </motion.div>
          </AnimatePresence>
        </main>

        <LoginDialog
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          user={user}
        />
      </div>
    </div>
  );
}
