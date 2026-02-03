"use server";

import dbConnect from "@/lib/mongodb";
import UserBalanceModel from "@/lib/models/UserBalance";
import DealModel from "@/lib/models/Deal";
import TradeModel from "@/lib/models/Trade";

export interface UserBalance {
  id: string;
  balance: number;
  company: string;
  connected: boolean;
  credit: number;
  currency: string;
  date: string;
  equity: number;
  leverage: number;
  limit_orders: number;
  login: number;
  margin: number;
  margin_free: number;
  margin_level: number;
  name: string;
  ok: boolean;
  profit: number;
  server: string;
  terminal_info: boolean;
  trade_mode: number;
  ts_server: string;
  ts_utc: string;
  updated_at: string;
  user_id: string;
  userEmail?: string;
}

export const fetchUserBalances = async (): Promise<UserBalance[]> => {
  try {
    await dbConnect();
    const balances = await UserBalanceModel.find({}).lean();
    return balances.map((doc: any) => ({
      ...doc,
      id: doc._id.toString(),
      _id: undefined,
    })) as UserBalance[];
  } catch (error) {
    console.error("Error fetching user balances:", error);
    return [];
  }
};

export interface Deal {
  id: string; // Document ID
  ticket: number;
  login?: number;
  time: string;
  type: number;
  symbol: string;
  volume: number;
  price: number;
  profit_usd: number;
  swap: number;
  commission: number;
  comment: string;
  date: string;
  deal: number;
  deal_id: string;
  entry: number;
  fee: number;
  magic: number;
  order: number;
  position_id: number;
  side: "BUY" | "SELL";
  time_msc: number;
  updated_at: string;
  user_id: string;
}

export const fetchDeals = async (): Promise<Deal[]> => {
  try {
    await dbConnect();
    const deals = await DealModel.find({}).sort({ time: -1 }).limit(50).lean();
    return deals.map((doc: any) => ({
      ...doc,
      id: doc._id.toString(),
      _id: undefined,
    })) as Deal[];
  } catch (error) {
    console.error("Error fetching deals:", error);
    return [];
  }
};

export interface Trade {
  id: string;
  symbol: string;
  updated_at: string;
  user_id: string;
  date: string;
  last_event: {
    event: string;
    ts: string;
    payload: {
      action: string;
      active_trades: {
        positions: any[];
        total_profit_usd: number;
        count: number;
        ok: boolean;
      };
      block_reason: string;
      current_bid: number;
      daily_done: boolean;
      decision: string;
      did_trade: boolean;
      mode: string;
      pips_moved?: number;
      profit_usd: number;
      realized_profit_usd: number;
      risk: {
        floating_now: number;
        floating_usd?: number;
        force_close?: boolean;
        halt?: boolean;
        loss_lock: number;
        open_count?: number;
        profit_lock: number;
        realized_today: number;
        realized_usd?: number;
        reason?: string;
        total_pnl: number;
        total_usd?: number;
      };
      risk_from_threshold?: {
        floating_usd: number;
        force_close: boolean;
        halt: boolean;
        open_count: number;
        realized_usd: number;
        reason: string;
        total_usd: number;
      };
      start_price: number;
      symbol: string;
      telemetry?: {
        bias: string;
        crossed_1x: boolean;
        crossed_1x_bias: string;
        crossed_1x_now: boolean;
        crossed_1x_time: string;
        entry_mode: string | null;
        in_entry_window: boolean;
        jumped_over_long: boolean;
        jumped_over_short: boolean;
        late_armed: boolean;
        miss_reason: string;
        momentum_tp_price?: number | null;
        open_count?: number;
        probe_dn: number;
        probe_up: number;
        risk_force_close: boolean;
        risk_halt: boolean;
        risk_reason: string;
        window_hit_count_long: number;
        window_hit_count_short: number;
        x_now: number;
      };
      threshold_x?: number;
      zone_id: number;
    };
  };
}

export const fetchTrades = async (): Promise<Trade[]> => {
  try {
    await dbConnect();
    const trades = await TradeModel.find({})
      .sort({ updated_at: -1 })
      .limit(50)
      .lean();
    return trades.map((doc: any) => ({
      ...doc,
      id: doc._id.toString(),
      _id: undefined,
    })) as Trade[];
  } catch (error) {
    console.error("Error fetching trades:", error);
    return [];
  }
};
