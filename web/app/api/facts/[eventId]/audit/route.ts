"use server";

import { NextRequest, NextResponse } from "next/server";
import { getFactAuditLog } from "@/server/actions/fact-actions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    if (!eventId) {
      return NextResponse.json({
        ok: false,
        error: "Missing eventId parameter",
      }, { status: 400 });
    }

    const factKey = req.nextUrl.searchParams.get("factKey");
    if (!factKey) {
      return NextResponse.json({
        ok: false,
        error: "factKey query parameter is required",
      }, { status: 400 });
    }

    const { data, error } = await getFactAuditLog(eventId, factKey);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, entries: data ?? [] }, {
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
