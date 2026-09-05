import { AdminGate } from "@/components/AdminGate";
import { StorageClient } from "./StorageClient";
import Link from "next/link";

export default function StorageOptimizationPage() {
  return (
    <AdminGate>
      <main className="page space-y-6">
        <div className="page-head">
          <div>
            <Link href="/settings" className="eyebrow block mb-2 hover:opacity-80 transition-opacity">
              ← Back to Settings
            </Link>
            <h1 className="title">Storage Optimization</h1>
            <p className="description">
              Safely remove orphaned CDN files that were left behind when users deleted their personal prayers.
            </p>
          </div>
        </div>
        
        <StorageClient />
      </main>
    </AdminGate>
  );
}
