import { NextResponse } from "next/server";

import { runMetaAdsSetupCheck } from "@/lib/meta-ads/setup-check";

export async function GET() {
  return NextResponse.json(runMetaAdsSetupCheck());
}
