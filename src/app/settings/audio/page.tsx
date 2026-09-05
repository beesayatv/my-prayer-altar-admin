import { AdminGate } from "@/components/AdminGate";
import { ConfigurationSectionForm } from "@/components/ConfigurationSectionForm";
import { AmbientMusicManager } from "@/components/AmbientMusicManager";

export default function AudioSettingsPage() {
  return (
    <AdminGate>
      <main className="page space-y-6">
        <div className="page-head">
          <div>
            <p className="eyebrow">Settings · Audio & Ambience</p>
            <h1 className="title">Audio Library</h1>
            <p className="description">Manage narration settings and background instrumental tracks for prayer meditation.</p>
          </div>
        </div>

        <AmbientMusicManager />

        <ConfigurationSectionForm section="audio" title="Audio narration" description="Audio delivery remains separate from this configuration foundation." />
      </main>
    </AdminGate>
  );
}
