import { redirect } from "next/navigation";

// Daily Inspiration image generation defaults are configured in Image Studio.
export default function DailyInspirationSettingsPage() {
  redirect("/settings/image-studio");
}
