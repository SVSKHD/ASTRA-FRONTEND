"use client";

import { useState, useEffect, useMemo } from "react";
import { DataTable, Column } from "@/components/ui/data-table";
import { marketData, MarketItem } from "@/components/market/data/marketData";
import { columns } from "@/components/market/data/columns";
import { ForexStats } from "@/components/market/ForexStats";
import { ActiveSymbolSelector } from "@/components/market/ActiveSymbolSelector";
import { UserBalance, Deal, Trade } from "@/utils/forex-service";
import { Wallet, Search } from "lucide-react";
import { useCurrency } from "../../hooks/useCurrency";
import { ForexChart } from "@/components/market/ForexChart";
import { generateHistory } from "@/utils/mock-market-data";

import { useMarketData } from "@/hooks/useMarketData";

const MOCK_TRADES: Trade[] = [
  {
    id: "static_1",
    user_id: "demo",
    symbol: "XAGUSD",
    status: "closed",
    pnl: 120.5,
    date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_event: {
      payload: {
        start_price: 24.5,
        mode: "SCALP",
        decision: "BUY",
        action: "ENTER",
        realized_profit_usd: 120.5,
        risk: { total_pnl: 120.5 },
      },
    },
  } as any,
  {
    id: "static_2",
    user_id: "demo",
    symbol: "XAUUSD",
    status: "closed",
    pnl: -45.2,
    date: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    last_event: {
      payload: {
        start_price: 2010.2,
        mode: "SWING",
        decision: "SKIP",
        action: "WAIT",
        realized_profit_usd: -45.2,
        risk: { total_pnl: -45.2 },
      },
    },
  } as any,
];

const MOCK_DEALS: Deal[] = [
  {
    id: "d1",
    time: new Date().toISOString(),
    ticket: 123456,
    symbol: "XAGUSD",
    type: 0,
    volume: 1.0,
    price: 24.5,
    profit_usd: 50.0,
    side: "BUY",
    login: 1001,
    swap: 0,
    commission: 0,
    comment: "",
    date: new Date().toISOString(),
    deal: 0,
    deal_id: "d1",
    entry: 0,
    fee: 0,
    magic: 0,
    order: 0,
    position_id: 0,
    time_msc: Date.now(),
    updated_at: new Date().toISOString(),
    user_id: "demo",
  },
  {
    id: "d2",
    time: new Date(Date.now() - 7200000).toISOString(),
    ticket: 123457,
    symbol: "XAUUSD",
    type: 1,
    volume: 0.5,
    price: 2005.1,
    profit_usd: -10.0,
    side: "SELL",
    login: 1001,
    swap: 0,
    commission: 0,
    comment: "",
    date: new Date(Date.now() - 7200000).toISOString(),
    deal: 0,
    deal_id: "d2",
    entry: 0,
    fee: 0,
    magic: 0,
    order: 0,
    position_id: 0,
    time_msc: Date.now() - 7200000,
    updated_at: new Date(Date.now() - 7200000).toISOString(),
    user_id: "demo",
  },
];

const MOCK_BALANCES: UserBalance[] = [
  {
    id: "u1",
    user_id: "demo_user",
    name: "Demo User",
    balance: 10000,
    equity: 10000,
    currency: "USD",
    login: 1001,
    server: "Demo",
    company: "Broker",
    active: true,
    connected: true,
    credit: 0,
    date: new Date().toISOString(),
    leverage: 100,
    limit_orders: 0,
    margin: 0,
    margin_free: 10000,
    margin_level: 0,
    ok: true,
    profit: 0,
    terminal_info: true,
    trade_mode: 0,
    ts_server: new Date().toISOString(),
    ts_utc: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
];

export const ForexView = () => {
  const [userBalances] = useState<UserBalance[]>(MOCK_BALANCES);
  const [deals] = useState<Deal[]>(MOCK_DEALS);
  const [trades] = useState<Trade[]>(MOCK_TRADES);

  const [activeAccountId, setActiveAccountId] = useState<string | null>(
    MOCK_BALANCES[0].id,
  );

  const [activeMarketItem, setActiveMarketItem] = useState<MarketItem>(
    marketData.find((m) => m.pair === "XAG/USD") || marketData[8],
  );

  const activeSymbol = activeMarketItem.pair.replace("/", "");

  const [searchQuery, setSearchQuery] = useState("");
  const { currencySymbol, exchangeRate, formatCurrency } = useCurrency();

  const { latestData: latestMarketData, historyData: historyMarketData } =
    useMarketData(activeSymbol);

  const activeAccount = userBalances.find((u: any) => u.id === activeAccountId);

  const liveAccount = useMemo(() => {
    if (latestMarketData && latestMarketData.balance_snapshot) {
      return {
        ...activeAccount,
        balance: latestMarketData.balance_snapshot.balance,
        equity: latestMarketData.balance_snapshot.equity,
        profit: latestMarketData.balance_snapshot.profit,
      } as UserBalance;
    }
    return activeAccount;
  }, [activeAccount, latestMarketData]);

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

  const chartData = useMemo(() => {
    if (historyMarketData.length > 0) {
      return historyMarketData
        .filter((item) => item && item.balance_snapshot)
        .map((item) => ({
          time: item.ts,
          value: item.balance_snapshot.balance,
          isReal: true,
        }));
    }

    const baseValue = liveAccount?.balance || 10000;
    return generateHistory(baseValue, 24).map((point: any) => ({
      ...point,
      isReal: true,
    }));
  }, [liveAccount, historyMarketData]);

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
          <div className="text-xs text-white/60">
            {new Date(trade.date).toLocaleString()}
          </div>
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
        key: "id",
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
        key: "user_id",
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
        key: "last_event",
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
      <ForexStats activeAccount={liveAccount} wins={wins} losses={losses}>
        <ActiveSymbolSelector
          selectedSymbol={activeMarketItem}
          onSelect={setActiveMarketItem}
        />
      </ForexStats>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-2 space-y-6 flex flex-col">
          <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-xl h-[300px] mb-6">
            <h3 className="text-lg font-semibold mb-4 px-2">Balance History</h3>
            <ForexChart data={chartData} label="Balance" />
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col h-[400px]">
              <div className="mb-4 px-2">
                <h3 className="text-lg font-semibold">Daily Sessions</h3>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                <DataTable columns={tradeColumns} data={trades} perPage={5} />
              </div>
            </div>

            <div className="bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col h-[400px]">
              <div className="mb-4 px-2">
                <h3 className="text-lg font-semibold">Recent Deals</h3>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                <DataTable columns={dealColumns} data={deals} perPage={5} />
              </div>
            </div>
          </div>

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
      </div>
    </div>
  );
};
