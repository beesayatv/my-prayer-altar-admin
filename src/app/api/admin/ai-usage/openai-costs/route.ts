import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "A valid administrator session is required." }, { status: 401 });
  }

  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ success: true, isConfigured: false, totalSpendUsd: null });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const periodStr = searchParams.get("period") || "30";
    const periodDays = Math.min(180, Math.max(1, Number(periodStr) || 30));

    // Calculate start time in unix seconds (integer)
    const startedAtMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    const startTimeSeconds = Math.floor(startedAtMs / 1000);

    const openAiUrl = `https://api.openai.com/v1/organization/costs?start_time=${startTimeSeconds}&limit=${periodDays}`;
    const response = await fetch(openAiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI Costs API error:", errText);
      return NextResponse.json({ success: false, isConfigured: true, error: "OpenAI Costs API request failed." }, { status: response.status });
    }

    const json = (await response.json()) as {
      data?: Array<{
        results?: Array<{
          amount?: {
            value?: number;
            currency?: string;
          };
        }>;
      }>;
    };

    let totalSpendUsd = 0;
    if (json.data && Array.isArray(json.data)) {
      for (const bucket of json.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const res of bucket.results) {
            if (res.amount && typeof res.amount.value === "number") {
              totalSpendUsd += res.amount.value;
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      isConfigured: true,
      totalSpendUsd: Number(totalSpendUsd.toFixed(4)),
    });
  } catch (error) {
    console.error("Failed to fetch OpenAI Costs:", error);
    return NextResponse.json({ success: false, isConfigured: true, error: "Failed to query OpenAI organization costs." }, { status: 500 });
  }
}
