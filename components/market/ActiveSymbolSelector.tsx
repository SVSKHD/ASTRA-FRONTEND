import { useState } from "react";
import { ActiveSymbolCard } from "@/components/ui/cards/ActiveSymbolCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { MarketItem, marketData } from "./data/marketData";

interface ActiveSymbolSelectorProps {
  selectedSymbol: MarketItem;
  onSelect: (item: MarketItem) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const ActiveSymbolSelector = ({
  selectedSymbol,
  onSelect,
  onRefresh,
  isRefreshing,
}: ActiveSymbolSelectorProps) => {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div className="relative">
      <ActiveSymbolCard
        data={selectedSymbol}
        onClick={() => setShowOptions(!showOptions)}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />

      <AnimatePresence>
        {showOptions && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-full left-0 right-0 z-50 mt-2"
          >
            <Card className="flex flex-col overflow-hidden border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl">
              <div className="p-3 border-b border-white/10 flex justify-between items-center bg-white/5">
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp size={12} /> Select Symbol
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-white/40 hover:text-white px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOptions(false);
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-1 space-y-1 custom-scrollbar max-h-[240px]">
                {/* We can show a subset or filter logic here if needed. currently showing top items */}
                {[
                  marketData[7],
                  marketData[8],
                  marketData[0],
                  marketData[1],
                  marketData[2],
                ].map((item) => (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(item);
                      setShowOptions(false);
                    }}
                    className={`p-2 rounded-lg cursor-pointer flex items-center justify-between transition-all group ${selectedSymbol.id === item.id ? "bg-white/10 border border-white/10 shadow-sm" : "hover:bg-white/5 border border-transparent"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border border-white/10 ${selectedSymbol.id === item.id ? "bg-amber-500/20 text-amber-400 border-amber-500/20" : "bg-white/5 text-white/70"}`}
                      >
                        {item.pair.substring(0, 1)}
                      </div>
                      <div className="flex flex-col">
                        <span
                          className={`text-xs font-bold ${selectedSymbol.id === item.id ? "text-white" : "text-white/80"}`}
                        >
                          {item.pair}
                        </span>
                        <span className="text-[10px] text-white/40">
                          Market
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-mono font-medium">
                        {item.price.toFixed(2)}
                      </span>
                      <span
                        className={`text-[10px] font-bold ${item.change >= 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {item.change >= 0 ? "+" : ""}
                        {item.change}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
