import { AdminGate } from "@/components/AdminGate";
import { MediaLibraryManager } from "@/components/MediaLibraryManager";

export default function MediaLibrarySettingsPage() {
  return (
    <AdminGate>
      <main className="page space-y-6">
        <div className="page-head">
          <div>
            <p className="eyebrow">Settings · Visual Assets &amp; Video Loops</p>
            <h1 className="title">Media Library &amp; Visual Pools</h1>
            <p className="description">
              Manage Daily Prayer image pools and My Altar ambient 16:9 video loops in one place.
            </p>
          </div>
        </div>

        <MediaLibraryManager />
      </main>
    </AdminGate>
  );
}
