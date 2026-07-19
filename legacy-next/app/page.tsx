"use client";

import { useEffect, useState, Suspense } from "react";
import Dashboard from "../components/Dashboard";
import LockScreen from "../components/LockScreen";
import { useUser } from "@/context/UserContext";

export default function Home() {
  const [isLocked, setIsLocked] = useState(true);
  const { user, updateUser, loading } = useUser();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        setIsLocked(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Check persistence
    const savedMode = localStorage.getItem("astra-active-mode");
    if (savedMode === "true") {
      setIsLocked(false);
    }

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleThemeChange = async (newTheme: string) => {
    if (user) {
      await updateUser({ theme: newTheme });
    }
  };

  if (loading) return null;
  const currentTheme = user?.theme || "#000000";

  return (
    <div
      className="relative w-full h-full min-h-screen overflow-hidden text-transparent"
      style={{ color: "unset", background: "transparent" }}
    >
      <LockScreen
        isLocked={isLocked}
        onUnlock={() => setIsLocked(false)}
        background={currentTheme}
      />
      <div
        className={
          isLocked
            ? "blur-sm scale-[0.98] opacity-50 transition-all duration-500 min-h-screen"
            : "transition-all duration-500 min-h-screen"
        }
      >
        <Suspense fallback={<div className="min-h-screen" />}>
          <Dashboard
            onLock={() => setIsLocked(true)}
            background={currentTheme}
            onThemeChange={handleThemeChange}
          />
        </Suspense>
      </div>
    </div>
  );
}
