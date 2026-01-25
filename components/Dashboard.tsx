"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { tabsConfig } from "../config/dashboard-tabs";
import { Palette, Lock } from "lucide-react";
import GradientPicker from "./GradientPicker";
import { GreetCard } from "./GreetCard";

interface DashboardProps {
  onLock: () => void;
}

export default function Dashboard({ onLock }: DashboardProps) {
  const [activeTabId, setActiveTabId] = useState(tabsConfig[0].id);
  const [background, setBackground] = useState("#000000"); // Default black background
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [timeLeft, setTimeLeft] = useState(3000); // 50 minutes in seconds
  const [isActiveMode, setIsActiveMode] = useState(false);

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
      setTimeLeft(3000); // Reset when active mode is engaged
    }

    return () => clearInterval(interval);
  }, [isActiveMode, timeLeft, onLock]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const activeTab =
    tabsConfig.find((tab) => tab.id === activeTabId) || tabsConfig[0];

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
            <div className={`text-sm font-mono font-medium ${timeLeft < 60 ? 'text-red-400 animate-pulse' : 'text-white/80'}`}>
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
                <svg className="absolute inset-0 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className="text-xs text-white/60 group-hover:text-white/90 transition-colors">I am using it now</span>
            </label>
          </div>
        </div>

        <header className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 p-2 pl-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
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
            {tabsConfig.map((tab) => {
              const isActive = activeTabId === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`relative px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 flex items-center gap-2 ${isActive ? "bg-white/15 text-white shadow-sm ring-1 ring-white/5" : "text-white/50 hover:text-white hover:bg-white/5"}`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Separator */}
          <div className="h-4 w-[1px] bg-white/10 hidden md:block" />

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
            {tabsConfig.map((tab) => {
              const isActive = activeTabId === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className="flex-1 relative py-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-300"
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
                    />
                  )}
                  <Icon
                    size={18}
                    className={`relative z-10 ${isActive ? "text-white" : "text-white/50"}`}
                  />
                  <span
                    className={`relative z-10 text-[10px] font-medium ${isActive ? "text-white" : "text-white/50"}`}
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
          style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 100%)' }}
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
      </div>
    </div>
  );
}
