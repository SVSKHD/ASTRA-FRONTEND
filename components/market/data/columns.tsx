import { Column } from "@/components/ui/data-table";
import { MarketItem } from "./marketData";

import { Deal } from "@/utils/forex-service";

export const columns: Column<MarketItem>[] = [
  {
    key: "pair",
    header: "Symbol",
    sortable: true,
    render: (item) => (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/5 text-white flex items-center justify-center font-bold text-[10px] border border-white/10 shadow-inner">
          {item.pair.split("/")[0]}
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm tracking-wide">{item.pair}</span>
          <span className="text-[10px] text-white/40">Global Market</span>
        </div>
      </div>
    ),
  },
  {
    key: "price",
    header: "Price",
    sortable: true,
    render: (item) => (
      <span className="font-mono font-medium text-white/90">
        {item.price.toFixed(item.price > 100 ? 2 : 4)}
      </span>
    ),
  },
  {
    key: "change",
    header: "24h %",
    sortable: true,
    render: (item) => (
      <span
        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${item.change >= 0 ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
      >
        {item.change >= 0 ? "+" : ""}
        {item.change}%
      </span>
    ),
  },
  {
    key: "spread",
    header: "Spread",
    sortable: true,
    render: (item) => (
      <span className="text-white/50 text-xs">{item.spread}</span>
    ),
  },
  {
    key: "high",
    header: "High",
    render: (item) => (
      <span className="text-white/50 font-mono text-xs">
        {item.high.toFixed(item.price > 100 ? 2 : 4)}
      </span>
    ),
  },
  {
    key: "low",
    header: "Low",
    render: (item) => (
      <span className="text-white/50 font-mono text-xs">
        {item.low.toFixed(item.price > 100 ? 2 : 4)}
      </span>
    ),
  },
];

export const dealColumns: Column<Deal>[] = [
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
    header: "Profit",
    render: (deal) => {
      const profit = deal.profit_usd ?? 0;
      return (
        <div className={`font-bold ${profit > 0 ? "text-green-400" : "text-red-400"}`}>
          {profit > 0 ? "+" : ""}{profit.toLocaleString()}
        </div>
      );
    },
    sortable: true,
  },
];

import { Trade } from "@/utils/forex-service";

export const tradeColumns: Column<Trade>[] = [
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
    header: "Total PnL",
    render: (trade) => (
      <div className={`font-bold ${trade.last_event?.payload?.risk?.total_pnl > 0 ? "text-green-400" : trade.last_event?.payload?.risk?.total_pnl < 0 ? "text-red-400" : "text-white/60"}`}>
        {trade.last_event?.payload?.risk?.total_pnl > 0 ? "+" : ""}
        {trade.last_event?.payload?.risk?.total_pnl?.toLocaleString() || "0"}
      </div>
    ),
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
];
