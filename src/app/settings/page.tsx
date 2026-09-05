import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";

const areas = [
  { title: "Daily Prayer", description: "Generation, schedule, narration, and publishing defaults for Today.", href: "/settings/daily-prayer", action: "Open Daily Prayer" },
  { title: "Today Feed Schedule", description: "Set the publish time and expiry rhythm used when Studio suggests the next content slot.", href: "/settings/today-schedule", action: "Manage Schedule Rules" },
  { title: "Emergency Controls", description: "Temporarily pause the Today Feed while you diagnose unusual traffic or perform maintenance.", href: "/settings/emergency-controls", action: "Open Emergency Controls" },
  { title: "My Altar", description: "Personal-prayer prompt, word length, and free-tier narration defaults.", href: "/settings/ai-prompt", action: "Open My Altar" },
  { title: "Media Library", description: "Daily Prayer visual pool, altar video loops, and background music.", href: "/settings/media-library", action: "Open Media Library" },
  { title: "Audio & Ambience", description: "Background music and shared audio configuration.", href: "/settings/audio", action: "Open Audio Settings" },
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
