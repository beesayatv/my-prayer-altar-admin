"use client";

import { useEffect, useState } from "react";
import { adminAuthorizationHeader } from "@/lib/supabase";

interface EntityPreview {
  id: string;
  entity_type: string;
  slug: string;
  name: string;
  summary: string;
}

export function EntityPickerModal({
  isOpen,
  onClose,
  onSelectEntity
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectEntity: (entity: EntityPreview) => void;
}) {
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState<EntityPreview[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const authHeaders = await adminAuthorizationHeader();
        const url = search.trim()
          ? `/api/admin/bible/entities?search=${encodeURIComponent(search.trim())}`
          : `/api/admin/bible/entities`;
        const res = await fetch(url, { headers: authHeaders });
        const json = await res.json();
        if (json.entities) setEntities(json.entities);
      } catch (err) {
        console.error("Entity search error", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [isOpen, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h3 className="font-bold text-ink text-base">Select Canonical Entity</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>

        <div className="p-4 border-b border-line bg-beige/30">
          <input
            type="text"
            placeholder="Search entity name, alias, or summary..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 divide-y divide-line">
          {loading ? (
            <p className="text-muted text-center py-6">Searching entities...</p>
          ) : entities.length === 0 ? (
            <p className="text-muted text-center py-6">No canonical entities found.</p>
          ) : (
            entities.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  onSelectEntity(item);
                  onClose();
                }}
                className="py-3 px-2 hover:bg-beige/40 rounded-lg cursor-pointer flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink text-sm">{item.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase font-semibold">
                      {item.entity_type}
                    </span>
                  </div>
                  <p className="text-xs text-muted line-clamp-1 mt-0.5">{item.summary}</p>
                </div>
                <button type="button" className="button secondary compact text-xs">
                  Select
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-line text-right bg-sand/20">
          <button type="button" onClick={onClose} className="button secondary compact">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
