import { NextRequest, NextResponse } from "next/server";

import { searchKrogerProducts } from "@/lib/krogerClient";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const term = url.searchParams.get("term")?.trim() ?? "";
  const locationId = url.searchParams.get("locationId")?.trim() || undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  if (!term) {
    return NextResponse.json(
      { error: "Missing required 'term' query parameter." },
      { status: 400 },
    );
  }

  try {
    const data = await searchKrogerProducts({ term, locationId, limit });

    return NextResponse.json({
      query: {
        term,
        locationId: locationId ?? null,
        limit: data.meta?.pagination?.limit ?? limit ?? null,
      },
      result: data,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach the Kroger API";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
