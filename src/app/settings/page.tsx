import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";

const areas = [
  { title: "Daily Prayer", description: "Generation, queue schedule, and editorial prompt defaults for Today.", href: "/settings/daily-prayer", action: "Open Daily Prayer" },
  { title: "Text Studio", description: "Set default AI drafting models (Google Gemini & OpenAI) across prayers, scripture, and news.", href: "/settings/text-studio", action: "Open Text Studio" },
  { title: "Voice Studio", description: "Audition and configure text-to-speech engines, voices, and narration speeds.", href: "/settings/voice-studio", action: "Open Voice Studio" },
  { title: "Image Studio", description: "Configure default AI image generation engines, devotional card framing, and preview tests.", href: "/settings/image-studio", action: "Open Image Studio" },
  { title: "Today Feed Schedule", description: "Set the publish time and expiry rhythm used when Studio suggests the next content slot.", href: "/settings/today-schedule", action: "Manage Schedule Rules" },
  { title: "Emergency Controls", description: "Temporarily pause the Today Feed while you diagnose unusual traffic or perform maintenance.", href: "/settings/emergency-controls", action: "Open Emergency Controls" },
  { title: "Personal Prayer AI", description: "Personal prayer prompt, word length, and Catholic doctrinal guardrails.", href: "/settings/ai-prompt", action: "Open Personal Prayer AI" },
  { title: "Media Library", description: "Daily Prayer image pool, altar video loops, and ambient instrumental music tracks.", href: "/settings/media-library", action: "Open Media Library" },
  { title: "Storage Optimization", description: "Clean up orphaned CDN files safely.", href: "/settings/storage", action: "Open Storage" },
];

export default function SettingsPage() {
  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Studio configuration</p>
            <h1 className="title">Settings</h1>
            <p className="description">Choose an area to configure. Existing settings and workflows remain unchanged.</p>
          </div>
        </div>
        <div className="settings-grid">
          {areas.map((area) => (
            <Link className="settings-card" href={area.href} key={area.href}>
              <p className="eyebrow">Configuration</p>
              <h2>{area.title}</h2>
              <p>{area.description}</p>
              <span>{area.action} <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </main>
    </AdminGate>
  );
}
