import { DataTable, Column } from "@/components/ui/data-table";
import { useCurrency } from "@/hooks/useCurrency";
import { Wallet, TrendingUp, Activity, ArrowUpRight } from "lucide-react";

interface IndianStock {
  id: string;
  symbol: string;
  price: number;
  change: number;
  volume: string;
  high: number;
  low: number;
}

const stockData: IndianStock[] = [
  {
    id: "1",
    symbol: "RELIANCE",
    price: 2980.5,
    change: 1.25,
    volume: "2.4M",
    high: 2995.0,
    low: 2950.0,
  },
  {
    id: "2",
    symbol: "TCS",
    price: 4120.0,
    change: -0.45,
    volume: "850K",
    high: 4150.0,
    low: 4100.0,
  },
  {
    id: "3",
    symbol: "HDFCBANK",
    price: 1450.75,
    change: 0.8,
    volume: "5.1M",
    high: 1460.0,
    low: 1440.0,
  },
  {
    id: "4",
    symbol: "INFY",
    price: 1620.3,
    change: 0.5,
    volume: "1.2M",
    high: 1630.0,
    low: 1610.0,
  },
  {
    id: "5",
    symbol: "ICICIBANK",
    price: 1080.0,
    change: -0.2,
    volume: "3.5M",
    high: 1090.0,
    low: 1070.0,
  },
  {
    id: "6",
    symbol: "SBIN",
    price: 760.4,
    change: 1.5,
    volume: "4.8M",
    high: 765.0,
    low: 750.0,
  },
  {
    id: "7",
    symbol: "TATAMOTORS",
    price: 980.1,
    change: 2.1,
    volume: "6.2M",
    high: 985.0,
    low: 960.0,
  },
];

const columns: Column<IndianStock>[] = [
  {
    key: "symbol",
    header: "Symbol",
    sortable: true,
    render: (item) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/20">
          {item.symbol[0]}
        </div>
        <span className="font-semibold">{item.symbol}</span>
      </div>
    ),
  },
  {
    key: "price",
    header: "Price (₹)",
    sortable: true,
    render: (item) => (
      <span className="font-mono">₹{item.price.toFixed(2)}</span>
    ),
  },
  {
    key: "change",
    header: "Change",
    sortable: true,
    render: (item) => (
      <span
        className={`px-2 py-1 rounded-md text-xs font-medium ${item.change >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
      >
        {item.change >= 0 ? "+" : ""}
        {item.change}%
      </span>
    ),
  },
  {
    key: "volume",
    header: "Volume",
    sortable: true,
    render: (item) => <span className="text-white/60">{item.volume}</span>,
  },
  {
    key: "high",
    header: "High",
    render: (item) => (
      <span className="text-white/60 font-mono">{item.high.toFixed(2)}</span>
    ),
  },
  {
    key: "low",
    header: "Low",
    render: (item) => (
      <span className="text-white/60 font-mono">{item.low.toFixed(2)}</span>
    ),
  },
];

export const IndianView = () => {
  const { currencySymbol, formatCurrency } = useCurrency();
  const INR_RATE = 83.12;

  const getDisplayValue = (inrValue: number) => {
    return formatCurrency(inrValue / INR_RATE);
  };

  const currentColumns: Column<IndianStock>[] = columns.map((col) => {
    if (col.key === "price") {
      return {
        ...col,
        header: `Price (${currencySymbol})`,
        render: (item) => (
          <span className="font-mono">{getDisplayValue(item.price)}</span>
        ),
      };
    }
    if (col.key === "high") {
      return {
        ...col,
        header: "High",
        render: (item) => (
          <span className="text-white/60 font-mono">
            {getDisplayValue(item.high)}
          </span>
        ),
      };
    }
    if (col.key === "low") {
      return {
        ...col,
        header: "Low",
        render: (item) => (
          <span className="text-white/60 font-mono">
            {getDisplayValue(item.low)}
          </span>
        ),
      };
    }
    return col;
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Stats Grid */}
      <div className="flex-none grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Balance Card */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-900/20 to-indigo-600/10 backdrop-blur-xl border border-white/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={80} />
          </div>
          <h3 className="text-white/60 font-medium text-sm mb-1">
            Portfolio Value
          </h3>
          <div className="text-3xl font-bold text-white mb-2">
            {getDisplayValue(1245000)}
          </div>
          <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium bg-emerald-500/10 w-fit px-2 py-1 rounded-lg">
            <ArrowUpRight size={12} />
            <span>+1.8% today</span>
          </div>
        </div>

        {/* Trades Card */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-900/20 to-purple-600/10 backdrop-blur-xl border border-white/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Activity size={80} />
          </div>
          <h3 className="text-white/60 font-medium text-sm mb-1">
            Active Positions
          </h3>
          <div className="text-3xl font-bold text-white mb-2">4</div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-white/50">
              <span className="w-2 h-2 rounded-full bg-green-500"></span> 3
              Profitable
            </div>
            <div className="flex items-center gap-1 text-xs text-white/50">
              <span className="w-2 h-2 rounded-full bg-red-500"></span> 1 Loss
            </div>
          </div>
        </div>

        {/* Active Symbol Card */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-orange-900/20 to-orange-600/10 backdrop-blur-xl border border-white/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={80} />
          </div>
          <h3 className="text-white/60 font-medium text-sm mb-1">
            Top Performer
          </h3>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold border border-orange-500/20">
              R
            </div>
            <div>
              <div className="text-xl font-bold text-white">RELIANCE</div>
              <div className="text-[10px] text-white/40">NSE Eq</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-orange-400 text-xs font-medium bg-orange-500/10 w-fit px-2 py-1 rounded-lg">
            <span>+1.25%</span>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          data={stockData}
          columns={currentColumns}
          searchKeys={["symbol"]}
          perPage={5}
          className="h-full"
        />
      </div>
    </div>
  );
};
