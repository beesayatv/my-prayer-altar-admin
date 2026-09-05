import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";
import { processDailyPrayerQueue } from "@/lib/ai/queueProcessor";

export async function POST(request: Request) {
  try {
    // 1. Verify Authenticated Active Admin Session
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.userId) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized access. Valid admin session required." },
        { status: 401 }
      );
    }

    // 2. Process Daily Prayer Queue passing user JWT token for PostgREST RLS
    const result = await processDailyPrayerQueue(auth.userId, auth.token);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Queue Processor API Error:", error);
    const message = error instanceof Error ? error.message : "An unexpected server error occurred.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
