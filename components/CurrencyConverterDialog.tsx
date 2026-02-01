import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRightLeft, DollarSign, Euro, IndianRupee } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { Currency } from "@/context/CurrencyContext";

interface CurrencyConverterDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SYMBOLS: Record<string, React.ReactNode> = {
  USD: <DollarSign size={16} />,
  EUR: <Euro size={16} />,
  INR: <IndianRupee size={16} />,
};

export const CurrencyConverterDialog = ({
  isOpen,
  onClose,
}: CurrencyConverterDialogProps) => {
  const { rates, currency: contextCurrency } = useCurrency();
  const [amount, setAmount] = useState<number | "">("");
  const [fromCurrency, setFromCurrency] = useState<Currency>(contextCurrency);
  const [toCurrency, setToCurrency] = useState<Currency>(
    contextCurrency === "USD" ? "EUR" : "USD",
  );
  const [result, setResult] = useState<number | null>(null);

  // Update default fromCurrency when dialog opens or context changes
  useEffect(() => {
    if (isOpen) {
      setFromCurrency(contextCurrency);
      setToCurrency(contextCurrency === "USD" ? "EUR" : "USD"); // Simple toggle for target
    }
  }, [isOpen, contextCurrency]);

  useEffect(() => {
    if (typeof amount === "number" && rates) {
      // Rates are base USD.
      // Amount in USD = Amount / Rate(From)
      // Result = Amount in USD * Rate(To)
      const rateFrom = rates[fromCurrency] || 1;
      const rateTo = rates[toCurrency] || 1;

      const inUSD = amount / rateFrom;
      const converted = inUSD * rateTo;
      setResult(converted);
    } else {
      setResult(null);
    }
  }, [amount, fromCurrency, toCurrency, rates]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-medium text-white">Converter</h2>
              <button
                onClick={onClose}
                className="p-2 text-white/40 hover:text-white rounded-full hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Amount Input */}
              <div className="space-y-2">
                <label className="text-sm text-white/40">Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value ? Number(e.target.value) : "")
                    }
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all font-mono text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* Conversion Row */}
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <label className="text-sm text-white/40">From</label>
                  <div className="relative">
                    <select
                      value={fromCurrency}
                      onChange={(e) =>
                        setFromCurrency(e.target.value as Currency)
                      }
                      className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/20 cursor-pointer"
                    >
                      {(["USD", "EUR", "INR"] as const).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                      {SYMBOLS[fromCurrency]}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={handleSwap}
                    className="p-2 bg-white/5 border border-white/10 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <ArrowRightLeft size={16} />
                  </button>
                </div>

                <div className="flex-1 space-y-2">
                  <label className="text-sm text-white/40">To</label>
                  <div className="relative">
                    <select
                      value={toCurrency}
                      onChange={(e) =>
                        setToCurrency(e.target.value as Currency)
                      }
                      className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/20 cursor-pointer"
                    >
                      {(["USD", "EUR", "INR"] as const).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                      {SYMBOLS[toCurrency]}
                    </div>
                  </div>
                </div>
              </div>

              {/* Result */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                <div className="text-sm text-white/40 mb-1">Result</div>
                <div className="text-3xl font-mono text-white">
                  {typeof result === "number"
                    ? result.toLocaleString(undefined, {
                        style: "currency",
                        currency: toCurrency,
                      })
                    : "---"}
                </div>
                {rates && (
                  <div className="text-xs text-white/20 mt-2">
                    1 {fromCurrency} ={" "}
                    {(
                      (rates[toCurrency] || 1) / (rates[fromCurrency] || 1)
                    ).toFixed(4)}{" "}
                    {toCurrency}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
