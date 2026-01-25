"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { marketData, MarketItem } from "@/components/market/data/marketData";
import { columns } from "@/components/market/data/columns";
import { ForexStats } from "@/components/market/ForexStats";
import { ActiveSymbolSelector } from "@/components/market/ActiveSymbolSelector";
import { ForexActionPanel } from "@/components/market/ForexActionPanel";

export const ForexView = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<MarketItem>(
    marketData[7],
  ); // Default to Gold

  return (
    <div className="space-y-6 h-full flex flex-col">

      {/* Stats & Active Symbol Selector */}
      <ForexStats>
        <ActiveSymbolSelector
          selectedSymbol={selectedSymbol}
          onSelect={setSelectedSymbol}
        />
      </ForexStats>

      {/* Market Data Table */}
      <div className="flex-1 min-h-0 bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col">
        <div className="mb-4 px-2">
          <h3 className="text-lg font-semibold">
            {selectedSymbol.pair} (Active Model)
          </h3>
        </div>
        <div className="flex-1 overflow-auto">
          <DataTable
            columns={columns}
            data={marketData}
            renderSubComponent={(item) => (
              <ForexActionPanel item={item} onSetActive={setSelectedSymbol} />
            )}
          />
        </div>
      </div>
    </div>
  );
};

