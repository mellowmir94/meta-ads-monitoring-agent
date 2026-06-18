import { generateVisualRequest } from "@/lib/department-intelligence";
import { resolveDemoTenantContext } from "@/lib/tenant";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  department: z.enum(["Executive", "Finance", "Sales", "Operations", "HR", "Procurement", "Support"]),
  prompt: z.string().min(2)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid visual request." }, { status: 400 });
  }

  try {
    const result = generateVisualRequest(
      resolveDemoTenantContext(),
      parsed.data.department,
      parsed.data.prompt
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate visual." },
      { status: 403 }
    );
  }
}

