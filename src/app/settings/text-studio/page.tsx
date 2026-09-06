import { AdminGate } from "@/components/AdminGate";
import { TextStudioSettingsForm } from "@/components/TextStudioSettingsForm";

export default function TextStudioPage() {
  return (
    <AdminGate>
      <main className="page space-y-6">
        <div className="page-head">
          <div>
            <p className="eyebrow">Creation &amp; Publishing</p>
            <h1 className="title">Text Studio</h1>
            <p className="description">
              Set default AI drafting engines (Google Gemini &amp; OpenAI) across daily prayers, scripture reflections, news updates, and bible stories.
            </p>
          </div>
        </div>

        <TextStudioSettingsForm />
      </main>
    </AdminGate>
  );
}
