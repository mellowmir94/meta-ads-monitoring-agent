import { askDepartmentAssistant } from "@/lib/department-intelligence";
import { resolveDemoTenantContext } from "@/lib/tenant";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  department: z.enum(["Executive", "Finance", "Sales", "Operations", "HR", "Procurement", "Support"]),
  message: z.string().min(2),
  visualPrompt: z.string().min(2)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  }

  try {
    const result = askDepartmentAssistant(
      resolveDemoTenantContext(),
      parsed.data.department,
      parsed.data.message,
      parsed.data.visualPrompt
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to answer chat request." },
      { status: 403 }
    );
  }
}

