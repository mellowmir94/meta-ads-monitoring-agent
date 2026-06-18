import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "meta-ads-monitoring-agent",
    version: "0.1.0"
  });
}
