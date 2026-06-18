import { applicationStatuses } from "@/lib/applysharp";
import { deleteApplication, updateApplicationStatus } from "@/lib/application-repository";
import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const updateApplicationSchema = z.object({
  status: z.enum(applicationStatuses),
  note: z.string().max(1_000).optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = updateApplicationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid application status payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    const result = await updateApplicationStatus(id, parsed.data.status, parsed.data.note, userScope);

    return NextResponse.json({ application: result.data, storage: result.storage, warning: result.warning, userScope: userScope.source });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Application update failed"
      },
      { status: 404 }
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const result = await deleteApplication(id, userScope);

    return NextResponse.json({ application: result.data, deleted: true, storage: result.storage, warning: result.warning, userScope: userScope.source });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Application delete failed"
      },
      { status: 404 }
    );
  }
}
