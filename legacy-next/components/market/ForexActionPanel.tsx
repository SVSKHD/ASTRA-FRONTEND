import { Button } from "@/components/ui/button";
import { MarketItem } from "./data/marketData";

interface ForexActionPanelProps {
  item: MarketItem;
  onSetActive: (item: MarketItem) => void;
}

export const ForexActionPanel = ({
  item,
  onSetActive,
}: ForexActionPanelProps) => {
  return (
    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-black/40 rounded-lg m-2 border border-white/5">
      <div className="col-span-2 md:col-span-4 flex justify-between items-center px-2 mb-2">
        <span className="text-xs text-white/50">Actions for {item.pair}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20"
          onClick={(e) => {
            e.stopPropagation();
            onSetActive(item);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          Set as Active Symbol
        </Button>
      </div>
      <Button
        variant="outline"
        className="w-full bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/20 hover:text-green-300"
      >
        Buy {item.pair}
      </Button>
      <Button
        variant="outline"
        className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 hover:text-red-300"
      >
        Sell {item.pair}
      </Button>
      <Button
        variant="ghost"
        className="w-full text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
      >
        View Chart
      </Button>
      <Button
        variant="ghost"
        className="w-full text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
      >
        Details
      </Button>
    </div>
  );
};
