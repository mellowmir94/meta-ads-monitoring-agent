import { NextResponse } from "next/server";

import { getMetaAdsEnv } from "@/lib/meta-ads/env";
import { metaAdsLogger } from "@/lib/meta-ads/logger";
import { runMetaAdsAgent } from "@/lib/meta-ads/runner";

export async function POST(request: Request) {
  const env = getMetaAdsEnv();

  if (env.META_ADS_RUN_SECRET) {
    const secret = request.headers.get("x-meta-ads-run-secret");
    if (secret !== env.META_ADS_RUN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const runType = url.searchParams.get("type") === "weekly" ? "weekly" : "daily";

  try {
    const result = await runMetaAdsAgent(runType);
    return NextResponse.json(result);
  } catch {
    metaAdsLogger.error("Meta Ads API-triggered run failed", { runType });
    return NextResponse.json({ error: "Meta Ads run failed" }, { status: 500 });
  }
}
