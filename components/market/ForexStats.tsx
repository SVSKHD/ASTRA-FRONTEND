import { MarketStatsCard } from "@/components/ui/cards/MarketStatsCard";
import { Wallet, Activity } from "lucide-react";
import { ReactNode } from "react";
import { useCurrency } from "../../hooks/useCurrency";

import { UserBalance } from "@/utils/forex-service";

interface ForexStatsProps {
  children?: ReactNode;
  activeAccount?: UserBalance;
  wins?: number;
  losses?: number;
}

export const ForexStats = ({ children, activeAccount, wins, losses }: ForexStatsProps) => {
  const { currencySymbol, formatCurrency } = useCurrency();

  return (
    <div className="flex-none grid grid-cols-1 md:grid-cols-3 gap-4">
      <MarketStatsCard
        title="Total Balance"
        value={activeAccount ? formatCurrency(activeAccount.balance) : `${currencySymbol}0.00`}
        icon={Wallet}
        trend={{ value: "+0.0%", isPositive: true, label: "today" }}
        gradient="from-emerald-900/40 to-emerald-600/10"
      />
      <MarketStatsCard
        title="Equity"
        value={activeAccount ? formatCurrency(activeAccount.equity) : `${currencySymbol}0.00`}
        icon={Activity}
        gradient="from-blue-900/40 to-blue-600/10" 
        subContent={
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1 text-xs text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> {wins ?? 0}
              Wins
            </div>
            <div className="flex items-center gap-1 text-xs text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> {losses ?? 0}
              Loss
            </div>
          </div>
        }
      />

      {children}
    </div>
  );
};
