import { redirect } from "next/navigation";

// Daily Inspiration is created as Today-feed editorial content, not configured
// as part of Prayer Studio. Preserve old bookmarks without maintaining a second UI.
export default function DailyInspirationSettingsPage() {
  redirect("/content/new?type=daily_inspiration");
}
