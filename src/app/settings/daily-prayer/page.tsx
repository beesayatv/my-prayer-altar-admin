import { AdminGate } from "@/components/AdminGate";
import { DailyPrayerTargetSettingsForm } from "@/components/DailyPrayerTargetSettingsForm";

export default function DailyPrayerSettingsPage() {
  return (
    <AdminGate>
      <main className="page space-y-6">
        <div className="page-head">
          <div>
            <p className="eyebrow">Engine &amp; Automation Configuration</p>
            <h1 className="title">Daily Prayer Engine</h1>
            <p className="description">
              Manage automatic generation schedules, weekly day intentions, custom AI system instructions, and narration settings in one place.
            </p>
          </div>
        </div>

        <DailyPrayerTargetSettingsForm />
      </main>
    </AdminGate>
  );
}
