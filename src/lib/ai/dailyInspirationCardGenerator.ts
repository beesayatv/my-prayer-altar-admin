import "server-only";
import sharp from "sharp";
import { safeLogAdminAiUsage } from "./aiLogger";
import { runtimeEnv } from "@/lib/runtimeEnv";

export async function generateDailyInspirationCard(input: {
  instruction: string;
  visualDirection?: string;
  model?: string;
  aspectRatio?: string;
  footerText?: string;
  borderStyle?: string;
}) {
  const apiKey = runtimeEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Image generation is not configured.");

  const model = input.model || "gpt-image-2";
  const aspectRatio = input.aspectRatio || "4:5";

  let apiSize = "1024x1536";
  let width = 1080;
  let height = 1350;
  let cardType = "vertical devotional social card";
  let cropInstructions = "The final crop is 4:5. Keep every word comfortably inside the central 4:5 safe area, with generous margins.";

  if (aspectRatio === "16:9") {
    apiSize = "1792x1024";
    width = 1920;
    height = 1080;
    cardType = "horizontal landscape devotional card";
    cropInstructions = "The final crop is 16:9. Keep every word comfortably inside the central 16:9 safe area, with generous margins.";
  } else if (aspectRatio === "9:16") {
    apiSize = "1024x1792";
    width = 1080;
    height = 1920;
    cardType = "vertical story/portrait devotional card";
    cropInstructions = "The final crop is 9:16. Keep every word comfortably inside the central 9:16 safe area, with generous margins.";
  }

  const instruction = input.instruction.trim();
  const footer = input.footerText?.trim() ?? "MY PRAYER ALTAR";

  const borderInstruction = (() => {
    switch (input.borderStyle) {
      case "thin": return "Add a clean, thin solid border (2–3px) in a neutral or complementary colour around the full edge of the card.";
      case "decorative": return "Add an ornate decorative border — thin gold or aged-parchment filigree, with delicate corner flourishes — that frames the card elegantly without overwhelming the content.";
      case "glow": return "Add a soft glowing inner-edge border — a subtle luminous halo in warm gold or white that blends into the background — giving the card a radiant, sacred quality.";
      case "none": return "Do not add any border, frame, or edge decoration to the card.";
      default: return null; // no explicit instruction — let the model decide
    }
  })();

  const prompt = [
    `Create one finished ${cardType} for My Prayer Altar.`,
    cropInstructions,
    "Use a refined, reverent Catholic-inspired visual style. Treat the user's instruction as the primary creative direction.",
    "If the user's instruction includes text in quotation marks, reproduce the quoted text verbatim as the main message: do not correct, shorten, paraphrase, translate, add quotation marks, or add other message text.",
    "If no exact quoted text is supplied, compose one short, memorable original Christian reflection for the image.",
    "Do not attribute the reflection to Scripture, a saint, or any person. Do not invent a Scripture reference.",
    footer
      ? `The only additional text permitted is the small footer at the bottom of the card: ${footer}.`
      : "Do not add any footer, watermark, attribution, or branding text to the card.",
    "Do not add a title, a DAILY INSPIRATION heading, a Scripture reference, a watermark, UI, or logo.",
    borderInstruction,
    input.visualDirection?.trim() ? `Visual direction: ${input.visualDirection.trim().slice(0, 600)}.` : "Visual direction: quiet, warm, contemplative, editorial, and elegant.",
    `Card instruction:\n${instruction}`,
  ].filter(Boolean).join("\n\n");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, size: apiSize, quality: "medium", n: 1 }),
  });
  const requestId = response.headers.get("x-request-id") || null;
  if (!response.ok) {
    await safeLogAdminAiUsage({ feature: "daily_inspiration_card", model, status: "failed", error_code: `openai_http_${response.status}`, request_id: requestId });
    throw new Error("The image service could not create this card.");
  }

  const data = await response.json() as { data?: Array<{ b64_json?: string }> };
  const encoded = data.data?.[0]?.b64_json;
  if (!encoded) throw new Error("The image service returned no card image.");
  await safeLogAdminAiUsage({ feature: "daily_inspiration_card", model, status: "success", request_id: requestId });
  return sharp(Buffer.from(encoded, "base64")).resize(width, height, { fit: "cover", position: "attention" }).webp({ quality: 92 }).toBuffer();
}
