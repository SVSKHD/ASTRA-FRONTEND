import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Settings2,
  TimerReset,
  Lock,
  LogOut,
  User as UserIcon,
  DollarSign,
  Euro,
  IndianRupee,
  ArrowRightLeft,
  Palette,
  Check,
} from "lucide-react";
import dynamic from "next/dynamic";
import { TabConfig } from "../config/dashboard-tabs";
import { UserProfile } from "@/context/UserContext";
import { Currency } from "@/context/CurrencyContext";
import { NextDeadline } from "@/hooks/useTabCounts";
import { dueLabel } from "../utils/time";
import { LiveClock } from "./topbar/LiveClock";

const GradientPicker = dynamic(() => import("./GradientPicker"), {
  ssr: false,
});

interface TopBarProps {
  tabs: TabConfig[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  counts: Record<string, number>;
  nextDeadline: NextDeadline | null;
  background: string;
  onThemeChange: (bg: string) => void;
  appUser: UserProfile | null;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  onOpenLogin: () => void;
  onOpenConverter: () => void;
  onLock: () => void;
  onLogout: () => void;
  isActiveMode: boolean;
  onActiveModeChange: (v: boolean) => void;
  timeLeft: number;
  elevated?: boolean;
}

const currencyIcon = (c: Currency) =>
  c === "USD" ? DollarSign : c === "EUR" ? Euro : IndianRupee;

export const TopBar: React.FC<TopBarProps> = ({
  tabs,
  activeTabId,
  onTabChange,
  counts,
  nextDeadline,
  background,
  onThemeChange,
  appUser,
  currency,
  setCurrency,
  onOpenLogin,
  onOpenConverter,
  onLock,
  onLogout,
  isActiveMode,
  onActiveModeChange,
  timeLeft,
  elevated,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<{ [id: string]: HTMLButtonElement | null }>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  // Keep the active tab in view within the horizontally-scrolling strip.
  useEffect(() => {
    const el = tabRefs.current[activeTabId];
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTabId]);

  // Close popovers on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      )
        setShowSettings(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node))
        setShowTheme(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <header
      className={`fixed top-0 inset-x-0 z-[90] h-16 border-b transition-all duration-300 ${
        elevated
          ? "bg-black/70 border-white/10 backdrop-blur-2xl shadow-2xl"
          : "bg-black/40 border-white/5 backdrop-blur-xl"
      }`}
    >
      <div className="h-full max-w-7xl mx-auto px-2 sm:px-4 flex items-center gap-2 sm:gap-3">
        {/* Logo */}
        <button
          onClick={() => tabs[0] && onTabChange(tabs[0].id)}
          className="flex items-center gap-2 shrink-0 group"
          title="Aureon"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/10 flex items-center justify-center group-hover:border-white/20 transition-colors">
            <Sparkles size={18} className="text-white" />
          </div>
          <span className="font-bold text-white hidden sm:inline tracking-tight">
            Aureon
          </span>
        </button>

        <div className="h-6 w-px bg-white/10 shrink-0 hidden sm:block" />

        {/* Tab strip */}
        <div
          ref={stripRef}
          className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar overscroll-contain"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const Icon = tab.icon;
            const count = counts[tab.id] || 0;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={`relative shrink-0 h-10 min-h-[40px] rounded-full flex items-center gap-1.5 px-3 md:px-4 outline-none transition-colors ${
                  isActive
                    ? "text-white"
                    : "text-white/45 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="topbar-active-pill"
                    className="absolute inset-0 bg-white/15 rounded-full ring-1 ring-white/10 shadow-sm"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon size={16} className="shrink-0" />
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      isActive ? "inline" : "hidden md:inline"
                    }`}
                  >
                    {tab.label}
                  </span>
                </span>
                {count > 0 && (
                  <span className="relative z-10 min-w-[16px] h-4 px-1 rounded-full bg-blue-500/80 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="h-6 w-px bg-white/10 shrink-0 hidden lg:block" />

        {/* Right cluster */}
        <div className="flex items-center gap-2 shrink-0">
          <LiveClock />

          {/* Next-deadline ticker (desktop only) */}
          {nextDeadline && (
            <button
              onClick={() => onTabChange(nextDeadline.tabId)}
              className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 transition-colors max-w-[220px]"
              title={`Next: ${nextDeadline.title}`}
            >
              <TimerReset size={14} className="text-blue-300 shrink-0" />
              <span className="text-xs text-white/70 truncate">
                {nextDeadline.title}
              </span>
              <span className="text-[10px] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                {dueLabel(nextDeadline.when, true)}
              </span>
            </button>
          )}

          {/* Theme indicator */}
          <div className="relative" ref={themeRef}>
            <button
              onClick={() => setShowTheme((v) => !v)}
              className="w-9 h-9 rounded-full border border-white/15 overflow-hidden shrink-0 hover:border-white/30 transition-colors relative"
              title="Theme"
              style={{ background }}
            >
              <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/30 transition-opacity">
                <Palette size={14} className="text-white" />
              </span>
            </button>
            {showTheme && (
              <div className="absolute right-0 top-12 z-[150]">
                <GradientPicker
                  initialBackground={background}
                  onChange={onThemeChange}
                  onClose={() => setShowTheme(false)}
                />
              </div>
            )}
          </div>

          {/* Profile / settings */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`w-9 h-9 rounded-full border flex items-center justify-center overflow-hidden shrink-0 transition-all ${
                showSettings
                  ? "bg-white/20 border-white/20"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
              title="Profile & settings"
            >
              {appUser?.avatarUrl ? (
                <img
                  src={appUser.avatarUrl}
                  alt={appUser.username || "User"}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Settings2 size={16} className="text-white/70" />
              )}
            </button>

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  className="absolute right-0 top-12 w-72 bg-black/95 border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur-3xl z-[150]"
                >
                  {/* Account */}
                  <button
                    onClick={() => {
                      onOpenLogin();
                      setShowSettings(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors mb-2"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                      {appUser?.avatarUrl ? (
                        <img
                          src={appUser.avatarUrl}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <UserIcon size={16} className="text-white/60" />
                      )}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {appUser?.username || "Sign in"}
                      </p>
                      <p className="text-xs text-white/40 truncate">
                        {appUser?.email || "Manage your account"}
                      </p>
                    </div>
                  </button>

                  {/* Next deadline (surfaced here for mobile) */}
                  {nextDeadline && (
                    <button
                      onClick={() => {
                        onTabChange(nextDeadline.tabId);
                        setShowSettings(false);
                      }}
                      className="lg:hidden w-full flex items-center gap-2 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors mb-2"
                    >
                      <TimerReset
                        size={14}
                        className="text-blue-300 shrink-0"
                      />
                      <span className="text-xs text-white/70 truncate flex-1 text-left">
                        {nextDeadline.title}
                      </span>
                      <span className="text-[10px] text-blue-300 shrink-0">
                        {dueLabel(nextDeadline.when, true)}
                      </span>
                    </button>
                  )}

                  {/* Currency */}
                  <div className="px-1 mb-2">
                    <p className="text-[10px] text-white/30 font-bold tracking-widest uppercase mb-1.5 px-1">
                      Currency
                    </p>
                    <div className="flex gap-1.5">
                      {(["USD", "EUR", "INR"] as Currency[]).map((c) => {
                        const Icon = currencyIcon(c);
                        const active = currency === c;
                        return (
                          <button
                            key={c}
                            onClick={() => setCurrency(c)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                              active
                                ? "bg-white/15 text-white ring-1 ring-white/15"
                                : "bg-white/5 text-white/50 hover:bg-white/10"
                            }`}
                          >
                            <Icon size={12} /> {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tools */}
                  <button
                    onClick={() => {
                      onOpenConverter();
                      setShowSettings(false);
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-sm text-white/70"
                  >
                    <ArrowRightLeft size={16} className="text-white/40" />
                    Currency converter
                  </button>

                  {/* Focus mode + auto-lock countdown */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-white/70">
                      <input
                        type="checkbox"
                        checked={isActiveMode}
                        onChange={(e) => onActiveModeChange(e.target.checked)}
                        className="w-4 h-4 rounded border-white/30 bg-white/10 accent-blue-500"
                      />
                      Focus mode
                    </label>
                    <span
                      className={`text-xs font-mono ${
                        timeLeft < 60 && !isActiveMode
                          ? "text-red-400"
                          : "text-white/40"
                      }`}
                    >
                      {isActiveMode ? "on" : formatTime(timeLeft)}
                    </span>
                  </div>

                  <div className="h-px bg-white/10 my-2" />

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onLock();
                        setShowSettings(false);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/10 hover:bg-red-500/20 transition-colors text-sm font-medium"
                    >
                      <Lock size={14} /> Lock
                    </button>
                    <button
                      onClick={() => {
                        onLogout();
                        setShowSettings(false);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 text-white/60 border border-white/5 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
};
