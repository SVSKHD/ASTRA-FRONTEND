"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { DataTable, Column } from "@/components/ui/data-table";
import { CryptoChart } from "@/components/market/CryptoChart";
import { useCurrency } from "@/hooks/useCurrency";
import { Wallet, TrendingUp, Activity, ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: string;
  high: number;
  low: number;
}

interface CryptoSymbolOption {
  id: string;
  symbol: string;
  name: string;
  stream: string;
  klineSymbol: string;
  pair: string;
  gradientFrom: string;
  gradientTo: string;
  accent: string;
  badgeBg: string;
  color: string;
}

interface SymbolStats {
  changePercent: number;
  high: number;
  low: number;
  volume: number;
}

const cryptoSymbols: CryptoSymbolOption[] = [
  {
    id: "BTCUSDT",
    symbol: "BTC",
    name: "Bitcoin",
    stream: "btcusdt",
    klineSymbol: "BTCUSDT",
    pair: "BTC/USDT",
    gradientFrom: "rgba(247, 147, 26, 0.2)",
    gradientTo: "rgba(247, 147, 26, 0.05)",
    accent: "#F7931A",
    badgeBg: "rgba(247, 147, 26, 0.12)",
    color: "#F7931A",
  },
  {
    id: "ETHUSDT",
    symbol: "ETH",
    name: "Ethereum",
    stream: "ethusdt",
    klineSymbol: "ETHUSDT",
    pair: "ETH/USDT",
    gradientFrom: "rgba(98, 126, 234, 0.2)",
    gradientTo: "rgba(98, 126, 234, 0.05)",
    accent: "#627EEA",
    badgeBg: "rgba(98, 126, 234, 0.12)",
    color: "#627EEA",
  },
  {
    id: "BNBUSDT",
    symbol: "BNB",
    name: "BNB",
    stream: "bnbusdt",
    klineSymbol: "BNBUSDT",
    pair: "BNB/USDT",
    gradientFrom: "rgba(243, 186, 47, 0.2)",
    gradientTo: "rgba(243, 186, 47, 0.05)",
    accent: "#F3BA2F",
    badgeBg: "rgba(243, 186, 47, 0.12)",
    color: "#F3BA2F",
  },
  {
    id: "XRPUSDT",
    symbol: "XRP",
    name: "Ripple",
    stream: "xrpusdt",
    klineSymbol: "XRPUSDT",
    pair: "XRP/USDT",
    gradientFrom: "rgba(37, 167, 104, 0.2)",
    gradientTo: "rgba(37, 167, 104, 0.05)",
    accent: "#25A768",
    badgeBg: "rgba(37, 167, 104, 0.12)",
    color: "#25A768",
  },
];

const cryptoData: CryptoCoin[] = [
  {
    id: "1",
    symbol: "BTC",
    name: "Bitcoin",
    price: 43250.5,
    change: 2.5,
    volume: "1.2B",
    high: 43500.0,
    low: 42800.0,
  },
  {
    id: "2",
    symbol: "ETH",
    name: "Ethereum",
    price: 2350.2,
    change: 1.8,
    volume: "850M",
    high: 2380.0,
    low: 2320.0,
  },
  {
    id: "3",
    symbol: "SOL",
    name: "Solana",
    price: 98.5,
    change: 5.2,
    volume: "350M",
    high: 102.0,
    low: 95.0,
  },
  {
    id: "4",
    symbol: "XRP",
    name: "Ripple",
    price: 0.52,
    change: -1.2,
    volume: "120M",
    high: 0.54,
    low: 0.51,
  },
  {
    id: "5",
    symbol: "BNB",
    name: "Binance Coin",
    price: 305.8,
    change: 0.5,
    volume: "95M",
    high: 308.0,
    low: 302.0,
  },
];

const columns: Column<CryptoCoin>[] = [
  {
    key: "symbol",
    header: "Asset",
    sortable: true,
    render: (item) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/20">
          {item.symbol[0]}
        </div>
        <div>
          <div className="font-semibold">{item.name}</div>
          <div className="text-xs text-white/40">{item.symbol}</div>
        </div>
      </div>
    ),
  },
  {
    key: "price",
    header: "Price ($)",
    sortable: true,
    render: (item) => (
      <span className="font-mono">
        $
        {item.price.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    ),
  },
  {
    key: "change",
    header: "24h Change",
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
      <span className="text-white/60 font-mono">
        $
        {item.high.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    ),
  },
  {
    key: "low",
    header: "Low",
    render: (item) => (
      <span className="text-white/60 font-mono">
        $
        {item.low.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    ),
  },
];

const abbreviateNumber = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1e12) {
    return `${(value / 1e12).toFixed(2)}T`;
  }
  if (abs >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  }
  if (abs >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  }
  return value.toFixed(2);
};

