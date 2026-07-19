import { useState, useEffect } from "react";

export const useMarketData = (symbol: string) => {
  const [latestData, setLatestData] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLatestData(null);
    setHistoryData([]);
    setLoading(true);
    setError(null);

    const apiSymbol = symbol.toLowerCase();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

    const fetchLive = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/${apiSymbol}/latest`);
        if (res.ok) {
          const data = await res.json();
          setLatestData(data);
          setError(null);
        } else {
          setLatestData(null);
        }
      } catch (e) {
        console.error(`Failed to fetch live data for ${symbol}`, e);
      }
    };

    const fetchHistory = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/${apiSymbol}/history`);
        if (res.ok) {
          const data = await res.json();
          setHistoryData(data);
          setLoading(false);
        } else {
          setHistoryData([]);
          setLoading(false);
        }
      } catch (e) {
        console.error(`Failed to fetch history data for ${symbol}`, e);
        setLoading(false);
        setError("Failed to load market data");
      }
    };

    fetchLive();
    fetchHistory();

    // Polling removed - fetch on mount/change only
  }, [symbol]);

  return { latestData, historyData, loading, error };
};
