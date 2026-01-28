"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useUser } from "./UserContext";

export type Currency = "USD" | "EUR" | "INR";

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  currencySymbol: string;
  exchangeRate: number; // 1 until loaded
  formatCurrency: (value: number) => string;
  loadingRates: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(
  undefined,
);

export const SYMBOLS: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  INR: "₹",
};

const STORAGE_KEY = "preferred_currency";

/* -----------------------------
   Browser currency detection
-------------------------------- */
function detectBrowserCurrency(): Currency {
  if (typeof window === "undefined") return "USD";

  const locale = (navigator.language || "").toLowerCase();
  let tz = "";

  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {}

  if (tz === "Asia/Kolkata" || locale.startsWith("en-in")) return "INR";
  if (tz.startsWith("Europe/")) return "EUR";

  return "USD";
}

export const CurrencyProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user } = useUser();

  const [currency, setCurrencyState] = useState<Currency>("USD");
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loadingRates, setLoadingRates] = useState(true);
  const [initialized, setInitialized] = useState(false);

  /* -----------------------------
     Init currency once
  -------------------------------- */
  useEffect(() => {
    if (initialized) return;

    let initial: Currency = "USD";

    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Currency | null;
      if (saved === "USD" || saved === "EUR" || saved === "INR") {
        initial = saved;
      } else {
        initial = detectBrowserCurrency();
      }
    }

    setCurrencyState(initial);
    setInitialized(true);
  }, [initialized]);

  /* -----------------------------
     Fetch exchange rates
  -------------------------------- */
  useEffect(() => {
    let alive = true;

    const fetchRates = async () => {
      try {
        const res = await fetch(
          "https://api.exchangerate-api.com/v4/latest/USD",
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Rate fetch failed");

        const data = await res.json();
        if (!alive) return;

        setRates(data?.rates ?? {});
      } catch (err) {
        console.error("Exchange rate fetch failed:", err);
      } finally {
        if (alive) setLoadingRates(false);
      }
    };

    fetchRates();
    const interval = setInterval(fetchRates, 3600000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  /* -----------------------------
     Currency setter
  -------------------------------- */
  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, c);
    }
  };

  /* -----------------------------
     Derived values
  -------------------------------- */
  const currencySymbol = SYMBOLS[currency];

  // 🔐 SAFETY: until rates load → 1
  const exchangeRate = rates[currency] ?? 1;

  const formatCurrency = (value: number) => {
    const converted = value * exchangeRate;

    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(converted);
    } catch {
      return `${currencySymbol}${converted.toFixed(2)}`;
    }
  };

  const ctxValue = useMemo(
    () => ({
      currency,
      setCurrency,
      currencySymbol,
      exchangeRate,
      formatCurrency,
      loadingRates,
    }),
    [currency, exchangeRate, loadingRates],
  );

  return (
    <CurrencyContext.Provider value={ctxValue}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrencyContext = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx)
    throw new Error("useCurrencyContext must be used within CurrencyProvider");
  return ctx;
};
