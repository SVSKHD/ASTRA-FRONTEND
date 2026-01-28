import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";

export interface UserBalance {
  id: string; // Document ID
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

const COLLECTION_NAME = "Astra-user-balance";

export const subscribeToUserBalances = (
  callback: (balances: UserBalance[]) => void,
) => {
  const q = query(collection(db, COLLECTION_NAME));
  return onSnapshot(q, (snapshot) => {
    const balances = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as UserBalance[];
    console.log("balances collection", balances);
    callback(balances);
  });
};

export interface Deal {
  id: string; // Document ID
  ticket: number;
  login?: number; // Not in the provided object, but maybe useful? Keeping generic if needed or removing.
  time: string;
  type: number;
  symbol: string;
  volume: number;
  price: number;
  profit_usd: number; // Changed from profit
  swap: number;
  commission: number;
  comment: string;
  // New fields
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

const DEALS_COLLECTION_NAME = "Astra-symbol-account-deals";

export const subscribeToDeals = (callback: (deals: Deal[]) => void) => {
  const q = query(
    collection(db, DEALS_COLLECTION_NAME),
    orderBy("time", "desc"),
    limit(50),
  );
  return onSnapshot(q, (snapshot) => {
    const deals = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Deal[];
    console.log("deals collection", deals);
    callback(deals);
  });
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

const TRADES_COLLECTION_NAME = "Astra-symbol-trades";

export const subscribeToTrades = (callback: (trades: Trade[]) => void) => {
  const q = query(
    collection(db, TRADES_COLLECTION_NAME),
    orderBy("updated_at", "desc"),
    limit(50),
  );
  return onSnapshot(q, (snapshot) => {
    const trades = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Trade[];
    console.log("trades collection", trades);
    callback(trades);
  });
};
