import mongoose from "mongoose";

const UserBalanceSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    balance: Number,
    company: String,
    connected: Boolean,
    credit: Number,
    currency: String,
    date: String,
    equity: Number,
    leverage: Number,
    limit_orders: Number,
    login: Number,
    margin: Number,
    margin_free: Number,
    margin_level: Number,
    name: String,
    ok: Boolean,
    profit: Number,
    server: String,
    terminal_info: Boolean,
    trade_mode: Number,
    ts_server: String,
    ts_utc: String,
    updated_at: String,
    userEmail: String,
  },
  { collection: "Astra-user-balance", timestamps: false, strict: false },
);

export default mongoose.models.UserBalance ||
  mongoose.model("UserBalance", UserBalanceSchema);
