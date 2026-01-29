import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";

export async function GET() {
  try {
    await dbConnect();
    return NextResponse.json(
      { status: "Connected to MongoDB" },
      { status: 200 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { status: "Failed to connect", error: error.message },
      { status: 500 },
    );
  }
}
