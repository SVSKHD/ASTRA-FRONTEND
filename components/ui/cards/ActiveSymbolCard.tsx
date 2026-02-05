import { cn } from "@/lib/utils";
import { TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface ActiveSymbolCardProps {
  data: {
    pair: string;
    code?: string;
    name?: string;
    trades?: number;
  };
  onClick?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const getSymbolStyle = (pair: string) => {
  if (pair.includes("XAU") || pair.includes("GLD")) {
    return {
      code: "Au",
      name: "Gold Spot",
      gradient: "from-amber-900/20 to-amber-600/10",
      text: "text-amber-400",
      bg: "bg-amber-500/20",
      border: "border-amber-500/20",
      badgeBg: "bg-amber-500/10",
    };
  }
  if (pair.includes("XAG") || pair.includes("SLV")) {
    return {
      code: "Ag",
      name: "Silver Spot",
      gradient: "from-slate-900/30 to-slate-200/10",
      text: "text-slate-200",
      bg: "bg-slate-400/20",
      border: "border-slate-400/20",
      badgeBg: "bg-slate-400/10",
    };
  }
  return {
    code: pair.substring(0, 3) === "EUR" ? "€" : pair.substring(0, 1),
    name: "Forex Market",
    gradient: "from-blue-900/40 to-blue-600/10",
    text: "text-blue-400",
    bg: "bg-blue-500/20",
    border: "border-blue-500/20",
    badgeBg: "bg-blue-500/10",
  };
};

export const ActiveSymbolCard = ({
  data,
  onClick,
  onRefresh,
  isRefreshing,
}: ActiveSymbolCardProps) => {
  const style = getSymbolStyle(data.pair);
  const displayCode = data.code || style.code;
  const displayName = data.name || style.name;
  const displayTrades = data.trades || Math.floor(Math.random() * 10) + 1;
  return (
    <Card
      onClick={onClick}
      className={cn(
        "relative overflow-hidden group cursor-pointer transition-all duration-300 hover:border-white/20 active:scale-95 bg-gradient-to-br border-white/10",
        style.gradient,
      )}
    >
      <CardContent className="p-6">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <TrendingUp size={80} className="text-white" />
        </div>

        {onRefresh && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            disabled={isRefreshing}
            className={`absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all z-20 ${
              isRefreshing ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <RefreshCw
              size={16}
              className={isRefreshing ? "animate-spin" : ""}
            />
          </button>
        )}

        <h3 className="text-white/60 font-medium text-sm mb-1 uppercase tracking-wider">
          Active Symbol
        </h3>

        <div className="flex items-center gap-3 mb-2">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl border shadow-inner transition-colors",
              style.bg,
              style.text,
              style.border,
            )}
          >
            {displayCode}
          </div>
          <div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {data.pair}
            </div>
            <div className="text-xs text-white/40 font-medium">
              {displayName}
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg w-fit transition-colors",
            style.badgeBg,
            style.text,
          )}
        >
          <TrendingUp size={14} />
          <span>{displayTrades} Active Trades</span>
        </div>
      </CardContent>
    </Card>
  );
};
