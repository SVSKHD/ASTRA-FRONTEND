import api from "./api.client";

export interface ApiStateResponse<T = any> {
  ok: boolean;
  symbol: string;
  collection?: string;
  data: T | null;
  error?: string;
}

/**
 * Fetch latest state for any forex symbol
 * Symbol is passed by frontend (XAUUSD, XAGUSD, EURUSD, etc.)
 */
export async function getState<T = any>(
  symbol: string,
): Promise<ApiStateResponse<T>> {
  if (!symbol) {
    throw new Error("symbol is required");
  }

  const normalizedSymbol = symbol.trim().toUpperCase();

  const res = await api.get("/state", {
    params: { symbol: normalizedSymbol },
  });

  return res.data;
}
