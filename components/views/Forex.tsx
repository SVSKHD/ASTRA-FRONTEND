"use client";

import { useState, useEffect, useMemo } from "react";
import { DataTable, Column } from "@/components/ui/data-table";
import { marketData, MarketItem } from "@/components/market/data/marketData";
import { columns } from "@/components/market/data/columns";
import { ForexStats } from "@/components/market/ForexStats";
import { ActiveSymbolSelector } from "@/components/market/ActiveSymbolSelector";
import { subscribeToUserBalances, subscribeToDeals, subscribeToTrades, UserBalance, Deal, Trade } from "@/utils/forex-service";
import { Wallet, Search } from "lucide-react";
import { useCurrency } from "../../hooks/useCurrency";

export const ForexView = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<MarketItem>(
    marketData[7],
  ); // Default to Gold
  const [userBalances, setUserBalances] = useState<UserBalance[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { currencySymbol, exchangeRate, formatCurrency } = useCurrency();

  const activeAccount = userBalances.find((u) => u.id === activeAccountId);

  useEffect(() => {
    const unsubscribeBalances = subscribeToUserBalances((data) => {
      setUserBalances(data);
    });
    const unsubscribeDeals = subscribeToDeals((data) => {
      setDeals(data);
    });
    const unsubscribeTrades = subscribeToTrades((data) => {
      setTrades(data);
    });
    return () => {
      unsubscribeBalances();
      unsubscribeDeals();
      unsubscribeTrades();
    };
  }, []);

  // Set first account as active if none selected
  useEffect(() => {
    if (userBalances.length > 0 && !activeAccountId) {
      setActiveAccountId(userBalances[0].id);
    }
  }, [userBalances, activeAccountId]);

  const filteredBalances = userBalances.filter(user =>
    user.user_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const wins = deals.filter(d => d.profit_usd > 0).length;
  const losses = deals.filter(d => d.profit_usd <= 0).length;

  const dealColumns = useMemo<Column<Deal>[]>(() => [
    {
      key: "time",
      header: "Time",
      render: (deal) => <div className="text-xs text-white/60">{new Date(deal.time).toLocaleString()}</div>,
      sortable: true,
    },
    {
      key: "ticket",
      header: "Ticket",
      render: (deal) => <div className="font-mono text-xs text-white/40">#{deal.ticket}</div>,
      sortable: true,
    },
    {
      key: "symbol",
      header: "Symbol",
      render: (deal) => <div className="font-bold text-white">{deal.symbol}</div>,
      sortable: true,
    },
    {
      key: "side",
      header: "Side",
      render: (deal) => (
        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${deal.side === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
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
      header: "Start Price",
      render: (deal) => <div className="text-white/60 text-xs">{deal.price}</div>,
      sortable: true,
    },
    {
      key: "profit_usd",
      header: `Profit (${currencySymbol})`,
      render: (deal) => {
        const profit = (deal.profit_usd ?? 0) * exchangeRate;
        return (
          <div className={`font-bold ${profit > 0 ? "text-green-400" : "text-red-400"}`}>
            {profit > 0 ? "+" : ""}{currencySymbol}{Math.abs(profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        );
      },
      sortable: true,
    },
  ], [currencySymbol, exchangeRate]);

  const tradeColumns = useMemo<Column<Trade>[]>(() => [
    {
      key: "date",
      header: "Date",
      render: (trade) => <div className="text-xs text-white/60">{trade.date}</div>,
      sortable: true,
    },
    {
      key: "symbol",
      header: "Symbol",
      render: (trade) => <div className="font-bold text-white">{trade.symbol}</div>,
      sortable: true,
    },
    {
      key: "id", // Using ID for key, but rendering Start Price logic
      header: "Start Price",
      render: (trade) => (
        <div className="font-mono text-white/80">
          {trade.last_event?.payload?.start_price?.toFixed(2) || "-"}
        </div>
      ),
    },
    {
      key: "updated_at",
      header: "Last Update",
      render: (trade) => <div className="text-xs text-white/40">{new Date(trade.updated_at).toLocaleTimeString()}</div>,
    },
    {
      key: "user_id", // Using user_id as key for Profit column wrapper
      header: `Total PnL (${currencySymbol})`,
      render: (trade) => {
        const pnl = (trade.last_event?.payload?.risk?.total_pnl ?? 0) * exchangeRate;
        return (
          <div className={`font-bold ${pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : "text-white/60"}`}>
            {pnl > 0 ? "+" : ""}
            {currencySymbol}{Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        );
      },
    },
    {
      key: "last_event", // Status column - using unique key
      header: "Status",
      render: (trade) => (
        <span className="px-2 py-1 rounded-md bg-white/5 text-[10px] uppercase text-white/50 border border-white/5">
          {trade.last_event?.payload?.mode || "Unknown"}
        </span>
      ),
    }
  ], [currencySymbol, exchangeRate]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Stats & Active Symbol Selector */}
      <ForexStats activeAccount={activeAccount} wins={wins} losses={losses}>
        <ActiveSymbolSelector
          selectedSymbol={selectedSymbol}
          onSelect={setSelectedSymbol}
        />
      </ForexStats>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Market Data Table - Takes up 2 columns */}
        <div className="lg:col-span-2 space-y-6 flex flex-col">
          {/* Active Sessions (Trades) Table */}
          <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col max-h-[50%]">
            <div className="mb-4 px-2">
              <h3 className="text-lg font-semibold">
                Daily Sessions
              </h3>
            </div>
            <div className="flex-1 overflow-auto">
              <DataTable
                columns={tradeColumns}
                data={trades}
                perPage={5}
              />
            </div>
          </div>

          {/* Recent Deals Table */}
          <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col flex-1">
            <div className="mb-4 px-2">
              <h3 className="text-lg font-semibold">
                Recent Deals
              </h3>
            </div>
            <div className="flex-1 overflow-auto">
              <DataTable
                columns={dealColumns}
                data={deals}
                perPage={10}
              />
            </div>
          </div>
        </div>

        {/* User Balances Section - Takes up 1 column */}
        <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Wallet className="text-blue-400" size={20} />
              User Balances
            </h3>
            <div className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-full">
              {userBalances.length} Users
            </div>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
            <input
              type="text"
              placeholder="Search user ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredBalances.length === 0 ? (
              <div className="text-center py-8 text-white/30 text-sm">
                No users found
              </div>
            ) : (
              filteredBalances.map((user) => (
                <div
                  key={user.id}
                  onClick={() => setActiveAccountId(user.id)}
                  className={`p-3 rounded-2xl border transition-colors flex justify-between items-center group cursor-pointer ${activeAccount?.id === user.id
                    ? "bg-white/10 border-blue-500/50"
                    : "bg-white/5 border-white/5 hover:bg-white/10"
                    }`}
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="font-medium text-sm text-white truncate" title={user.user_id}>
                      {user.name || user.user_id || "Unknown User"}
                    </div>
                    <div className="text-xs text-white/40 truncate">
                      {user.user_id || "No ID"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-400">
                      {formatCurrency(user.balance ?? 0)}
                    </div>
                    <div className="text-[10px] text-white/30 uppercase">
                      Balance
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
