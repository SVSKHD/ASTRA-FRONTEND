"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { tabsConfig } from "../config/dashboard-tabs";
import { X, Bell } from "lucide-react";
import { GreetCard } from "./GreetCard";
import { LoginDialog } from "./LoginDialog";
import { CurrencyConverterDialog } from "./CurrencyConverterDialog";
import { TopBar } from "./TopBar";
import { auth } from "../utils/firebase";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { useUser } from "@/context/UserContext";
import { useCurrency } from "../hooks/useCurrency";
import { useTabCounts } from "../hooks/useTabCounts";
import { useDialogContext } from "@/context/DialogContext";
import { QuickGlanceRibbon } from "./QuickGlanceRibbon";
import { subscribeToReminders, Reminder } from "@/services/remindersService";
import { handleGitHubCallback } from "@/services/githubService";
import { useRouter, useSearchParams } from "next/navigation";

interface DashboardProps {
  onLock: () => void;
  background: string;
  onThemeChange: (bg: string) => void;
}

const Toast = ({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -50, x: "-50%" }}
    animate={{ opacity: 1, y: 0, x: "-50%" }}
    exit={{ opacity: 0, y: -50, x: "-50%" }}
    className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-3 px-4 py-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl min-w-[300px]"
  >
    <div className="p-2 rounded-full bg-yellow-500/20 text-yellow-400">
      <Bell size={18} />
    </div>
    <div className="flex-1">
      <h4 className="text-sm font-semibold text-white">Reminder</h4>
      <p className="text-xs text-white/70">{message}</p>
    </div>
    <button
      onClick={onClose}
      className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
    >
      <X size={14} />
    </button>
  </motion.div>
);

