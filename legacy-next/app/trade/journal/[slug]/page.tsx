'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  DollarSign,
  Hash,
  IndianRupee,
  Layers,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { fetchTradingBotBySlug, TradingBot } from '@/services/tradingJournalService'

type FilterMode = 'all' | 'day' | 'month'

export default function PublicTradingJournalPage() {
  const { slug } = useParams()
  const router = useRouter()

  const [bot, setBot] = useState<TradingBot | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => {
    if (typeof slug !== 'string') return
    fetchTradingBotBySlug(slug)
      .then((result) => {
        if (!result) setNotFound(true)
        else setBot(result)
      })
      .catch((err) => {
        console.error('Failed to load shared bot', err)
        setNotFound(true)
      })
      .finally(() => setLoading(false))
  }, [slug])

  const filteredEntries = useMemo(() => {
    const entries = bot?.entries || []
    if (filterMode === 'day') {
      return entries.filter((e) => e.date === filterDate)
    }
    if (filterMode === 'month') {
      return entries.filter((e) => e.date.startsWith(filterMonth))
    }
    return entries
  }, [bot, filterMode, filterDate, filterMonth])

  const stats = useMemo(() => {
    const entries = filteredEntries
    const profitUsd = entries.filter((e) => e.profitUsd > 0).reduce((s, e) => s + e.profitUsd, 0)
    const lossUsd = entries.filter((e) => e.profitUsd < 0).reduce((s, e) => s + e.profitUsd, 0)
    const netUsd = entries.reduce((s, e) => s + e.profitUsd, 0)
    const netInr = entries.reduce((s, e) => s + e.profitInr, 0)
    const totalTrades = entries.reduce((s, e) => s + (e.noOfTrades || 0), 0)
    const wins = entries.filter((e) => e.profitUsd > 0).length
    const winRate = entries.length ? Math.round((wins / entries.length) * 100) : 0
    return {
      profitUsd,
      lossUsd,
      netUsd,
      netInr,
      totalTrades,
      entryCount: entries.length,
      winRate,
    }
  }, [filteredEntries])

  const tomorrowProb = useMemo(() => {
    const all = [...(bot?.entries || [])].sort((a, b) => b.date.localeCompare(a.date))
    const recent = all.slice(0, 7)
    if (!recent.length) return null
    const wins = recent.filter((e) => e.profitUsd > 0).length
    return {
      probability: Math.round((wins / recent.length) * 100),
      sampleSize: recent.length,
    }
  }, [bot])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !bot) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white relative overflow-hidden">
        <div className="fixed inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
        </div>
        <p className="opacity-50 mb-4 z-10">Trading journal not found</p>
        <button onClick={() => router.push('/')} className="text-blue-400 hover:underline z-10">
          Go Home
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="fixed inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-6 pb-20 pt-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8 py-4 border-b border-white/5">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/70 shrink-0">
            <Bot size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1">
              Shared Trading Journal
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight truncate">
              {bot.title}
            </h1>
            {bot.description && <p className="text-white/40 text-sm mt-1">{bot.description}</p>}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'day', label: 'Day' },
                { key: 'month', label: 'Month' },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterMode(f.key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium tracking-wider uppercase transition-colors ${
                  filterMode === f.key ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filterMode === 'day' && (
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-white/30 [color-scheme:dark]"
            />
          )}
          {filterMode === 'month' && (
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-white/30 [color-scheme:dark]"
            />
          )}
          <span className="ml-auto text-xs text-white/40">
            {stats.entryCount} entr{stats.entryCount === 1 ? 'y' : 'ies'}
          </span>
        </div>

        {/* Stats Row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            {
              label: 'Profit',
              value: `+$${stats.profitUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              color: 'text-green-400 bg-green-500/10 border-green-500/20',
              icon: TrendingUp,
            },
            {
              label: 'Loss',
              value: `-$${Math.abs(stats.lossUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              color: 'text-red-400 bg-red-500/10 border-red-500/20',
              icon: TrendingDown,
            },
            {
              label: 'Net (USD)',
              value: `${stats.netUsd >= 0 ? '+' : ''}$${stats.netUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              color:
                stats.netUsd >= 0
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-rose-400 bg-rose-500/10 border-rose-500/20',
              icon: DollarSign,
            },
            {
              label: 'Net (INR)',
              value: `${stats.netInr >= 0 ? '+' : ''}₹${stats.netInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
              color:
                stats.netInr >= 0
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-rose-400 bg-rose-500/10 border-rose-500/20',
              icon: IndianRupee,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-2xl p-4 border ${stat.color} flex flex-col gap-1`}
            >
              <div className="flex items-center gap-2 mb-1">
                <stat.icon size={14} className="opacity-60" />
                <span className="text-[10px] font-medium tracking-wider uppercase opacity-60">
                  {stat.label}
                </span>
              </div>
              <span className="text-xl md:text-2xl font-bold font-mono">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Stats Row 2 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            {
              label: 'Entries',
              value: stats.entryCount.toString(),
              color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
              icon: BarChart3,
            },
            {
              label: 'No. of Trades',
              value: stats.totalTrades.toString(),
              color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
              icon: Layers,
            },
            {
              label: 'Win Rate',
              value: `${stats.winRate}%`,
              color:
                stats.winRate >= 50
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20',
              icon: Hash,
            },
            {
              label: tomorrowProb ? `Tomorrow (last ${tomorrowProb.sampleSize})` : 'Tomorrow',
              value: tomorrowProb ? `${tomorrowProb.probability}%` : '—',
              color:
                tomorrowProb && tomorrowProb.probability >= 50
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20',
              icon: Target,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-2xl p-4 border ${stat.color} flex flex-col gap-1`}
            >
              <div className="flex items-center gap-2 mb-1">
                <stat.icon size={14} className="opacity-60" />
                <span className="text-[10px] font-medium tracking-wider uppercase opacity-60">
                  {stat.label}
                </span>
              </div>
              <span className="text-xl md:text-2xl font-bold font-mono">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Entries Table */}
        {filteredEntries.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <BarChart3 className="mx-auto mb-4 opacity-40" size={48} />
            <p className="text-lg">
              {bot.entries?.length ? 'No trades in this range' : 'No trades logged yet'}
            </p>
            {bot.entries?.length ? (
              <p className="text-sm mt-1">Try a different filter or switch to All</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry, idx) => {
              const isProfit = entry.profitUsd >= 0
              const fmtPrice = (n?: number) =>
                typeof n === 'number' ? `$${n.toLocaleString('en-US')}` : '—'
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="bg-white/5 border border-white/5 rounded-2xl p-4 md:p-5"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                        isProfit ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {isProfit ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
                      <div>
                        <span className="text-[10px] text-white/30 uppercase tracking-wider block">
                          Date
                        </span>
                        <span className="text-sm font-medium text-white/80">
                          {new Date(entry.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-white/30 uppercase tracking-wider block">
                          Trades
                        </span>
                        <span className="text-sm font-mono font-medium text-white/80">
                          {entry.noOfTrades ?? '—'}
                        </span>
                      </div>

                      <div className="col-span-2 md:col-span-2">
                        <span className="text-[10px] text-white/30 uppercase tracking-wider block">
                          Start → Entry → Exit
                        </span>
                        <div className="flex items-center gap-1 text-sm font-mono font-medium text-white/80">
                          <span>{fmtPrice(entry.startPrice)}</span>
                          <ArrowRight size={12} className="text-white/30" />
                          <span>{fmtPrice(entry.entryPrice)}</span>
                          <ArrowRight size={12} className="text-white/30" />
                          <span>{fmtPrice(entry.exitPrice)}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-white/30 uppercase tracking-wider block">
                          P/L
                        </span>
                        <span
                          className={`text-sm font-mono font-bold block ${
                            isProfit ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {isProfit ? '+' : ''}$
                          {entry.profitUsd.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <span
                          className={`text-[10px] font-mono ${
                            isProfit ? 'text-green-400/70' : 'text-red-400/70'
                          }`}
                        >
                          {isProfit ? '+' : ''}₹
                          {entry.profitInr.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {entry.note && <p className="text-xs text-white/40 mt-2 pl-14">{entry.note}</p>}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
