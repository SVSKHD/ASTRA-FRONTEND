import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";

// Isolated so the per-second tick doesn't re-render the whole top bar.
export const LiveClock: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString([], { weekday: "short", day: "numeric" });

  return (
    <div
      className="flex items-center gap-2 px-3 h-9 rounded-full bg-white/5 border border-white/5 shrink-0"
      title={now.toLocaleString()}
    >
      <Clock size={14} className="text-white/40 shrink-0" />
      <span className="text-sm font-mono font-medium text-white/80 tabular-nums">
        {time}
      </span>
      {!compact && (
        <span className="hidden xl:inline text-xs text-white/40">{date}</span>
      )}
    </div>
  );
};
