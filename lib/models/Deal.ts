import mongoose from "mongoose";

const DealSchema = new mongoose.Schema(
  {
    ticket: Number,
    login: Number,
    time: String,
    type: Number,
    symbol: String,
    volume: Number,
    price: Number,
    profit_usd: Number,
    swap: Number,
    commission: Number,
    comment: String,
    date: String,
    deal: Number,
    deal_id: String,
    entry: Number,
    fee: Number,
    magic: Number,
    order: Number,
    position_id: Number,
    side: String,
    time_msc: Number,
    updated_at: String,
    user_id: { type: String, required: true },
  },
  {
    collection: "Astra-symbol-account-deals",
    timestamps: false,
    strict: false,
  },
);

export default mongoose.models.Deal || mongoose.model("Deal", DealSchema);
