"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { ContentEditor, type EditorContentItem } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<EditorContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: loadError } = await requireSupabase()
        .from("content_items")
        .select("*")
        .eq("id", id)
        .single();

      if (loadError || !data) {
        setItem(null);
        setError("This content item could not be opened. Please return to the content list and try again.");
        return;
      }
      setItem(data as EditorContentItem);
    } catch {
      setItem(null);
      setError("This content item could not be opened. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load, refreshCount]);

  return (
    <AdminGate>
      <main>
        {loading && <div className="p-10 text-muted">Loading editor...</div>}
        {!loading && error && <div className="p-10"><div className="alert error" role="alert">{error} <button className="button compact" onClick={() => void load()}>Retry</button></div></div>}
        {!loading && item && <ContentEditor initial={item} onCoverChange={() => setRefreshCount((count) => count + 1)} />}
      </main>
    </AdminGate>
  );
}
