import { useState, useEffect, useMemo } from "react";
import { MarketStatsCard } from "@/components/ui/cards/MarketStatsCard";
import { Wallet, Activity } from "lucide-react";
import {
  subscribeToUserBalances,
  subscribeToDeals,
  UserBalance,
  Deal,
} from "@/utils/forex-service";
import { DataTable, Column } from "@/components/ui/data-table";
import { useCurrency } from "../../hooks/useCurrency";

export const OverviewView = () => {
  const [userBalances, setUserBalances] = useState<UserBalance[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activeAccount, setActiveAccount] = useState<UserBalance | undefined>(
    undefined,
  );
  const { currencySymbol, exchangeRate, formatCurrency } = useCurrency();

  useEffect(() => {
    const unsubscribeBalances = subscribeToUserBalances((data) => {
      setUserBalances(data);
    });
    const unsubscribeDeals = subscribeToDeals((data) => {
      setDeals(data);
    });
    return () => {
      unsubscribeBalances();
      unsubscribeDeals();
    };
  }, []);

  useEffect(() => {
    if (userBalances.length > 0 && !activeAccount) {
      setActiveAccount(userBalances[0]);
    }
  }, [userBalances, activeAccount]);

  // Calculate Wins/Losses
  const wins = deals.filter((d) => d.profit_usd > 0).length;
  const losses = deals.filter((d) => d.profit_usd <= 0).length;

  const dealColumns = useMemo<Column<Deal>[]>(
    () => [
      {
        key: "time",
        header: "Time",
        render: (deal) => (
          <div className="text-xs text-white/60">
            {new Date(deal.time).toLocaleString()}
          </div>
        ),
        sortable: true,
      },
      {
        key: "ticket",
        header: "Ticket",
        render: (deal) => (
          <div className="font-mono text-xs text-white/40">#{deal.ticket}</div>
        ),
        sortable: true,
      },
      {
        key: "symbol",
        header: "Symbol",
        render: (deal) => (
          <div className="font-bold text-white">{deal.symbol}</div>
        ),
        sortable: true,
      },
      {
        key: "side",
        header: "Side",
        render: (deal) => (
          <span
            className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${deal.side === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
          >
            {deal.side}
          </span>
        ),
        sortable: true,
      },
      {
        key: "volume",
        header: "Volume",
        render: (deal) => <div className="text-white/80">{deal.volume}</div>,
        sortable: true,
      },
      {
        key: "price",
        header: "Price",
        render: (deal) => (
          <div className="text-white/60 text-xs">{deal.price}</div>
        ),
        sortable: true,
      },
      {
        key: "profit_usd",
        header: `Profit (${currencySymbol})`,
        render: (deal) => {
          const profit = (deal.profit_usd ?? 0) * exchangeRate;
          return (
            <div
              className={`font-bold ${profit > 0 ? "text-green-400" : "text-red-400"}`}
            >
              {profit > 0 ? "+" : ""}
              {currencySymbol}
              {Math.abs(profit).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          );
        },
        sortable: true,
      },
    ],
    [currencySymbol, exchangeRate],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MarketStatsCard
          title="Total Balance"
          value={
            activeAccount
              ? formatCurrency(activeAccount.balance ?? 0)
              : `${currencySymbol}0.00`
          }
          icon={Wallet}
          trend={{ value: "+0.0%", isPositive: true, label: "today" }}
          gradient="from-emerald-900/40 to-emerald-600/10"
        />
        <MarketStatsCard
          title="Equity"
          value={
            activeAccount
              ? formatCurrency(activeAccount.equity ?? 0)
              : `${currencySymbol}0.00`
          }
          icon={Activity}
          gradient="from-blue-900/40 to-blue-600/10"
          subContent={
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1 text-xs text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>{" "}
                {wins}
                Wins
              </div>
              <div className="flex items-center gap-1 text-xs text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>{" "}
                {losses}
                Loss
              </div>
            </div>
          }
        />
      </div>

      <div className="rounded-3xl bg-black/10 backdrop-blur-2xl border border-white/20 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        <div className="mb-4 px-2">
          <h3 className="text-lg font-semibold">Activity</h3>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
          <DataTable columns={dealColumns} data={deals} perPage={5} />
        </div>
      </div>
    </div>
  );
};