export const CryptoView = () => {
  const { currencySymbol, formatCurrency, convertPrice } = useCurrency();
  const [selectedSymbol, setSelectedSymbol] = useState<CryptoSymbolOption>(
    cryptoSymbols[0],
  );
  const [chartDataRaw, setChartDataRaw] = useState<
    { time: number; value: number }[]
  >([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [timeFrame, setTimeFrame] = useState("1H");
  const [isLoading, setIsLoading] = useState(false);
  const [showSymbolSelector, setShowSymbolSelector] = useState(false);
  const [symbolStats, setSymbolStats] = useState<SymbolStats | null>(null);
  const timeFrameRef = useRef(timeFrame);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCloseRef = useRef(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showSymbolSelector) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectorRef.current &&
        !selectorRef.current.contains(event.target as Node)
      ) {
        setShowSymbolSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSymbolSelector]);

  useEffect(() => {
    setChartDataRaw([]);
    setCurrentPrice(null);
    setSymbolStats(null);
  }, [selectedSymbol]);

  useEffect(() => {
    timeFrameRef.current = timeFrame;
  }, [timeFrame]);

  useEffect(() => {
    manualCloseRef.current = false;

    const connect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const socket = new WebSocket(
        `wss://stream.binance.com:9443/ws/${selectedSymbol.stream}@trade`,
      );

      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const priceUSD = parseFloat(data.p);
          const time = data.T;

          if (!Number.isFinite(priceUSD)) {
            return;
          }

          setCurrentPrice(priceUSD);

          if (timeFrameRef.current === "Live") {
            setChartDataRaw((prev) => {
              const next = [...prev, { time, value: priceUSD }];
              if (next.length > 100) {
                return next.slice(next.length - 100);
              }
              return next;
            });
          }
        } catch (error) {
          console.warn("Failed to parse Binance trade update", error);
        }
      };

      socket.onerror = (event) => {
        if (!manualCloseRef.current) {
          console.warn(
            "Binance stream error detected, attempting to reconnect.",
            event,
          );
        }
      };

      socket.onclose = (event) => {
        wsRef.current = null;
        if (!manualCloseRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      manualCloseRef.current = true;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const activeSocket = wsRef.current;

      if (activeSocket) {
        activeSocket.onclose = null;
        if (
          activeSocket.readyState === WebSocket.OPEN ||
          activeSocket.readyState === WebSocket.CONNECTING
        ) {
          activeSocket.close(1000, "component unmount");
        }
      }

      wsRef.current = null;
    };
  }, [selectedSymbol.stream]);

  useEffect(() => {
    if (timeFrame === "Live") {
      setIsLoading(false);
      setChartDataRaw([]);
      return;
    }

    let isMounted = true;

    const fetchHistoricalData = async () => {
      setIsLoading(true);
      setChartDataRaw([]);

      try {
        let interval = "1h";
        let limit = 24;

        switch (timeFrame) {
          case "1H":
            interval = "1m";
            limit = 60;
            break;
          case "1D":
            interval = "5m";
            limit = 288;
            break;
          case "1W":
            interval = "1h";
            limit = 168;
            break;
          case "1M":
            interval = "4h";
            limit = 180;
            break;
          case "1Y":
            interval = "1d";
            limit = 365;
            break;
          case "5Y":
            interval = "1w";
            limit = 260;
            break;
          case "MAX":
            interval = "1M";
            limit = 1000;
            break;
        }

        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${selectedSymbol.klineSymbol}&interval=${interval}&limit=${limit}`,
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch historical data for ${selectedSymbol.symbol}`,
          );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Unexpected response from Binance");
        }

        const formattedData = data.map((item: any) => ({
          time: item[0],
          value: parseFloat(item[4]),
        }));

        if (isMounted) {
          setChartDataRaw(formattedData);
        }
      } catch (error) {
        console.error("Failed to fetch historical data", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchHistoricalData();

    return () => {
      isMounted = false;
    };
  }, [timeFrame, selectedSymbol]);

  useEffect(() => {
    let isMounted = true;

    const fetchSymbolStats = async () => {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${selectedSymbol.klineSymbol}`,
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch stats for ${selectedSymbol.symbol}`);
        }

        const data = await response.json();

        if (isMounted) {
          setSymbolStats({
            changePercent: parseFloat(data.priceChangePercent),
            high: parseFloat(data.highPrice),
            low: parseFloat(data.lowPrice),
            volume: parseFloat(data.volume),
          });
        }
      } catch (error) {
        console.error("Failed to fetch symbol stats", error);
      }
    };

    fetchSymbolStats();

    return () => {
      isMounted = false;
    };
  }, [selectedSymbol]);

  const chartData = useMemo(
    () =>
      chartDataRaw.map((point) => ({
        time: point.time,
        value: convertPrice(point.value),
      })),
    [chartDataRaw, convertPrice],
  );

  const displayPrice =
    currentPrice ??
    (chartDataRaw.length > 0
      ? chartDataRaw[chartDataRaw.length - 1].value
      : null);

  const currentColumns: Column<CryptoCoin>[] = useMemo(() => {
    return columns.map((col) => {
      if (col.key === "price") {
        return {
          ...col,
          header: `Price (${currencySymbol})`,
          render: (item) => (
            <span className="font-mono">{formatCurrency(item.price)}</span>
          ),
        };
      }
      if (col.key === "high") {
        return {
          ...col,
          header: `High (${currencySymbol})`,
          render: (item) => (
            <span className="text-white/60 font-mono">
              {formatCurrency(item.high)}
            </span>
          ),
        };
      }
      if (col.key === "low") {
        return {
          ...col,
          header: `Low (${currencySymbol})`,
          render: (item) => (
            <span className="text-white/60 font-mono">
              {formatCurrency(item.low)}
            </span>
          ),
        };
      }
      return col;
    });
  }, [currencySymbol, formatCurrency]);

  const tableData = useMemo<CryptoCoin[]>(() => {
    return cryptoData.map((item) => {
      if (item.symbol !== selectedSymbol.symbol) {
        return item;
      }

      const next: CryptoCoin = {
        ...item,
        price: displayPrice ?? item.price,
        change:
          symbolStats?.changePercent !== undefined
            ? symbolStats.changePercent
            : item.change,
        high: symbolStats?.high !== undefined ? symbolStats.high : item.high,
        low: symbolStats?.low !== undefined ? symbolStats.low : item.low,
        volume:
          symbolStats?.volume !== undefined
            ? `${abbreviateNumber(symbolStats.volume)}`
            : item.volume,
      };

      return next;
    });
  }, [selectedSymbol.symbol, displayPrice, symbolStats]);

  const changePercent = symbolStats?.changePercent ?? null;
  const badgeBackground =
    changePercent === null
      ? selectedSymbol.badgeBg
      : changePercent >= 0
        ? "rgba(34, 197, 94, 0.15)"
        : "rgba(248, 113, 113, 0.15)";
  const badgeTextColor =
    changePercent === null
      ? selectedSymbol.accent
      : changePercent >= 0
        ? "#34D399"
        : "#F87171";

  return (
    <div className="space-y-6 h-full flex flex-col pb-20 md:pb-0">
      <div className="flex-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-900/20 to-indigo-600/10 backdrop-blur-xl border border-white/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={80} />
          </div>
          <h3 className="text-white/60 font-medium text-sm mb-1">
            Total Balance
          </h3>
          <div className="text-2xl lg:text-3xl font-bold text-white mb-2">
            {formatCurrency(45231.5)}
          </div>
          <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium bg-emerald-500/10 w-fit px-2 py-1 rounded-lg">
            <ArrowUpRight size={12} />
            <span>+2.4% today</span>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-900/20 to-purple-600/10 backdrop-blur-xl border border-white/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Activity size={80} />
          </div>
          <h3 className="text-white/60 font-medium text-sm mb-1">
            Open Positions
          </h3>
          <div className="text-2xl lg:text-3xl font-bold text-white mb-2">
            3
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-white/50">
              <span className="w-2 h-2 rounded-full bg-green-500"></span> 2 Long
            </div>
            <div className="flex items-center gap-1 text-xs text-white/50">
              <span className="w-2 h-2 rounded-full bg-red-500"></span> 1 Short
            </div>
          </div>
        </div>

        <div
          ref={selectorRef}
          className={`relative p-6 rounded-3xl backdrop-blur-xl border border-white/10 group sm:col-span-2 lg:col-span-1 cursor-pointer transition-colors ${showSymbolSelector ? "z-50" : "z-10"}`}
          style={{
            background: `linear-gradient(135deg, ${selectedSymbol.gradientFrom}, ${selectedSymbol.gradientTo})`,
          }}
          onClick={() => setShowSymbolSelector((prev) => !prev)}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={80} />
          </div>
          <h3 className="text-white/60 font-medium text-sm mb-1">
            {selectedSymbol.name} Live
          </h3>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold border"
              style={{
                backgroundColor: selectedSymbol.badgeBg,
                borderColor: selectedSymbol.accent,
                color: selectedSymbol.accent,
              }}
            >
              {selectedSymbol.symbol}
            </div>
            <div>
              <div className="text-xl lg:text-2xl font-bold text-white">
                {displayPrice !== null
                  ? formatCurrency(displayPrice)
                  : "Loading..."}
              </div>
              <div className="text-[10px] text-white/40">
                {selectedSymbol.pair}
              </div>
            </div>
          </div>
          <div
            className="flex items-center gap-1 text-xs font-medium w-fit px-2 py-1 rounded-lg"
            style={{
              backgroundColor: badgeBackground,
              color: badgeTextColor,
            }}
          >
            {changePercent !== null ? (
              <>
                <ArrowUpRight
                  size={12}
                  className={changePercent >= 0 ? "" : "rotate-90"}
                />
                <span>
                  {changePercent >= 0 ? "+" : ""}
                  {changePercent.toFixed(2)}% (24h)
                </span>
              </>
            ) : (
              <span>Live Stream</span>
            )}
          </div>
          {symbolStats && (
            <div className="mt-3 text-[10px] text-white/50 flex items-center gap-3">
              <span>24h High: {formatCurrency(symbolStats.high)}</span>
              <span className="hidden sm:inline-block">
                24h Low: {formatCurrency(symbolStats.low)}
              </span>
              <span className="hidden md:inline-block">
                24h Vol: {abbreviateNumber(symbolStats.volume)}{" "}
                {selectedSymbol.symbol}
              </span>
            </div>
          )}

          <AnimatePresence>
            {showSymbolSelector && (
              <motion.div
                key="crypto-selector"
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 right-0 z-50 mt-2"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="rounded-3xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-white/60">
                    <span className="flex items-center gap-2 font-semibold">
                      <TrendingUp size={12} />
                      Select Symbol
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-white/50 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowSymbolSelector(false);
                      }}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {cryptoSymbols.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedSymbol(option);
                          setShowSymbolSelector(false);
                        }}
                        className={`w-full flex items-center justify-between gap-4 rounded-2xl border px-3 py-2 text-left transition-all ${
                          selectedSymbol.id === option.id
                            ? "border-white/20 bg-white/10 shadow-sm"
                            : "border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs border"
                            style={{
                              backgroundColor: option.badgeBg,
                              borderColor: option.accent,
                              color: option.accent,
                            }}
                          >
                            {option.symbol}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {option.name}
                            </div>
                            <div className="text-[10px] text-white/40 uppercase">
                              {option.pair}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-white/60">
                            {option.id === selectedSymbol.id &&
                            displayPrice !== null
                              ? formatCurrency(displayPrice)
                              : "--"}
                          </span>
                          <span className="text-[10px] text-white/30">
                            {option.id === selectedSymbol.id &&
                            changePercent !== null
                              ? `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`
                              : "Live"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-none bg-black/20 backdrop-blur-xl rounded-3xl border border-white/10 p-4 md:p-6 h-[500px] flex flex-col">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold text-white">
            {selectedSymbol.symbol}/{currencySymbol}{" "}
            {timeFrame === "Live" ? "Live Chart" : `${timeFrame} Chart`}
          </h3>
          <div className="overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 no-scrollbar">
            <div className="flex items-center bg-black/40 rounded-lg p-1 gap-1 w-max">
              {["Live", "1H", "1D", "1W", "1M", "1Y", "5Y", "MAX"].map((tf) => (
                <Button
                  key={tf}
                  variant={timeFrame === tf ? "default" : "ghost"}
                  size="sm"
                  className={`h-7 px-3 text-xs ${timeFrame === tf ? "bg-white/20 text-white" : "text-white/50 hover:text-white hover:bg-white/10"}`}
                  onClick={() => setTimeFrame(tf)}
                >
                  {tf}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20 backdrop-blur-sm">
              <div className="text-white text-sm">Loading...</div>
            </div>
          )}
          <CryptoChart
            data={chartData}
            label={`${selectedSymbol.symbol}/${currencySymbol}`}
            color={selectedSymbol.color}
            timeFrame={timeFrame}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <DataTable
          data={tableData}
          columns={currentColumns}
          searchKeys={["symbol", "name"]}
          perPage={5}
          className="h-full"
        />
      </div>
    </div>
  );
};
