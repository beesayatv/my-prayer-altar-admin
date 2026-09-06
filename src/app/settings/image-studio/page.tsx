import { AdminGate } from "@/components/AdminGate";
import { ImageStudioSettingsForm } from "@/components/ImageStudioSettingsForm";

export default function ImageStudioPage() {
  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Studio configuration</p>
            <h1 className="title">Image Studio</h1>
            <p className="description">
              Configure default AI image generation engines, devotional card framing, and test prompts in the live audition sandbox.
            </p>
          </div>
        </div>

        <ImageStudioSettingsForm />
      </main>
    </AdminGate>
  );
}
