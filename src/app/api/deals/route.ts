import { NextResponse } from "next/server";

import { getDeals } from "@/lib/dealsService";

export async function GET() {
  try {
    const products = await getDeals();
    return NextResponse.json({
      products,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load deals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
