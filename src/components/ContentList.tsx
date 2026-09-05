"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { requireSupabase } from "@/lib/supabase";

type Row = {
  id: string;
  title: string;
  type: string;
  content_status: string;
  location_name: string | null;
  updated_at: string;
  metadata: Record<string, string>;
};

const PAGE_SIZE = 50;

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value)).replace(",", "");
}

export function ContentList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = (searchParams.get("type") ?? "all") as "all" | "church_highlight" | "daily_prayer" | "daily_inspiration" | "bible_reading" | "update" | "faith_story";
  const statusFilter = (searchParams.get("status") ?? "all") as "all" | "live" | "scheduled" | "draft" | "archived";

  function setFilter(type: string, status: string) {
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    const qs = params.toString();
    router.replace(qs ? `/content?${qs}` : "/content");
  }

  function handleTabChange(type: typeof activeTab) {
    setFilter(type, statusFilter);
    setSelectedIds([]);
    setFeedbackMessage(null);
  }

  function handleStatusChange(status: typeof statusFilter) {
    setFilter(activeTab, status);
  }

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Selection & Bulk Action States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  const load = useCallback(async (append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError("");
    if (!append) setSelectedIds([]);
    let query = requireSupabase()
      .from("content_items")
      .select("id,title,type,content_status,location_name,updated_at,metadata")
      .order("updated_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (activeTab !== "all") {
      query = query.eq("type", activeTab);
    }
    if (statusFilter === "archived") {
      query = query.eq("content_status", "archived");
    } else if (statusFilter === "draft") {
      query = query.eq("content_status", "draft");
    }
    if (append && cursor) query = query.lt("updated_at", cursor);

    const { data, error: loadError } = await query;
    if (loadError) {
      setError("Could not load content items. Please try again.");
    } else {
      const page = (data ?? []) as Row[];
      let filtered = page.slice(0, PAGE_SIZE);
      const now = new Date();
      if (statusFilter === "live") {
        filtered = filtered.filter((r) => {
          if (r.content_status !== "ready") return false;
          const pubDate = r.metadata?.publish_at ? new Date(r.metadata.publish_at) : null;
          const expDate = r.metadata?.expire_at ? new Date(r.metadata.expire_at) : null;
          const premiumExpDate = expDate ? new Date(expDate.getTime() + 5 * 24 * 60 * 60 * 1000) : null;
          return (!pubDate || pubDate <= now) && (!premiumExpDate || premiumExpDate > now);
        });
      } else if (statusFilter === "scheduled") {
        filtered = filtered.filter((r) => {
          if (r.content_status !== "ready") return false;
          const pubDate = r.metadata?.publish_at ? new Date(r.metadata.publish_at) : null;
          return pubDate && pubDate > now;
        });
      }
      setRows((current) => append ? [...current, ...filtered] : filtered);
      setHasMore(page.length > PAGE_SIZE);
      setCursor(filtered.at(-1)?.updated_at ?? null);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [activeTab, cursor, statusFilter]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRef.current(), 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, statusFilter]);


  // Handle Select All Checkbox
  const allVisibleIds = rows.map((r) => r.id);
  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));

  function handleToggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allVisibleIds);
    }
  }

  // Handle Individual Row Selection
  function handleToggleSelectRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // Bulk Archive Action
  async function handleBulkArchive() {
    if (selectedIds.length === 0 || isProcessingBulk) return;
    setIsProcessingBulk(true);
    setFeedbackMessage(null);

    try {
      const supabase = requireSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/admin/content/bulk-archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to archive selected items.");
      }

      setFeedbackMessage({
        type: "success",
        text: `${json.count} item(s) archived.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      setSelectedIds([]);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Archive operation failed.";
      setFeedbackMessage({ type: "error", text: msg });
      setTimeout(() => setFeedbackMessage(null), 6000);
    } finally {
      setIsProcessingBulk(false);
    }
  }

  // Bulk Delete Action
  async function handleBulkDelete() {
    if (selectedIds.length === 0 || isProcessingBulk) return;

    const count = selectedIds.length;
    const confirmDelete = window.confirm(
      `Permanently delete ${count} selected content item(s)? Their own uploaded/generated media will be removed, while shared Media Library assets are kept. This action cannot be undone.`
    );

    if (!confirmDelete) {
      setFeedbackMessage({ type: "info", text: "Deletion cancelled." });
      return;
    }

    setIsProcessingBulk(true);
    setFeedbackMessage(null);

    try {
      const supabase = requireSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/admin/content/bulk-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to delete selected items.");
      }

      setFeedbackMessage({
        type: json.storageErrors?.length ? "info" : "success",
        text: json.storageErrors?.length
          ? `${json.count} item(s) deleted. Some file cleanup needs attention: ${json.storageErrors.join(" ")}`
          : `${json.count} item(s) permanently deleted, with ${json.storageCleanedCount || 0} owned file(s) removed.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      setSelectedIds([]);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deletion operation failed.";
      setFeedbackMessage({ type: "error", text: msg });
      setTimeout(() => setFeedbackMessage(null), 6000);
    } finally {
      setIsProcessingBulk(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Content type and status filters */}
      <div className="content-toolbar">
        <div className="flex items-center gap-4">
          <label className="text-xs font-bold uppercase tracking-[0.14em] text-muted" htmlFor="content-type-filter">
            Content type
          </label>
          <select
            id="content-type-filter"
            value={activeTab}
            onChange={(event) => handleTabChange(event.target.value as typeof activeTab)}
            className="select min-w-[220px] py-2"
          >
            <option value="all">All content</option>
            <option value="church_highlight">Church Highlights</option>
            <option value="daily_prayer">Daily Prayers</option>
            <option value="daily_inspiration">Daily Inspirations</option>
            <option value="bible_reading">Scripture &amp; Reflection</option>
            <option value="update">Updates</option>
            <option value="faith_story">Faith Stories</option>
          </select>
        </div>
        <div className="hidden">
          <button
            className={`tab-button ${activeTab === "all" ? "active" : ""}`}
            onClick={() => handleTabChange("all")}
          >
            All Content
          </button>
          <button
            className={`tab-button ${activeTab === "church_highlight" ? "active" : ""}`}
            onClick={() => handleTabChange("church_highlight")}
          >
            🏛️ Church Highlights
          </button>
          <button
            className={`tab-button ${activeTab === "daily_prayer" ? "active" : ""}`}
            onClick={() => handleTabChange("daily_prayer")}
          >
            🙏 Daily Prayers
          </button>
          <button
            className={`tab-button ${activeTab === "daily_inspiration" ? "active" : ""}`}
            onClick={() => handleTabChange("daily_inspiration")}
          >
            Daily Inspirations
          </button>
        </div>

        <div className="flex items-center gap-4">
          <label className="text-xs font-bold uppercase tracking-[0.14em] text-muted" htmlFor="content-status-filter">
            Status
          </label>
          <select
            id="content-status-filter"
            value={statusFilter}
            onChange={(event) => handleStatusChange(event.target.value as typeof statusFilter)}
            className="select min-w-[160px] py-2"
          >
            <option value="all">All statuses</option>
            <option value="live">Live</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`alert ${feedbackMessage.type === "success" ? "success" : feedbackMessage.type === "error" ? "error" : "info"}`}
          role="alert"
        >
          {feedbackMessage.text}
        </div>
      )}

      {/* Select All & Bulk Action Bar */}
      {!loading && !error && Boolean(rows.length) && (
        <div className="content-selection-bar">
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink text-sm">
            <input
              type="checkbox"
              className="w-5 h-5 accent-wine cursor-pointer"
              checked={isAllSelected}
              onChange={handleToggleSelectAll}
            />
            <span>Select All Visible ({rows.length})</span>
          </label>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="badge ready font-bold">
                {selectedIds.length} Selected
              </span>

              <button
                type="button"
                className="button secondary compact text-xs"
                disabled={isProcessingBulk}
                onClick={() => void handleBulkArchive()}
              >
                {isProcessingBulk ? "Processing..." : "📦 Archive Selected"}
              </button>

              <button
                type="button"
                className="button danger compact text-xs"
                disabled={isProcessingBulk}
                onClick={() => void handleBulkDelete()}
              >
                {isProcessingBulk ? "Processing..." : "🗑️ Delete Selected"}
              </button>

              <button
                type="button"
                className="button secondary compact text-xs"
                disabled={isProcessingBulk}
                onClick={() => setSelectedIds([])}
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>
      )}

      {loading && <p className="status-line">Loading content items…</p>}

      {error && (
        <div className="alert error" role="alert">
          {error}{" "}
          <button className="button compact" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && !rows.length && (
        <div className="card empty">
          <p className="eyebrow">No content found</p>
          <h2 className="title">
            {activeTab === "daily_prayer"
              ? "No Daily Prayers yet"
              : activeTab === "daily_inspiration"
                ? "No Daily Inspirations yet"
                : activeTab === "church_highlight"
                  ? "No Church Highlights yet"
                  : activeTab === "bible_reading"
                    ? "No Scripture & Reflections yet"
                  : activeTab === "update"
                  ? "No Updates yet"
                  : activeTab === "faith_story"
                  ? "No Faith Stories yet"
                : "No editorial content yet"}
          </h2>
          <p className="description">
            Create a new entry to publish or schedule content for the Today feed.
          </p>
        </div>
      )}

      {!loading && !error && Boolean(rows.length) && (
        <div className="content-list content-ledger">
          {rows.map((row) => {
            const isSelected = selectedIds.includes(row.id);
            const now = new Date();
            const pubDate = row.metadata?.publish_at ? new Date(row.metadata.publish_at) : null;
            const expDate = row.metadata?.expire_at ? new Date(row.metadata.expire_at) : null;

            let statusBadge = { label: "Draft", class: "draft", style: {} };
            if (row.content_status === "ready") {
              const premiumExpDate = expDate ? new Date(expDate.getTime() + 5 * 24 * 60 * 60 * 1000) : null;
              
              if (premiumExpDate && premiumExpDate <= now) {
                  statusBadge = { label: "Expired", class: "archived", style: {} };
              } else if (expDate && expDate <= now && premiumExpDate && premiumExpDate > now) {
                  statusBadge = { label: "Live (Premium)", class: "ready", style: { backgroundColor: '#eab308', color: 'white', borderColor: '#ca8a04' } }; 
              } else if (pubDate && pubDate > now) {
                  statusBadge = { label: "Scheduled", class: "scheduled", style: {} };
              } else {
                  statusBadge = { label: "Live", class: "ready", style: {} };
              }
            } else if (row.content_status === "archived") {
              statusBadge = { label: "Archived", class: "archived", style: {} };
            }

            const isPrayer = row.type === "daily_prayer";
            const isInspiration = row.type === "daily_inspiration";
            const isBibleReading = row.type === "bible_reading";
            const isUpdate = row.type === "update";
            const isFaithStory = row.type === "faith_story";
            const contentTypeLabel = isPrayer ? "Daily Prayer"
              : isInspiration ? "Daily Inspiration"
              : isBibleReading ? "Scripture & Reflection"
              : isUpdate ? "Update"
              : isFaithStory ? "Faith Story"
              : "Church Highlight";

            return (
              <article
                className={`content-row ${isSelected ? "bg-beige/60 border-wine/40" : ""}`}
                key={row.id}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-wine cursor-pointer"
                    checked={isSelected}
                    onChange={() => handleToggleSelectRow(row.id)}
                  />
                  <div>
                    <div className="row-title flex items-center gap-2">
                      {row.title}
                    </div>
                  </div>
                </div>
                <span className={`badge ${statusBadge.class}`} style={statusBadge.style}>
                  {statusBadge.label}
                </span>
                <div className="row-meta flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-[var(--wine)]">{contentTypeLabel}</span>
                </div>
                <div className="row-meta">
                  Updated {formatUpdatedAt(row.updated_at)}
                </div>
                <Link
                  className="button secondary compact"
                  href={`/content/${row.id}`}
                >
                  Edit
                </Link>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="text-center">
          <button className="button secondary compact" type="button" onClick={() => void load(true)} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more`}
          </button>
        </div>
      )}
    </div>
  );
}
