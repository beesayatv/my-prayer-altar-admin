"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { requireSupabase } from "@/lib/supabase";

const PAGE_SIZE = 50;

type FeedbackRow = {
  id: string;
  category: string;
  message: string | null;
  screen: string;
  install_id: string | null;
  device_info: string | null;
  app_version: string | null;
  created_at: string;
  email: string | null;
  log_data: string | null;
};

type FeedbackSummary = {
  total: number;
  bugs: number;
  suggestions: number;
  content: number;
};

const emptySummary: FeedbackSummary = { total: 0, bugs: 0, suggestions: 0, content: 0 };

const categoryMeta: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  bug:        { emoji: "🐛", label: "Bug",        color: "#7A2535", bg: "#FAE8EB" },
  suggestion: { emoji: "💡", label: "Suggestion", color: "#7A5B1A", bg: "#FEF3CD" },
  confused:   { emoji: "😕", label: "Confused",   color: "#3D4A5C", bg: "#E8EDF5" },
  content:    { emoji: "📖", label: "Content",    color: "#4A343A", bg: "#F3EDE4" },
  general:    { emoji: "💬", label: "General",    color: "#1A5C42", bg: "#E6F5EF" },
};

const screenLabel: Record<string, string> = {
  today:    "Today",
  altar:    "My Altar",
  prayers:  "My Prayers",
  me:       "Me Screen",
  settings: "Settings",
  account:  "Account",
  premium:  "Premium",
};

