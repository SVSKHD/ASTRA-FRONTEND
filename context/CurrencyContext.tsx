"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useUser } from "./UserContext";

export type Currency = "USD" | "EUR" | "INR";

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  currencySymbol: string;
  exchangeRate: number;
  formatCurrency: (value: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 0.92,
  INR: 83.12,
};

export const SYMBOLS: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  INR: "₹",
};

export const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUser();
  const [currency, setCurrencyState] = useState<Currency>("USD");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (user && !initialized) {
        if (user.email === "rishivarma9090@gmail.com") {
            setCurrencyState("EUR");
        }
        setInitialized(true);
    }
  }, [user, initialized]);

  const currencySymbol = SYMBOLS[currency];
  const exchangeRate = RATES[currency];

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
  };

  const formatCurrency = (value: number) => {
    // Value is always assumed to be in USD base
    const converted = value * exchangeRate;
    return `${currencySymbol}${converted.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        currencySymbol,
        exchangeRate,
        formatCurrency,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrencyContext = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrencyContext must be used within a CurrencyProvider");
  }
  return context;
};
