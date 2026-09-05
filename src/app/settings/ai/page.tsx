import { AdminGate } from "@/components/AdminGate";
import { ConfigurationSectionForm } from "@/components/ConfigurationSectionForm";
import { SettingsNav } from "@/components/SettingsNav";

export default function AiSettingsPage() {
  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Settings · Daily Prayer</p>
            <h1 className="title">AI Model Defaults</h1>
            <p className="description">Keep the drafting preferences for Daily Prayer in one deliberate place.</p>
          </div>
        </div>
        <SettingsNav />
        <ConfigurationSectionForm section="ai" title="AI model defaults" description="These are persistent configuration values, not an AI connection or generation command." />
      </main>
    </AdminGate>
  );
}
