import { AdminGate } from "@/components/AdminGate";
import { VoiceStudioSettingsForm } from "@/components/VoiceStudioSettingsForm";

export default function VoiceStudioPage() {
  return (
    <AdminGate>
      <main className="page space-y-6">
        <div className="page-head">
          <div>
            <p className="eyebrow">AI Audio &amp; Narration Studio</p>
            <h1 className="title">Voice Studio</h1>
            <p className="description">
              Audition and configure text-to-speech engines, devotional voices, and speech rates for Daily Prayer and Scripture narrations.
            </p>
          </div>
        </div>

        <VoiceStudioSettingsForm />
      </main>
    </AdminGate>
  );
}
