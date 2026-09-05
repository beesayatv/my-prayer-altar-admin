import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/authServer";
import { generateUpdateDraft } from "@/lib/ai/updateGenerator";

// Basic SSRF protection
function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    // Block obvious private networks or localhost
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
      hostname.includes(".local") ||
      hostname.includes(".internal")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Simple HTML to text extractor (avoids needing heavy dependencies)
function extractTextFromHtml(html: string): string {
  // Remove script and style blocks entirely
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, " ")
             .replace(/&amp;/g, "&")
             .replace(/&lt;/g, "<")
             .replace(/&gt;/g, ">")
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'")
             .replace(/&mdash;/g, "—")
             .replace(/&ndash;/g, "–");
             
  // Collapse multiple whitespace/newlines into single spaces or double newlines
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n\n");
  
  return text.trim();
}

export async function POST(request: Request) {
  try {
    // 1. Verify Active Admin Session
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.userId) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized. Active admin session required." },
        { status: 401 }
      );
    }

    // 2. Parse payload
    const body = await request.json();
    const { url, length } = body as { url?: string; length?: "short" | "standard" | "long" };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "A valid URL is required." }, { status: 400 });
    }

    if (!isSafeUrl(url)) {
      return NextResponse.json({ success: false, error: "Invalid or blocked URL." }, { status: 400 });
    }

    // 3. Fetch URL securely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

    let html = "";
    try {
      const fetchResponse = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "MyPrayerAltar/1.0 (Admin Content Importer)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });

      if (!fetchResponse.ok) {
        return NextResponse.json(
          { success: false, error: `Failed to fetch URL: HTTP ${fetchResponse.status}` },
          { status: 400 }
        );
      }
      
      const contentLength = fetchResponse.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: "Webpage is too large (> 5MB)." }, { status: 400 });
      }
      
      html = await fetchResponse.text();
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
         return NextResponse.json({ success: false, error: "Request timed out while fetching the URL." }, { status: 408 });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    // 4. Extract Text
    const textContent = extractTextFromHtml(html);
    
    if (textContent.length < 50) {
      return NextResponse.json(
        { success: false, error: "Could not extract sufficient readable text from this webpage." },
        { status: 400 }
      );
    }

    // 5. Call OpenAI
    const draft = await generateUpdateDraft({
      url,
      textContent,
      length: length || "standard",
    });

    return NextResponse.json({
      success: true,
      draft,
    });
  } catch (err) {
    console.error("URL Import exception:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}
