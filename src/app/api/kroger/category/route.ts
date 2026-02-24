import { NextRequest, NextResponse } from "next/server";

import { fetchCategoryPage } from "@/lib/krogerCategoryCrawler";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category")?.trim();
  const locationParam = url.searchParams.get("locationId")?.trim();
  const limitParam = url.searchParams.get("limit");
  const pageParam = url.searchParams.get("page");
  const saleOnlyParam = url.searchParams.get("saleOnly");
  const locationId = locationParam || process.env.KROGER_LOCATION_ID?.trim() || "";

  if (!category) {
    return NextResponse.json({ error: "Missing required 'category' query parameter." }, { status: 400 });
  }

  if (!locationId) {
    return NextResponse.json(
      { error: "Missing location ID. Provide locationId query param or set KROGER_LOCATION_ID." },
      { status: 400 },
    );
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  const page = pageParam ? Number(pageParam) : undefined;
  const saleOnly = saleOnlyParam !== "false";

  try {
    const data = await fetchCategoryPage({ category, locationId, limit, page, saleOnly });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to crawl category";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
