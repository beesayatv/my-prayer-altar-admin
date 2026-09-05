"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/AdminGate";
import { requireSupabase } from "@/lib/supabase";

interface Entity {
  id: string;
  entity_type: string;
  slug: string;
  name: string;
  short_title: string | null;
  summary: string;
  aliases: string[];
  status: string;
  access_level: string;
}

export default function BibleEntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    async function loadEntities() {
      setLoading(true);
      const supabase = requireSupabase();
      let query = supabase
        .from("bible_entities")
        .select("id, entity_type, slug, name, short_title, summary, aliases, status, access_level")
        .order("name", { ascending: true });

      if (filterType !== "all") {
        query = query.eq("entity_type", filterType);
      }

      const { data } = await query;
      if (data) setEntities(data);
      setLoading(false);
    }
    loadEntities();
  }, [filterType]);

  const entityTypes = [
    "all", "person", "place", "event", "scripture", "concept",
    "object", "explainer", "map", "timeline", "collection", "comparison"
  ];

  const handleCleanup = async () => {
    if (!confirm("CAUTION: This will permanently delete all canonical entities that are NOT currently linked in any story or chapter block.\n\nAny work-in-progress entities you created but haven't used yet will be deleted. Proceed?")) return;
    
    setCleaning(true);
    try {
      const { adminAuthorizationHeader } = await import("@/lib/supabase");
      const authHeaders = await adminAuthorizationHeader();
      const res = await fetch("/api/admin/bible/entities/cleanup", {
        method: "POST",
        headers: authHeaders
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Cleanup failed.");
      alert(`Cleanup successful! Deleted ${json.deletedCount} unused entities.`);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to run cleanup.");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">My Bible Studio</p>
            <h1 className="title">Canonical Reusable Entities</h1>
            <p className="description">
              Manage ground-truth Bible records across all 11 canonical types (People, Places, Scriptures, Explainers, etc.).
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              type="button" 
              onClick={handleCleanup} 
              disabled={cleaning}
              className="button secondary bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 disabled:opacity-50"
            >
              {cleaning ? "Cleaning..." : "Cleanup Unused"}
            </button>
            <Link href="/bible/stories" className="button secondary">
              Back to Stories
            </Link>
            <Link href="/bible/entities/new" className="button primary">
              + New Entity
            </Link>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto py-3">
          {entityTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
                filterType === t
                  ? "bg-amber-600 text-white"
                  : "bg-beige text-ink/70 hover:bg-beige/80"
              }`}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <div className="content-card mt-4">
          {loading ? (
            <p className="text-muted p-4">Loading canonical entities...</p>
          ) : entities.length === 0 ? (
            <p className="text-muted p-4">No entities found for type: {filterType}.</p>
          ) : (
            <div className="divide-y divide-line">
              {entities.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-beige/30 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/bible/entities/${item.id}`} className="font-bold text-ink text-base hover:text-amber-700 transition-colors">
                        {item.name}
                      </Link>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold uppercase">
                        {item.entity_type}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold uppercase">
                        {item.status}
                      </span>
                    </div>
                    <p className="text-sm text-ink/80 mt-1 max-w-2xl line-clamp-2">{item.summary}</p>
                    {item.aliases && item.aliases.length > 0 && (
                      <p className="text-xs text-muted mt-1">
                        Aliases: {item.aliases.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <Link href={`/bible/entities/${item.id}`} className="button secondary compact text-xs">
                      Edit Entity →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </AdminGate>
  );
}