export default function Dashboard({
  onLock,
  background,
  onThemeChange,
}: DashboardProps) {
  const [activeTabId, setActiveTabId] = useState(tabsConfig[0].id);

  const { currency, setCurrency } = useCurrency();
  const { user: appUser, loading } = useUser();
  const { counts, nextDeadline } = useTabCounts();
  const { isAnyDialogOpen } = useDialogContext();

  const router = useRouter();
  const searchParams = useSearchParams();
  const [processingAuth, setProcessingAuth] = useState(false);

  const visibleTabs = tabsConfig.filter((tab) => {
    if (!tab.allowedRoles) return true;
    if (!appUser) return false;
    return tab.allowedRoles.includes(appUser.role);
  });

  const handleTabChange = (id: string) => {
    if (isAnyDialogOpen) return;
    setActiveTabId(id);
    localStorage.setItem("astra-active-tab", id);
  };

  // Restore last tab, and honour a ?tab= deep link, plus custom nav events.
  useEffect(() => {
    const saved = localStorage.getItem("astra-active-tab");
    if (saved && tabsConfig.find((t) => t.id === saved)) {
      setActiveTabId(saved);
    }
    const handleNavigation = (e: any) => {
      const id = e.detail;
      if (tabsConfig.some((t) => t.id === id)) {
        setActiveTabId(id);
        localStorage.setItem("astra-active-tab", id);
      }
    };
    window.addEventListener("navigate-tab", handleNavigation);
    return () => window.removeEventListener("navigate-tab", handleNavigation);
  }, []);

  // Deep link: ?tab=<id> highlights the correct tab in the bar.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && tabsConfig.some((t) => t.id === tabParam)) {
      setActiveTabId(tabParam);
      localStorage.setItem("astra-active-tab", tabParam);
    }
  }, [searchParams]);

  // Handle GitHub OAuth callback.
  useEffect(() => {
    const token = searchParams.get("github_token");
    const error = searchParams.get("error");
    if (token) {
      setProcessingAuth(true);
      if (appUser) {
        handleGitHubCallback(token, appUser as any).then((success) => {
          if (success) router.replace("/");
          setProcessingAuth(false);
        });
      }
    } else if (error) {
      console.error("GitHub Auth Error:", error);
      router.replace("/");
    }
  }, [searchParams, appUser, router]);

  // Fall back to a visible tab if the active one is no longer permitted.
  useEffect(() => {
    if (loading) return;
    const isVisible = visibleTabs.find((t) => t.id === activeTabId);
    if (!isVisible && visibleTabs.length > 0) {
      setActiveTabId(visibleTabs[0].id);
    }
  }, [appUser, activeTabId, visibleTabs, loading]);

  // Keyboard navigation: arrows + number keys.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (isAnyDialogOpen) return;

      const currentIndex = visibleTabs.findIndex((t) => t.id === activeTabId);
      if (e.key === "ArrowRight") {
        const next = (currentIndex + 1) % visibleTabs.length;
        handleTabChange(visibleTabs[next].id);
      } else if (e.key === "ArrowLeft") {
        const prev =
          (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
        handleTabChange(visibleTabs[prev].id);
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < visibleTabs.length) handleTabChange(visibleTabs[idx].id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, visibleTabs, isAnyDialogOpen]);

  // Firebase auth user (for reminders + login dialog).
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) =>
      setUser(currentUser),
    );
    return () => unsubscribe();
  }, []);

  // Auto-lock timer + focus mode.
  const [timeLeft, setTimeLeft] = useState(3000);
  const [isActiveMode, setIsActiveMode] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("astra-active-mode");
    if (saved === "true") setIsActiveMode(true);
  }, []);

  const handleActiveModeChange = (checked: boolean) => {
    setIsActiveMode(checked);
    localStorage.setItem("astra-active-mode", String(checked));
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
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

  // Reminders subscription + due-time toast.
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const alertedReminders = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = subscribeToReminders(user.uid, (data) =>
      setReminders(data),
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      reminders.forEach((reminder) => {
        if (reminder.isCompleted || alertedReminders.current.has(reminder.id))
          return;
        const reminderDate = reminder.dateTime.toDate
          ? reminder.dateTime.toDate()
          : new Date(reminder.dateTime);
        const timeDiff = reminderDate.getTime() - now.getTime();
        if (timeDiff <= 0 && timeDiff > -60000) {
          setActiveReminder(reminder);
          setToastMessage(reminder.title);
          alertedReminders.current.add(reminder.id);
          setTimeout(() => {
            setActiveReminder((prev) =>
              prev?.id === reminder.id ? null : prev,
            );
          }, 60000);
          setTimeout(() => setToastMessage(null), 5000);
        }
      });
    };
    const interval = setInterval(checkReminders, 10000);
    return () => clearInterval(interval);
  }, [reminders]);

  const activeTab =
    visibleTabs.find((tab) => tab.id === activeTabId) || visibleTabs[0];

  if (loading || processingAuth) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <span className="text-white/40 font-medium tracking-[0.2em] text-sm animate-pulse">
          {processingAuth ? "CONNECTING TO GITHUB..." : "AUREON"}
        </span>
      </div>
    );
  }

  if (!activeTab) return null;

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

      <div className="relative z-10 h-screen">
        <TopBar
          tabs={visibleTabs}
          activeTabId={activeTabId}
          onTabChange={handleTabChange}
          counts={counts}
          nextDeadline={nextDeadline}
          background={background}
          onThemeChange={onThemeChange}
          appUser={appUser}
          currency={currency}
          setCurrency={setCurrency}
          onOpenLogin={() => setIsLoginOpen(true)}
          onOpenConverter={() => setShowConverter(true)}
          onLock={onLock}
          onLogout={handleLogout}
          isActiveMode={isActiveMode}
          onActiveModeChange={handleActiveModeChange}
          timeLeft={timeLeft}
          elevated={elevated}
        />

        {/* Scrollable Content Area */}
        <main
          onScroll={(e) => setElevated(e.currentTarget.scrollTop > 8)}
          className="w-full h-full overflow-y-auto pt-20 md:pt-24 pb-10 px-4 md:px-8 max-w-7xl mx-auto no-scrollbar"
        >
          <GreetCard
            pageTitle={activeTab.label}
            caption={activeTab.caption}
            activeReminder={activeReminder}
          />

          <QuickGlanceRibbon
            onTabSelect={(id) => {
              if (visibleTabs.some((t) => t.id === id)) handleTabChange(id);
            }}
            allowedRoles={appUser?.role ? [appUser.role] : []}
          />

          <AnimatePresence>
            {toastMessage && (
              <Toast
                message={toastMessage}
                onClose={() => setToastMessage(null)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab.id}
              initial={{ opacity: 0, y: 12, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.99 }}
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
        <CurrencyConverterDialog
          isOpen={showConverter}
          onClose={() => setShowConverter(false)}
        />
      </div>
    </div>
  );
}
