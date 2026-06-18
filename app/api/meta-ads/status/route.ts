import { NextResponse } from "next/server";

import { metaAdsLogger } from "@/lib/meta-ads/logger";
import { getLatestMetaAdsRun } from "@/lib/meta-ads/status-store";

export async function GET() {
  try {
    const run = await getLatestMetaAdsRun();
    return NextResponse.json({ run });
  } catch {
    metaAdsLogger.error("Meta Ads status lookup failed");
    return NextResponse.json({ error: "Meta Ads status lookup failed" }, { status: 500 });
  }
}
