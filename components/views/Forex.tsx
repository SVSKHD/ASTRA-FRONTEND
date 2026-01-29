"use client";

import { useState, useEffect, useMemo } from "react";
import { DataTable, Column } from "@/components/ui/data-table";
import { marketData, MarketItem } from "@/components/market/data/marketData";
import { columns } from "@/components/market/data/columns";
import { ForexStats } from "@/components/market/ForexStats";
import { ActiveSymbolSelector } from "@/components/market/ActiveSymbolSelector";
import {
  fetchUserBalances,
  fetchDeals,
  fetchTrades,
  UserBalance,
  Deal,
  Trade,
} from "@/utils/forex-service";
import { Wallet, Search } from "lucide-react";
import { useCurrency } from "../../hooks/useCurrency";
import { ForexChart } from "@/components/market/ForexChart";

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

  useEffect(() => {
    const fetchData = async () => {
      const balanceData = await fetchUserBalances();
      setUserBalances(balanceData);

      const dealsData = await fetchDeals();
      setDeals(dealsData);

      const tradesData = await fetchTrades();
      setTrades(tradesData);
    };

    fetchData(); // Initial fetch

    const intervalId = setInterval(fetchData, 5000); // Poll every 5 seconds

    return () => clearInterval(intervalId);
  }, []);

  // Set first account as active if none selected
  useEffect(() => {
    if (userBalances.length > 0 && !activeAccountId) {
      setActiveAccountId(userBalances[0].id);
    }
  }, [userBalances, activeAccountId]);

  const filteredBalances = userBalances.filter(
    (user) =>
      user.user_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const activeAccount = userBalances.find((u) => u.id === activeAccountId);

  // Calculate Chart Data
  const chartData = useMemo(() => {
    if (userBalances.length === 0) return [];

    let targetBalances = userBalances;
    // If we have an active account, filter to show only that user's history
    if (activeAccount) {
      targetBalances = userBalances.filter(
        (u) =>
          u.user_id === activeAccount.user_id &&
          u.login === activeAccount.login,
      );
    }

    // Map user balances to chart data
    const history = targetBalances.map((user) => ({
      // Use ts_utc if available for better sorting, otherwise date
      time: user.ts_utc
        ? new Date(user.ts_utc).getTime()
        : new Date(user.date).getTime(),
      value: user.balance,
      isReal: true,
    }));

    // Sort by time ascending
    return history.sort((a, b) => a.time - b.time);
  }, [userBalances, activeAccount]);

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
        header: "Start Price",
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

  const tradeColumns = useMemo<Column<Trade>[]>(
    () => [
      {
        key: "date",
        header: "Date",
        render: (trade) => (
          <div className="text-xs text-white/60">{trade.date}</div>
        ),
        sortable: true,
      },
      {
        key: "symbol",
        header: "Symbol",
        render: (trade) => (
          <div className="font-bold text-white">{trade.symbol}</div>
        ),
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
        render: (trade) => (
          <div className="text-xs text-white/40">
            {new Date(trade.updated_at).toLocaleTimeString()}
          </div>
        ),
      },
      {
        key: "user_id", // Using user_id as key for Profit column wrapper
        header: `Total PnL (${currencySymbol})`,
        render: (trade) => {
          const pnl =
            (trade.last_event?.payload?.risk?.total_pnl ?? 0) * exchangeRate;
          return (
            <div
              className={`font-bold ${pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : "text-white/60"}`}
            >
              {pnl > 0 ? "+" : ""}
              {currencySymbol}
              {Math.abs(pnl).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
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
      },
    ],
    [currencySymbol, exchangeRate],
  );

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
          {/* Chart Section */}
          <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-xl h-[300px] mb-6">
            <h3 className="text-lg font-semibold mb-4 px-2">Balance History</h3>
            <ForexChart data={chartData} label="Balance" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
            {/* Active Sessions (Trades) Table */}
            <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col h-full">
              <div className="mb-4 px-2">
                <h3 className="text-lg font-semibold">Daily Sessions</h3>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                <DataTable columns={tradeColumns} data={trades} perPage={5} />
              </div>
            </div>

            {/* Recent Deals Table */}
            <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col h-full">
              <div className="mb-4 px-2">
                <h3 className="text-lg font-semibold">Recent Deals</h3>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                <DataTable columns={dealColumns} data={deals} perPage={5} />
              </div>
            </div>
          </div>

          {/* Detailed Trade History */}
          <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold mb-4 px-2 flex items-center gap-2">
              <span className="w-2 h-6 bg-blue-500 rounded-full" />
              Detailed Trade Log
            </h3>
            <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
              {trades.map((trade) => (
                <TradeDetailCard
                  key={trade.id}
                  trade={trade}
                  currencySymbol={currencySymbol}
                  exchangeRate={exchangeRate}
                />
              ))}
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
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
              size={14}
            />
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
                  className={`p-3 rounded-2xl border transition-colors flex justify-between items-center group cursor-pointer ${
                    activeAccount?.id === user.id
                      ? "bg-white/10 border-blue-500/50"
                      : "bg-white/5 border-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div
                      className="font-medium text-sm text-white truncate"
                      title={user.user_id}
                    >
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

const TradeDetailCard = ({
  trade,
  currencySymbol,
  exchangeRate,
}: {
  trade: Trade;
  currencySymbol: string;
  exchangeRate: number;
}) => {
  const payload = trade.last_event?.payload;
  if (!payload) return null;

  const formatDate = (date: string) => new Date(date).toLocaleString();
  const formatMoney = (val: number) => {
    const converted = val * exchangeRate;
    return `${converted < 0 ? "-" : ""}${currencySymbol}${Math.abs(
      converted,
    ).toFixed(2)}`;
  };

  return (
    <div className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors">
      <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h4 className="font-bold text-white text-lg">{trade.symbol}</h4>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                payload.decision === "WAIT"
                  ? "bg-yellow-500/20 text-yellow-500"
                  : payload.decision.includes("SKIP")
                    ? "bg-purple-500/20 text-purple-400"
                    : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {payload.decision}
            </span>
            <span className="text-[10px] text-white/40 font-mono">
              {formatDate(trade.updated_at)}
            </span>
          </div>
          <div className="text-xs text-white/50 flex items-center gap-2">
            <span>Action: {payload.action}</span>
            <span>•</span>
            <span>Mode: {payload.mode}</span>
          </div>
        </div>

        <div className="flex items-end flex-col gap-1">
          <div className="text-2xl font-bold text-white">
            {formatMoney(payload.realized_profit_usd)}
          </div>
          <div className="text-xs text-white/40 uppercase tracking-wider">
            Realized PnL
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* Metrics */}
        <div className="space-y-2 bg-black/20 p-3 rounded-lg">
          <h5 className="font-semibold text-white/70 mb-2 border-b border-white/10 pb-1">
            Metrics
          </h5>
          <div className="flex justify-between">
            <span className="text-white/40">Pips Moved</span>
            <span className="text-white font-mono">
              {payload.pips_moved?.toFixed(1) ?? "-"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Threshold X</span>
            <span className="text-white font-mono">
              {payload.threshold_x?.toFixed(4) ?? "-"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Start Price</span>
            <span className="text-white font-mono">
              {payload.start_price?.toFixed(2) ?? "-"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Current Bid</span>
            <span className="text-white font-mono">
              {payload.current_bid?.toFixed(2) ?? "-"}
            </span>
          </div>
        </div>

        {/* Risk */}
        <div className="space-y-2 bg-black/20 p-3 rounded-lg">
          <h5 className="font-semibold text-white/70 mb-2 border-b border-white/10 pb-1">
            Risk
          </h5>
          <div className="flex justify-between">
            <span className="text-white/40">Realized Today</span>
            <span className="text-white font-mono">
              {formatMoney(payload.risk?.realized_today ?? 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Total PnL</span>
            <span className="text-white font-mono">
              {formatMoney(payload.risk?.total_pnl ?? 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Profit Lock</span>
            <span className="text-white font-mono">
              {formatMoney(payload.risk?.profit_lock ?? 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Loss Lock</span>
            <span className="text-white font-mono">
              {formatMoney(payload.risk?.loss_lock ?? 0)}
            </span>
          </div>
        </div>

        {/* Telemetry 1 */}
        {payload.telemetry && (
          <div className="space-y-2 bg-black/20 p-3 rounded-lg">
            <h5 className="font-semibold text-white/70 mb-2 border-b border-white/10 pb-1">
              Telemetry (Signal)
            </h5>
            <div className="flex justify-between">
              <span className="text-white/40">Bias</span>
              <span
                className={`uppercase font-bold ${
                  payload.telemetry.bias === "long"
                    ? "text-green-400"
                    : payload.telemetry.bias === "short"
                      ? "text-red-400"
                      : "text-white"
                }`}
              >
                {payload.telemetry.bias ?? "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Probe Up</span>
              <span className="text-white font-mono">
                {payload.telemetry.probe_up?.toFixed(2) ?? "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Probe Dn</span>
              <span className="text-white font-mono">
                {payload.telemetry.probe_dn?.toFixed(2) ?? "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Crossed 1x</span>
              <span
                className={
                  payload.telemetry.crossed_1x
                    ? "text-green-400"
                    : "text-white/40"
                }
              >
                {payload.telemetry.crossed_1x ? "YES" : "NO"}
              </span>
            </div>
          </div>
        )}

        {/* Telemetry 2 */}
        {payload.telemetry && (
          <div className="space-y-2 bg-black/20 p-3 rounded-lg">
            <h5 className="font-semibold text-white/70 mb-2 border-b border-white/10 pb-1">
              Telemetry (State)
            </h5>
            <div className="flex justify-between">
              <span className="text-white/40">X Now</span>
              <span className="text-white font-mono">
                {payload.telemetry.x_now?.toFixed(2) ?? "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Miss Reason</span>
              <span className="text-white italic">
                {payload.telemetry.miss_reason ?? "none"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Win Hits (L/S)</span>
              <span className="text-white font-mono">
                {payload.telemetry.window_hit_count_long}/
                {payload.telemetry.window_hit_count_short}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Risk Reason</span>
              <span className="text-white italic">
                {payload.telemetry.risk_reason || payload.block_reason || "ok"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
