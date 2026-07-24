import { useState, useCallback, useEffect } from "react";
import { Stock, stocksService } from "../services/stocksService";
import { useUser } from "@/context/UserContext";

export const useStocks = () => {
  const { user } = useUser();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStocks = useCallback(async () => {
    if (!user?.id) {
      setStocks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await stocksService.fetchStocks(user.id);
      setStocks(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load stocks");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const createStock = async (
    stock: Pick<Stock, "symbol" | "name"> &
      Partial<Pick<Stock, "reason" | "targetPrice" | "watchPrice" | "tags">>,
  ) => {
    if (!user?.id) return false;

    try {
      const newStock = {
        userId: user.id,
        symbol: stock.symbol,
        name: stock.name,
        reason: stock.reason ?? "",
        targetPrice: stock.targetPrice ?? null,
        watchPrice: stock.watchPrice ?? null,
        tags: stock.tags ?? [],
        noteIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await stocksService.addStock(newStock);
      await loadStocks();
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to create stock");
      return false;
    }
  };

  const updateStock = async (id: string, updates: Partial<Stock>) => {
    try {
      await stocksService.updateStock(id, {
        ...updates,
        updatedAt: Date.now(),
      });
      await loadStocks();
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to update stock");
      return false;
    }
  };

  const deleteStock = async (id: string) => {
    try {
      await stocksService.deleteStock(id);
      await loadStocks();
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to delete stock");
      return false;
    }
  };

  useEffect(() => {
    loadStocks();
  }, [loadStocks]);

  return {
    stocks,
    loading,
    error,
    createStock,
    updateStock,
    deleteStock,
    refreshStocks: loadStocks,
  };
};
