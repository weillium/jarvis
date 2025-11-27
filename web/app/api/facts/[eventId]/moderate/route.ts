"use server";

import { NextRequest, NextResponse } from "next/server";
import { updateFactActiveStatus } from "@/server/actions/fact-actions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "Missing eventId parameter" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const factKey: string | undefined = body?.factKey;
    const isActive: boolean = body?.isActive !== false;
    const reason: string | undefined =
      typeof body?.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim()
        : undefined;

    if (!factKey || typeof factKey !== "string") {
      return NextResponse.json(
        { ok: false, error: "factKey is required" },
        { status: 400 },
      );
    }

    const { ok, error } = await updateFactActiveStatus(
      eventId,
      factKey,
      isActive,
      { reason },
    );
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: error ?? "Failed to update fact status" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
