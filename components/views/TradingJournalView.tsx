'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Trash2,
  Loader2,
  X,
  Bot,
  TrendingUp,
  TrendingDown,
  DollarSign,
  IndianRupee,
  ArrowLeft,
  BarChart3,
  Hash,
  Target,
  Layers,
  ArrowRight,
  Share2,
  Check,
} from 'lucide-react'
import { useUser } from '@/context/UserContext'
import {
  createTradingBot,
  fetchTradingBots,
  updateTradingBot,
  deleteTradingBot,
  makeTradingEntry,
  makeSlug,
  TradingBot,
  TradingEntry,
} from '@/services/tradingJournalService'
import { Portal } from '../ui/Portal'
import { useCurrency } from '@/hooks/useCurrency'

// ─── USD → INR rate (kept simple with live rates from context) ──
const USD_TO_INR_FALLBACK = 83.5

export const TradingJournalView = () => {
  const { user } = useUser()
  const [bots, setBots] = useState<TradingBot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBot, setSelectedBot] = useState<TradingBot | null>(null)
  const loadedForUserRef = useRef<string | null>(null)

  // Dialog states
  const [showNewBotDialog, setShowNewBotDialog] = useState(false)
  const [showNewEntryDialog, setShowNewEntryDialog] = useState(false)

  // New bot form
  const [botTitle, setBotTitle] = useState('')
  const [botDescription, setBotDescription] = useState('')

  // New entry form
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [entryProfitUsd, setEntryProfitUsd] = useState('')
  const [entryStartPrice, setEntryStartPrice] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [entryExitPrice, setEntryExitPrice] = useState('')
  const [entryNoOfTrades, setEntryNoOfTrades] = useState('')
  const [entryNote, setEntryNote] = useState('')

  // Share-link feedback
  const [shareCopied, setShareCopied] = useState(false)

  // Filter state
  type FilterMode = 'all' | 'day' | 'month'
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7), // YYYY-MM
  )

  // Currency context for live rates
  const { rates } = useCurrency()
  const usdToInr = rates?.INR ?? USD_TO_INR_FALLBACK

  // ─── Load bots when user is available (stale-while-revalidate) ──
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!user?.id) {
        if (cancelled) return
        loadedForUserRef.current = null
        setBots([])
        setLoading(false)
        return
      }

      const firstLoad = loadedForUserRef.current !== user.id
      if (firstLoad && !cancelled) setLoading(true)

      try {
        const data = await fetchTradingBots(user.id)
        if (cancelled) return
        setBots(data)
        loadedForUserRef.current = user.id
      } catch (err) {
        if (!cancelled) console.error('Failed to load trading bots', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  // ─── Bot CRUD ─────────────────────────────────────────────────

  const handleCreateBot = (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !botTitle.trim()) return

    const { bot, persisted } = createTradingBot({
      userId: user.id,
      title: botTitle.trim(),
      description: botDescription.trim(),
    })

    // Optimistic: show instantly, close dialog, reset form
    setBots((prev) => [bot, ...prev])
    setBotTitle('')
    setBotDescription('')
    setShowNewBotDialog(false)

    persisted.catch((err) => {
      console.error('Failed to create bot, reverting', err)
      setBots((prev) => prev.filter((b) => b.id !== bot.id))
    })
  }

  const handleDeleteBot = (botId: string) => {
    if (!confirm('Delete this bot and all its entries?')) return

    const snapshot = bots
    const wasSelected = selectedBot?.id === botId

    // Optimistic: remove from UI immediately
    setBots((prev) => prev.filter((b) => b.id !== botId))
    if (wasSelected) setSelectedBot(null)

    deleteTradingBot(botId).catch((err) => {
      console.error('Failed to delete bot, reverting', err)
      setBots(snapshot)
    })
  }

  // ─── Entry CRUD ───────────────────────────────────────────────

  const sumTradeCount = (entries: TradingEntry[]) =>
    entries.reduce((s, e) => s + (e.noOfTrades || 0), 0)

  const handleShareBot = async () => {
    if (!selectedBot) return

    // Back-fill slug on old bots (optimistic)
    let slug = selectedBot.slug
    if (!slug) {
      slug = makeSlug(selectedBot.title, selectedBot.id)
      const updated = { ...selectedBot, slug }
      setSelectedBot(updated)
      setBots((prev) => prev.map((b) => (b.id === selectedBot.id ? updated : b)))
      updateTradingBot(selectedBot.id, { slug }).catch((err) => {
        console.error('Failed to persist slug', err)
      })
    }

    const url = `${window.location.origin}/trade/journal/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1800)
    } catch (err) {
      console.error('Clipboard write failed', err)
      window.prompt('Copy this link:', url)
    }
  }

  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBot) return

    const profitUsd = parseFloat(entryProfitUsd) || 0
    const parsedStart = parseFloat(entryStartPrice)
    const parsedExit = parseFloat(entryExitPrice)
    const parsedTrades = parseInt(entryNoOfTrades, 10)

    const newEntry: TradingEntry = makeTradingEntry({
      date: entryDate,
      profitUsd,
      profitInr: parseFloat((profitUsd * usdToInr).toFixed(2)),
      startPrice: Number.isFinite(parsedStart) ? parsedStart : undefined,
      entryPrice: parseFloat(entryPrice) || 0,
      exitPrice: Number.isFinite(parsedExit) ? parsedExit : undefined,
      noOfTrades: Number.isFinite(parsedTrades) ? parsedTrades : undefined,
      note: entryNote.trim() || undefined,
    })

    const prevEntries = selectedBot.entries || []
    const prevNoOfTrades = selectedBot.noOfTrades
    const updatedEntries = [newEntry, ...prevEntries]
    const updatedNoOfTrades = sumTradeCount(updatedEntries)
    const updatedBot: TradingBot = {
      ...selectedBot,
      entries: updatedEntries,
      noOfTrades: updatedNoOfTrades,
    }
    const botId = selectedBot.id

    // Optimistic: update UI, reset form, close dialog
    setSelectedBot(updatedBot)
    setBots((prev) => prev.map((b) => (b.id === botId ? updatedBot : b)))
    setEntryDate(new Date().toISOString().split('T')[0])
    setEntryProfitUsd('')
    setEntryStartPrice('')
    setEntryPrice('')
    setEntryExitPrice('')
    setEntryNoOfTrades('')
    setEntryNote('')
    setShowNewEntryDialog(false)

    updateTradingBot(botId, {
      entries: updatedEntries,
      noOfTrades: updatedNoOfTrades,
    }).catch((err) => {
      console.error('Failed to save entry, reverting', err)
      const revert = (b: TradingBot) => ({
        ...b,
        entries: prevEntries,
        noOfTrades: prevNoOfTrades,
      })
      setSelectedBot((cur) => (cur && cur.id === botId ? revert(cur) : cur))
      setBots((prev) => prev.map((b) => (b.id === botId ? revert(b) : b)))
    })
  }

  const handleDeleteEntry = (entryId: string) => {
    if (!selectedBot) return

    const prevEntries = selectedBot.entries || []
    const prevNoOfTrades = selectedBot.noOfTrades
    const updatedEntries = prevEntries.filter((e) => e.id !== entryId)
    const updatedNoOfTrades = sumTradeCount(updatedEntries)
    const updatedBot: TradingBot = {
      ...selectedBot,
      entries: updatedEntries,
      noOfTrades: updatedNoOfTrades,
    }
    const botId = selectedBot.id

    // Optimistic
    setSelectedBot(updatedBot)
    setBots((prev) => prev.map((b) => (b.id === botId ? updatedBot : b)))

    updateTradingBot(botId, {
      entries: updatedEntries,
      noOfTrades: updatedNoOfTrades,
    }).catch((err) => {
      console.error('Failed to delete entry, reverting', err)
      const revert = (b: TradingBot) => ({
        ...b,
        entries: prevEntries,
        noOfTrades: prevNoOfTrades,
      })
      setSelectedBot((cur) => (cur && cur.id === botId ? revert(cur) : cur))
      setBots((prev) => prev.map((b) => (b.id === botId ? revert(b) : b)))
    })
  }

  // ─── Filtered entries + stats ─────────────────────────────────

  const filteredEntries = useMemo(() => {
    const entries = selectedBot?.entries || []
    if (filterMode === 'day') {
      return entries.filter((e) => e.date === filterDate)
    }
    if (filterMode === 'month') {
      return entries.filter((e) => e.date.startsWith(filterMonth))
    }
    return entries
  }, [selectedBot, filterMode, filterDate, filterMonth])

  const botStats = useMemo(() => {
    const entries = filteredEntries
    const profitUsd = entries.filter((e) => e.profitUsd > 0).reduce((s, e) => s + e.profitUsd, 0)
    const lossUsd = entries.filter((e) => e.profitUsd < 0).reduce((s, e) => s + e.profitUsd, 0) // negative
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

  // Tomorrow's probability = win rate of the most recent 7 entries (unfiltered)
  const tomorrowProb = useMemo(() => {
    const all = [...(selectedBot?.entries || [])].sort((a, b) => b.date.localeCompare(a.date))
    const recent = all.slice(0, 7)
    if (!recent.length) return null
    const wins = recent.filter((e) => e.profitUsd > 0).length
    return {
      probability: Math.round((wins / recent.length) * 100),
      sampleSize: recent.length,
    }
  }, [selectedBot])

  // ─── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[400px]">
        <Loader2 className="animate-spin text-white/50" size={32} />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── DETAIL VIEW (Selected Bot) ───────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  if (selectedBot) {
    return (
      <div className="max-w-5xl mx-auto pb-20">
        {/* Back + Header */}
        <div className="flex items-center gap-4 mb-8 sticky top-0 z-20 backdrop-blur-xl py-4 border-b border-white/5">
          <button
            onClick={() => setSelectedBot(null)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/5"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight truncate">
              {selectedBot.title}
            </h1>
            {selectedBot.description && (
              <p className="text-white/40 text-sm truncate">{selectedBot.description}</p>
            )}
          </div>
          <button
            onClick={handleShareBot}
            title={shareCopied ? 'Link copied!' : 'Copy public share link'}
            className={`p-2.5 rounded-full border flex items-center gap-2 transition-all text-sm shrink-0 ${
              shareCopied
                ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {shareCopied ? <Check size={16} /> : <Share2 size={16} />}
            <span className="hidden sm:inline pr-1">{shareCopied ? 'Copied' : 'Share'}</span>
          </button>
          <button
            onClick={() => setShowNewEntryDialog(true)}
            className="bg-white text-black px-4 py-2.5 rounded-full font-bold flex items-center gap-2 hover:bg-white/90 transition-all shadow-lg shadow-white/10 text-sm shrink-0"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Add Trade</span>
          </button>
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
            {botStats.entryCount} entr{botStats.entryCount === 1 ? 'y' : 'ies'}
          </span>
        </div>

        {/* Stats Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            {
              label: 'Profit',
              value: `+$${botStats.profitUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              color: 'text-green-400 bg-green-500/10 border-green-500/20',
              icon: TrendingUp,
            },
            {
              label: 'Loss',
              value: `-$${Math.abs(botStats.lossUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              color: 'text-red-400 bg-red-500/10 border-red-500/20',
              icon: TrendingDown,
            },
            {
              label: 'Net (USD)',
              value: `${botStats.netUsd >= 0 ? '+' : ''}$${botStats.netUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              color:
                botStats.netUsd >= 0
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-rose-400 bg-rose-500/10 border-rose-500/20',
              icon: DollarSign,
            },
            {
              label: 'Net (INR)',
              value: `${botStats.netInr >= 0 ? '+' : ''}₹${botStats.netInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
              color:
                botStats.netInr >= 0
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            {
              label: 'Entries',
              value: botStats.entryCount.toString(),
              color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
              icon: BarChart3,
            },
            {
              label: 'No. of Trades',
              value: botStats.totalTrades.toString(),
              color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
              icon: Layers,
            },
            {
              label: 'Win Rate',
              value: `${botStats.winRate}%`,
              color:
                botStats.winRate >= 50
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
              {selectedBot.entries?.length ? 'No trades in this range' : 'No trades recorded yet'}
            </p>
            <p className="text-sm mt-1">
              {selectedBot.entries?.length
                ? 'Try a different filter or switch to All'
                : 'Click "Add Trade" to log your first entry'}
            </p>
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
                  className="group bg-white/5 border border-white/5 rounded-2xl p-4 md:p-5 hover:bg-white/[0.07] transition-all"
                >
                  <div className="flex items-center gap-4">
                    {/* Indicator */}
                    <div
                      className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                        isProfit ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {isProfit ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>

                    {/* Info */}
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

                    {/* Note + Delete */}
                    <div className="shrink-0 flex items-center gap-2">
                      {entry.note && (
                        <span
                          className="hidden md:block text-xs text-white/30 max-w-[120px] truncate"
                          title={entry.note}
                        >
                          {entry.note}
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="p-2 text-white/15 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        title="Delete trade"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Mobile note row */}
                  {entry.note && (
                    <p className="md:hidden text-xs text-white/30 mt-2 pl-14 truncate">
                      {entry.note}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* ─── Add Entry Dialog ──────────────────────────────────── */}
        <AnimatePresence>
          {showNewEntryDialog && (
            <Portal>
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                  <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <TrendingUp size={18} className="text-green-400" />
                      Log Trade
                    </h3>
                    <button
                      onClick={() => setShowNewEntryDialog(false)}
                      className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 overflow-y-auto custom-scrollbar">
                    <form id="entry-form" onSubmit={handleAddEntry} className="space-y-5">
                      <div>
                        <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                          Date
                        </label>
                        <input
                          type="date"
                          value={entryDate}
                          onChange={(e) => setEntryDate(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-all [color-scheme:dark]"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                            Profit (USD)
                          </label>
                          <div className="relative">
                            <DollarSign
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                            />
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={entryProfitUsd}
                              onChange={(e) => setEntryProfitUsd(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 font-mono transition-all"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                            INR (auto)
                          </label>
                          <div className="relative">
                            <IndianRupee
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20"
                            />
                            <input
                              type="text"
                              readOnly
                              value={
                                entryProfitUsd
                                  ? `₹${(parseFloat(entryProfitUsd) * usdToInr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                  : ''
                              }
                              placeholder="Auto calculated"
                              className="w-full bg-white/[0.02] border border-white/5 rounded-xl pl-9 pr-4 py-3 text-white/50 font-mono cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                            Start Price
                          </label>
                          <div className="relative">
                            <DollarSign
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                            />
                            <input
                              type="number"
                              step="0.0001"
                              placeholder="Session"
                              value={entryStartPrice}
                              onChange={(e) => setEntryStartPrice(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 font-mono transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                            Entry Price *
                          </label>
                          <div className="relative">
                            <DollarSign
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                            />
                            <input
                              type="number"
                              step="0.0001"
                              placeholder="Position"
                              value={entryPrice}
                              onChange={(e) => setEntryPrice(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 font-mono transition-all"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                            Exit Price
                          </label>
                          <div className="relative">
                            <DollarSign
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                            />
                            <input
                              type="number"
                              step="0.0001"
                              placeholder="Close"
                              value={entryExitPrice}
                              onChange={(e) => setEntryExitPrice(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 font-mono transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                          No. of Trades
                        </label>
                        <div className="relative">
                          <Layers
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                          />
                          <input
                            type="number"
                            step="1"
                            min="0"
                            placeholder="e.g. 4"
                            value={entryNoOfTrades}
                            onChange={(e) => setEntryNoOfTrades(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 font-mono transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                          Note (optional)
                        </label>
                        <textarea
                          value={entryNote}
                          onChange={(e) => setEntryNote(e.target.value)}
                          placeholder="Setup, strategy, emotions..."
                          rows={2}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none transition-all"
                        />
                      </div>
                    </form>
                  </div>

                  <div className="p-5 border-t border-white/10 bg-white/5 flex justify-end gap-3">
                    <button
                      onClick={() => setShowNewEntryDialog(false)}
                      className="px-5 py-2.5 rounded-xl hover:bg-white/10 text-white font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      form="entry-form"
                      className="px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all shadow-lg shadow-white/10"
                    >
                      Save Trade
                    </button>
                  </div>
                </motion.div>
              </div>
            </Portal>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── BOT LIST VIEW ────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 sticky top-0 z-20 backdrop-blur-xl py-4 border-b border-white/5">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Trading Journal</h1>
          <p className="text-white/40 text-sm">Track your bot performance & trade logs</p>
        </div>
        <button
          onClick={() => setShowNewBotDialog(true)}
          className="bg-white text-black px-4 py-2.5 rounded-full font-bold flex items-center gap-2 hover:bg-white/90 transition-all shadow-lg shadow-white/10 text-sm"
        >
          <Plus size={18} />
          New Bot
        </button>
      </div>

      {/* Bot Cards Grid */}
      {bots.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <Bot className="mx-auto mb-4 opacity-40" size={56} />
          <p className="text-lg font-medium">No trading bots yet</p>
          <p className="text-sm mt-1 text-white/20">
            Create your first bot to start journaling trades
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bots.map((bot, idx) => {
            const entries = bot.entries || []
            const total = entries.reduce((s, e) => s + e.profitUsd, 0)
            const totalInr = entries.reduce((s, e) => s + e.profitInr, 0)
            const isPositive = total >= 0

            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                onClick={() => setSelectedBot(bot)}
                className="group cursor-pointer relative overflow-hidden bg-white/5 border border-white/5 rounded-3xl p-6 hover:bg-white/[0.08] hover:border-white/10 transition-all duration-300"
              >
                {/* Glow */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${
                    isPositive
                      ? 'from-green-500/5 to-emerald-500/5'
                      : 'from-red-500/5 to-pink-500/5'
                  } opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />

                <div className="relative z-10 flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div
                      className={`p-3 rounded-2xl ${
                        isPositive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      <Bot size={22} />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteBot(bot.id)
                      }}
                      className="p-2 text-white/15 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      title="Delete bot"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-white mb-1 truncate">{bot.title}</h3>
                    {bot.description && (
                      <p className="text-sm text-white/40 line-clamp-2 leading-relaxed">
                        {bot.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 mt-auto border-t border-white/5 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs text-white/30 font-medium">
                        {entries.length} entr
                        {entries.length !== 1 ? 'ies' : 'y'}
                      </span>
                      {typeof bot.noOfTrades === 'number' && bot.noOfTrades > 0 && (
                        <span className="text-[10px] text-white/20 font-medium">
                          {bot.noOfTrades} trade
                          {bot.noOfTrades !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={`text-lg font-bold font-mono ${
                          isPositive ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {isPositive ? '+' : ''}$
                        {total.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-[10px] text-white/25 font-mono">
                        ₹
                        {totalInr.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}

          {/* Quick Add Card */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: bots.length * 0.07 }}
            onClick={() => setShowNewBotDialog(true)}
            className="group relative flex flex-col items-center justify-center gap-3 bg-white/[0.03] border border-white/5 border-dashed rounded-3xl p-6 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300 min-h-[200px]"
          >
            <div className="p-4 rounded-full bg-white/5 text-white/40 group-hover:scale-110 group-hover:text-white/60 transition-all duration-300">
              <Plus size={28} />
            </div>
            <span className="text-sm font-medium text-white/40 group-hover:text-white/60 transition-colors">
              Add New Bot
            </span>
          </motion.button>
        </div>
      )}

      {/* ─── New Bot Dialog (asks name first) ──────────────────── */}
      <AnimatePresence>
        {showNewBotDialog && (
          <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Bot size={18} className="text-blue-400" />
                    Create Trading Bot
                  </h3>
                  <button
                    onClick={() => {
                      setShowNewBotDialog(false)
                      setBotTitle('')
                      setBotDescription('')
                    }}
                    className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5">
                  <form id="bot-form" onSubmit={handleCreateBot} className="space-y-5">
                    <div>
                      <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                        Bot Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Alpha Scout, Trend Master..."
                        value={botTitle}
                        onChange={(e) => setBotTitle(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 text-lg transition-all"
                        required
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
                        Description (optional)
                      </label>
                      <textarea
                        placeholder="What strategy does this bot use?"
                        value={botDescription}
                        onChange={(e) => setBotDescription(e.target.value)}
                        rows={3}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none transition-all"
                      />
                    </div>
                  </form>
                </div>

                <div className="p-5 border-t border-white/10 bg-white/5 flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowNewBotDialog(false)
                      setBotTitle('')
                      setBotDescription('')
                    }}
                    className="px-5 py-2.5 rounded-xl hover:bg-white/10 text-white font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="bot-form"
                    disabled={!botTitle.trim()}
                    className="px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-white/10"
                  >
                    Create Bot
                  </button>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>
    </div>
  )
}
