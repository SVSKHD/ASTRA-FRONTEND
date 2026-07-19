"use client";
import { motion } from "framer-motion";

export type MarketType = "forex" | "metals";

interface MarketSelectorProps {
  selected: MarketType;
  onSelect: (value: MarketType) => void;
}

export const MarketSelector = ({ selected, onSelect }: MarketSelectorProps) => {
  const options: { id: MarketType; label: string }[] = [
    { id: "forex", label: "Forex" },
    { id: "metals", label: "Silver / Gold" },
  ];

  return (
    <div className="flex items-center gap-2 p-1.5 rounded-full bg-black/20 border border-white/10 backdrop-blur-2xl w-fit shadow-inner">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onSelect(option.id)}
          className={`relative px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
            selected === option.id
              ? "text-white shadow-lg"
              : "text-white/50 hover:text-white"
          }`}
        >
          {selected === option.id && (
            <motion.div
              layoutId="market-selector-pill"
              className="absolute inset-0 bg-white/10 rounded-full border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <span className="relative z-10">{option.label}</span>
        </button>
      ))}
    </div>
  );
};
