import { NextResponse } from "next/server";
import { getAcceptanceTokens } from "@/lib/billing/wompi/client";

let cache: { value: Awaited<ReturnType<typeof getAcceptanceTokens>>; expiresAt: number } | null = null;
const TTL_MS = 50 * 60 * 1000;

export const runtime = "nodejs";

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.value);
  }
  try {
    const tokens = await getAcceptanceTokens();
    cache = { value: tokens, expiresAt: Date.now() + TTL_MS };
    return NextResponse.json(tokens);
  } catch (err) {
    console.error("[acceptance]", err);
    return NextResponse.json({ error: "Wompi unavailable" }, { status: 503 });
  }
}
