"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AdminGate } from "@/components/AdminGate";
import { ContentEditor } from "@/components/ContentEditor";

function NewContentForm() {
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type") || "church_highlight";
  const allowedTypes = new Set(["church_highlight", "daily_prayer", "daily_inspiration", "bible_reading", "update", "faith_story", "video_feature"]);
  const type = allowedTypes.has(requestedType) ? requestedType : "church_highlight";

  return <ContentEditor contentType={type} />;
}

export default function Page() {
  return (
    <AdminGate>
      <main>
        <Suspense fallback={<div className="p-10 text-muted">Loading editor...</div>}>
          <NewContentForm />
        </Suspense>
      </main>
    </AdminGate>
  );
}
