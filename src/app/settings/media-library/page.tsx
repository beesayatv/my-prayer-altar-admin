import { AdminGate } from "@/components/AdminGate";
import { MediaLibraryManager } from "@/components/MediaLibraryManager";

export default function MediaLibrarySettingsPage() {
  return (
    <AdminGate>
      <main className="page space-y-6">
        <div className="page-head">
          <div>
            <p className="eyebrow">Settings · Visual Assets &amp; Audio Media</p>
            <h1 className="title">Media Library</h1>
            <p className="description">
              Manage Daily Prayer images, altar video loops, and ambient instrumental background music in one place.
            </p>
          </div>
        </div>

        <MediaLibraryManager />
      </main>
    </AdminGate>
  );
}
