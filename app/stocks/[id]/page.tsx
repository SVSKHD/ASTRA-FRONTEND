"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useUser } from "@/context/UserContext";
import {
  ArrowLeft,
  TrendingUp,
  Target,
  Eye,
  Tag as TagIcon,
} from "lucide-react";
import { Stock } from "@/services/stocksService";
import { fullTimestamp } from "@/utils/time";

export default function SharedStockPage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [stock, setStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStock = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra_stocks", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Omit<Stock, "id">;
          const isOwner =
            user && (data.userId === user.id || user.role === "admin");
          if (data.isShared === true || isOwner) {
            setStock({ id: docSnap.id, ...data });
          } else {
            console.error("Unauthorized");
          }
        }
      } catch (error) {
        console.error("Error fetching stock:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStock();
  }, [id, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="opacity-50 mb-4">Stock not found or private</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-6 flex flex-col items-center relative overflow-hidden font-sans">
      <div className="fixed inset-0 z-0 bg-black">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-2xl relative z-10 py-8">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>

        <div className="w-full bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10">
          <div className="p-8 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
                <TrendingUp size={22} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white leading-tight">
                  {stock.symbol}
                </h1>
                <p className="text-white/50">{stock.name}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-6">
              {stock.targetPrice != null && (
                <span className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  <Target size={14} /> Target {stock.targetPrice}
                </span>
              )}
              {stock.watchPrice != null && (
                <span className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white/5 text-white/60 border border-white/10">
                  <Eye size={14} /> Watch {stock.watchPrice}
                </span>
              )}
            </div>
          </div>

          <div className="p-8 space-y-6">
            {stock.reason && (
              <div>
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-2">
                  Why tracking
                </h3>
                <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                  {stock.reason}
                </p>
              </div>
            )}
            {(stock.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(stock.tags || []).map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white/5 text-white/60 border border-white/10"
                  >
                    <TagIcon size={10} /> {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="px-8 py-4 border-t border-white/5 text-xs text-white/30">
            Created {fullTimestamp(stock.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
