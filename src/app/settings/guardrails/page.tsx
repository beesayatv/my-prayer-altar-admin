import { AdminGate } from "@/components/AdminGate";
import { ConfigurationSectionForm } from "@/components/ConfigurationSectionForm";
import { SettingsNav } from "@/components/SettingsNav";

export default function GuardrailsSettingsPage() {
  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Settings · Daily Prayer</p>
            <h1 className="title">Editorial Guardrails</h1>
            <p className="description">Store the safeguards that will guide future editorial workflows.</p>
          </div>
        </div>
        <SettingsNav />
        <ConfigurationSectionForm section="guardrails" title="Editorial guardrails" description="These guardrails are saved as preferences only; they do not publish or revise content." />
      </main>
    </AdminGate>
  );
}
