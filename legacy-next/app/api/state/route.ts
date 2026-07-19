// src/app/api/state/route.ts
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";

export const runtime = "nodejs"; // required for mongoose on Netlify

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "XAUUSD").toUpperCase();

    await dbConnect();

    const collectionName = `ASTRA-${symbol}-DB`;

    const doc = await (global as any).mongoose.conn.connection.db
      .collection(collectionName)
      .find({})
      .sort({ ts: -1 })
      .limit(1)
      .next();

    return NextResponse.json({
      ok: true,
      symbol,
      collection: collectionName,
      data: doc ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
