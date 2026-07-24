import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  TrendingUp,
  Target,
  Eye,
  Tag as TagIcon,
  FileText,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import { useStocks } from "../../hooks/useStocks";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { StockDialog } from "../StockDialog";
import { TagInput } from "../ui/TagInput";

type SortKey = "updated" | "symbol" | "target";

export const StocksView = () => {
  const { stocks, loading, createStock, updateStock, deleteStock } =
    useStocks();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newWatch, setNewWatch] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);

  const [filterTag, setFilterTag] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    stockId: string | null;
  }>({ isOpen: false, stockId: null });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach((s) => (s.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    let list = [...stocks];
    if (filterTag)
      list = list.filter((s) => (s.tags || []).includes(filterTag));
    list.sort((a, b) => {
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sortKey === "target") {
        const ta = a.targetPrice ?? Infinity;
        const tb = b.targetPrice ?? Infinity;
        return ta - tb;
      }
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [stocks, filterTag, sortKey]);

  const handleCreate = async () => {
    if (!newSymbol.trim()) return;
    await createStock({
      symbol: newSymbol.trim().toUpperCase(),
      name: newName.trim(),
      reason: newReason,
      targetPrice: newTarget ? parseFloat(newTarget) : null,
      watchPrice: newWatch ? parseFloat(newWatch) : null,
      tags: newTags,
    });
    setIsCreating(false);
    setNewSymbol("");
    setNewName("");
    setNewReason("");
    setNewTarget("");
    setNewWatch("");
    setNewTags([]);
  };

  const confirmDelete = async () => {
    if (deleteConfirmation.stockId)
      await deleteStock(deleteConfirmation.stockId);
    setDeleteConfirmation({ isOpen: false, stockId: null });
  };

  const selectedStock = stocks.find((s) => s.id === selectedId) || null;

  if (loading)
    return (
      <div className="h-full flex items-center justify-center text-white/50 animate-pulse">
        Loading Stocks…
      </div>
    );

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white">Watchlist</h2>
          <p className="text-sm text-white/40 mt-1">
            Track symbols, theses and price targets
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-white text-black px-4 py-2 min-h-[44px] rounded-xl font-semibold hover:bg-white/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          <Plus size={18} /> Track Stock
        </button>
      </div>

      {/* Filters + sort */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-white/40" />
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[40px]"
        >
          <option value="" className="bg-black">
            All tags
          </option>
          {allTags.map((t) => (
            <option key={t} value={t} className="bg-black">
              {t}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <ArrowUpDown size={14} className="text-white/40" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[40px]"
          >
            <option value="updated" className="bg-black">
              Recently updated
            </option>
            <option value="symbol" className="bg-black">
              By symbol
            </option>
            <option value="target" className="bg-black">
              By target price
            </option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-10 pr-1 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {isCreating && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="bg-white/5 border border-white/10 p-5 rounded-3xl flex flex-col gap-3 mb-6 overflow-visible backdrop-blur-xl"
            >
              <h3 className="text-white/80 font-medium text-sm">
                Track a new stock
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  placeholder="Symbol (e.g. AAPL)"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-bold focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-white/25 uppercase"
                  autoFocus
                />
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Company name"
                  className="sm:col-span-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-white/25"
                />
              </div>
              <textarea
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Why are you tracking this?"
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/70 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none text-sm h-16 w-full placeholder:text-white/25"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="Target price"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-white/25"
                />
                <input
                  type="number"
                  value={newWatch}
                  onChange={(e) => setNewWatch(e.target.value)}
                  placeholder="Watch price"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-white/25"
                />
              </div>
              <TagInput
                value={newTags}
                onChange={setNewTags}
                suggestions={allTags}
              />
              <div className="flex justify-end gap-3 mt-2">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-sm text-white/40 hover:text-white bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newSymbol.trim()}
                  className="px-5 py-2 text-sm bg-blue-500 text-white rounded-xl font-medium disabled:opacity-50 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                >
                  Add to watchlist
                </button>
              </div>
            </motion.div>
          )}

          {filteredStocks.length === 0 && !isCreating ? (
            <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-white/10 rounded-3xl">
              <TrendingUp size={44} className="text-white/10 mb-4" />
              <p className="text-white/40 mb-2">
                {stocks.length === 0
                  ? "Your watchlist is empty."
                  : "No stocks match these filters."}
              </p>
              {stocks.length === 0 && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
                >
                  Track your first stock
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStocks.map((stock) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={stock.id}
                  onClick={() => setSelectedId(stock.id)}
                  className="bg-[#0a0a0a]/50 border border-white/10 p-5 rounded-3xl cursor-pointer hover:bg-white/5 hover:border-white/20 transition-all group flex flex-col min-h-[12rem] backdrop-blur-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors pointer-events-none" />

                  <div className="flex justify-between items-start mb-2 relative z-10 gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-300 shrink-0">
                        <TrendingUp size={16} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-white/90 group-hover:text-emerald-200 transition-colors leading-tight truncate">
                          {stock.symbol}
                        </h3>
                        <p className="text-xs text-white/40 truncate">
                          {stock.name || "—"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmation({
                          isOpen: true,
                          stockId: stock.id,
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all p-2 rounded-xl hover:bg-red-500/10 -mt-2 -mr-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <p className="text-sm text-white/50 line-clamp-2 flex-1 relative z-10 leading-relaxed">
                    {stock.reason || "No thesis noted."}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-3 relative z-10">
                    {stock.targetPrice != null && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        <Target size={9} /> {stock.targetPrice}
                      </span>
                    )}
                    {stock.watchPrice != null && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-white/50 border border-white/10">
                        <Eye size={9} /> {stock.watchPrice}
                      </span>
                    )}
                    {(stock.tags || []).slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-white/50 border border-white/10"
                      >
                        <TagIcon size={9} /> {t}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-3 text-xs text-white/30 pt-3 border-t border-white/5 mt-3 relative z-10 font-medium">
                    <span className="flex items-center gap-1.5">
                      <FileText size={12} /> {(stock.noteIds || []).length} Note
                      {(stock.noteIds || []).length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {selectedStock && (
        <StockDialog
          stock={selectedStock}
          isOpen={!!selectedStock}
          onClose={() => setSelectedId(null)}
          updateStock={updateStock}
          allTags={allTags}
        />
      )}

      <DeleteConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, stockId: null })}
        onConfirm={confirmDelete}
        title="Remove Stock"
        description={
          <p>
            Remove this stock from your watchlist? Attached notes will not be
            deleted.
          </p>
        }
      />
    </div>
  );
};
