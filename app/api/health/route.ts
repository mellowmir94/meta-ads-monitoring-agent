import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "malaysia-enterprise-ai-saas",
    version: "0.1.0"
  });
}