function startForDays(days: string) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days));
  return date.toISOString();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function FeedbackPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary>(emptySummary);
  const [period, setPeriod] = useState("30");
  const [category, setCategory] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Selection & Bulk Action States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  const load = useCallback(async (append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    if (!append) {
      setSelectedIds([]);
      setFeedbackMessage(null);
    }
    try {
      const client = requireSupabase();
      const startedAt = startForDays(period);
      const activeCursor = append ? cursor : null;

      let query = client
        .from("alpha_feedback")
        .select("id, category, message, screen, install_id, device_info, app_version, created_at, email, log_data")
        .gte("created_at", startedAt)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (category) query = query.eq("category", category);
      if (activeCursor) query = query.lt("created_at", activeCursor);

      const { data, error: loadError } = await query;
      if (loadError) throw loadError;

      const page = (data ?? []) as FeedbackRow[];
      const visible = page.slice(0, PAGE_SIZE);

      setRows((current) => append ? [...current, ...visible] : visible);
      setHasMore(page.length > PAGE_SIZE);
      setCursor(visible.at(-1)?.created_at ?? null);

      if (!append) {
        const s: FeedbackSummary = { total: page.length, bugs: 0, suggestions: 0, content: 0 };
        page.forEach(r => {
          if (r.category === "bug") s.bugs++;
          else if (r.category === "suggestion") s.suggestions++;
          else if (r.category === "content") s.content++;
        });
        setSummary(s);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feedback.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor, category, period]);

  async function handleBulkDelete() {
    if (selectedIds.length === 0 || isProcessingBulk) return;

    const count = selectedIds.length;
    const confirmDelete = window.confirm(
      `Permanently delete ${count} selected feedback entr(ies)? This action cannot be undone.`
    );

    if (!confirmDelete) return;

    setIsProcessingBulk(true);
    setFeedbackMessage(null);

    try {
      const supabase = requireSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/admin/feedback/bulk-delete", {
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
        type: "success",
        text: `${json.count} feedback entr(ies) permanently deleted.`,
      });
      setSelectedIds([]);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deletion operation failed.";
      setFeedbackMessage({ type: "error", text: msg });
    } finally {
      setIsProcessingBulk(false);
    }
  }

  useEffect(() => { void load(); }, [category, period]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Development Ops</p>
            <h1 className="title">Alpha Test Feedback</h1>
            <p className="description">
              Review recent feedback, bugs, and suggestions submitted by private alpha testers.
            </p>
          </div>
          <button className="button secondary compact" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
        </div>

        <div className="usage-filters" aria-label="Feedback filters">
          <label>Period
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <label>Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All Categories</option>
              <option value="bug">🐛 Bugs</option>
              <option value="suggestion">💡 Suggestions</option>
              <option value="content">📖 Content</option>
              <option value="confused">😕 Confused</option>
              <option value="general">💬 General</option>
            </select>
          </label>
        </div>

        {error && <div className="alert error mb-6" role="alert">{error}</div>}
        {feedbackMessage && (
          <div className={`alert ${feedbackMessage.type} mb-6`} role="alert">
            {feedbackMessage.text}
          </div>
        )}

        <div className="usage-summary">
          <Metric label="Total Entries" value={summary.total.toString()} />
          <Metric label="Bugs Reported" value={summary.bugs.toString()} danger={summary.bugs > 0} />
          <Metric label="Suggestions" value={summary.suggestions.toString()} accent />
          <Metric label="Content Issues" value={summary.content.toString()} />
        </div>

        {selectedIds.length > 0 && (
          <div className="content-selection-bar mb-6">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink text-sm">
              <input
                type="checkbox"
                className="w-5 h-5 accent-wine cursor-pointer"
                checked={selectedIds.length === rows.length}
                onChange={handleToggleSelectAll}
              />
              <span>Select All Visible ({rows.length})</span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <span className="badge ready font-bold">
                {selectedIds.length} Selected
              </span>

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
          </div>
        )}

        <section className="card p-0 overflow-hidden">
          <div className="usage-table-head">
            <div>
              <h2>Feedback history</h2>
              <p>Showing {rows.length.toLocaleString()} entries from the selected period.</p>
            </div>
            <span className="badge draft">Most recent first</span>
          </div>

          {loading ? (
            <p className="status-line">Loading feedback…</p>
          ) : rows.length === 0 ? (
            <div className="card empty border-0">
              <h2 className="title text-2xl">No feedback yet</h2>
              <p className="description mx-auto">Try another period or filter. Feedback from testers will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-wine cursor-pointer"
                        checked={rows.length > 0 && selectedIds.length === rows.length}
                        onChange={handleToggleSelectAll}
                      />
                    </th>
                    <th className="w-10"></th>
                    <th>Time</th>
                    <th>Category</th>
                    <th className="text-right">Device & Version</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const cat = categoryMeta[row.category] ?? { emoji: "?", label: row.category, color: "#555", bg: "#eee" };
                    const isExpanded = expandedId === row.id;
                    const isSelected = selectedIds.includes(row.id);
                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          className={`cursor-pointer transition-colors ${isSelected ? "bg-beige/60" : isExpanded ? "bg-beige/40" : "hover:bg-beige/20"}`}
                          onClick={() => toggleExpand(row.id)}
                        >
                          <td className="text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-wine cursor-pointer"
                              checked={isSelected}
                              onChange={() => handleToggleSelectRow(row.id)}
                            />
                          </td>
                          <td className="text-center text-muted">
                            <span className={`inline-block transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                              ▼
                            </span>
                          </td>
                          <td className="whitespace-nowrap">{formatDate(row.created_at)}</td>
                          <td className="whitespace-nowrap">
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                              style={{ color: cat.color, backgroundColor: cat.bg }}
                            >
                              {cat.emoji} {cat.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <div className="text-xs text-ink font-medium">{row.device_info || "—"}</div>
                            <div className="text-[10px] text-muted font-mono">v{row.app_version || "—"}</div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-beige/10">
                            <td colSpan={5} className="px-6 py-6 border-t border-line/50">
                              <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Message</span>
                                  <div className="text-base text-ink leading-relaxed whitespace-pre-wrap">
                                    {row.message || <span className="text-muted italic">User did not provide a message.</span>}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-4 border-t border-line/30">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Contact Email</span>
                                    {row.email ? (
                                      <a href={`mailto:${row.email}`} className="text-xs text-wine underline break-all hover:text-wine/80">
                                        {row.email}
                                      </a>
                                    ) : (
                                      <span className="text-xs text-ink">—</span>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Install ID</span>
                                    <span className="text-xs font-mono text-ink">{row.install_id || "—"}</span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">App Version</span>
                                    <span className="text-xs text-ink">{row.app_version || "—"}</span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Submitted</span>
                                    <span className="text-xs text-ink">{new Date(row.created_at).toLocaleString()}</span>
                                  </div>
                                </div>
                                
                                {row.log_data && (
                                  <details className="mt-4 pt-4 border-t border-line/30 cursor-pointer group">
                                    <summary className="text-[11px] font-semibold text-wine uppercase tracking-wider select-none outline-none hover:text-wine/80">
                                      View Attached Diagnostic Logs
                                    </summary>
                                    <div className="mt-3 bg-[#2C2825] text-[#D4D4D4] p-3 rounded-lg overflow-x-auto max-h-96 overflow-y-auto cursor-auto">
                                      <pre className="text-[10px] font-mono whitespace-pre-wrap leading-relaxed">
                                        {row.log_data}
                                      </pre>
                                    </div>
                                  </details>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <div className="p-4 border-t border-line text-center">
              <button className="button secondary compact" type="button" onClick={() => void load(true)} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more`}
              </button>
            </div>
          )}
        </section>

        <p className="usage-retention-note">
          Feedback is stored in the Alpha testing bucket. Deleting an entry is permanent.
        </p>
      </main>
    </AdminGate>
  );
}

function Metric({ label, value, accent = false, danger = false }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="card usage-metric">
      <p>{label}</p>
      <strong className={danger ? "text-danger" : accent ? "text-wine" : ""}>{value}</strong>
    </div>
  );
}
