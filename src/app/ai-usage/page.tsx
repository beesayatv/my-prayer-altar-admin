"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { requireSupabase } from "@/lib/supabase";

const RETENTION_DAYS = 90;
type Log = { id: string; created_at: string; feature: string; model: string | null; total_tokens: number | null; estimated_cost_usd: number | null; status: "success" | "failed"; error_code: string | null; installation_id: string | null };
type Summary = { request_count: number; total_tokens: number; estimated_cost_usd: number; failed_count: number };
const emptySummary: Summary = { request_count: 0, total_tokens: 0, estimated_cost_usd: 0, failed_count: 0 };
const formatCost = (value: number) => value === 0 ? "$0.00" : value < 0.01 ? `$${value.toFixed(6)}` : `$${value.toFixed(4)}`;

export default function AiUsagePage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [period, setPeriod] = useState("30");
  const [statusFilter, setStatusFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState("");
  const [featureInput, setFeatureInput] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState("");
  const [openaiCost, setOpenaiCost] = useState<number | null>(null);
  const [openaiCostConfigured, setOpenaiCostConfigured] = useState(false);
  const [openaiCostLoading, setOpenaiCostLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setOpenaiCostLoading(true); setMessage("");
    try {
      const client = requireSupabase();
      const startedAt = new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000).toISOString();
      const query = client.from("ai_usage_logs")
        .select("id,created_at,feature,model,total_tokens,estimated_cost_usd,status,error_code,installation_id")
        .gte("created_at", startedAt)
        .order("created_at", { ascending: false });
        
      if (statusFilter !== "all") query.eq("status", statusFilter);
      if (featureFilter.trim()) query.eq("feature", featureFilter.trim());
      
      const PAGE_SIZE = 50;
      query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const [logsResult, summaryResult] = await Promise.all([
        query,
        client.rpc("get_ai_usage_summary", { 
          p_started_at: startedAt, 
          p_feature: featureFilter.trim() || null, 
          p_status: statusFilter !== "all" ? statusFilter : null 
        }),
      ]);
      if (logsResult.error || summaryResult.error) throw logsResult.error || summaryResult.error;
      setLogs((logsResult.data ?? []) as Log[]);
      setSummary((summaryResult.data?.[0] as Summary | undefined) ?? emptySummary);

      try {
        const token = (await client.auth.getSession()).data.session?.access_token || "";
        const costRes = await fetch(`/api/admin/ai-usage/openai-costs?period=${period}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const costJson = await costRes.json();
        if (costRes.ok && costJson.success) {
          setOpenaiCost(costJson.totalSpendUsd);
          setOpenaiCostConfigured(costJson.isConfigured);
        } else {
          setOpenaiCostConfigured(false);
        }
      } catch {
        setOpenaiCostConfigured(false);
      } finally {
        setOpenaiCostLoading(false);
      }
    } catch { 
      setMessage("AI usage could not be loaded. Please refresh and try again."); 
      setOpenaiCostLoading(false);
    }
    finally { setLoading(false); }
  }, [period, statusFilter, featureFilter, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function cleanOldLogs() {
    if (!window.confirm(`Permanently delete AI usage logs older than ${RETENTION_DAYS} days? This cannot be undone.`)) return;
    setCleaning(true); setMessage("");
    try {
      const token = (await requireSupabase().auth.getSession()).data.session?.access_token;
      const response = await fetch("/api/admin/ai-usage/cleanup", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not clean AI usage logs.");
      setMessage(`${result.deletedCount} log${result.deletedCount === 1 ? "" : "s"} older than ${RETENTION_DAYS} days deleted.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not clean AI usage logs."); }
    finally { setCleaning(false); }
  }

  return <AdminGate><main className="page">
    <div className="page-head"><div><p className="eyebrow">Monitoring & accounting</p><h1 className="title">AI Usage</h1><p className="description">Request history for troubleshooting. OpenAI remains the source of truth for billed spend.</p></div><div className="flex gap-2 flex-wrap"><button className="button secondary compact" type="button" onClick={() => void load()} disabled={loading}>Refresh</button><button className="button danger compact" type="button" onClick={() => void cleanOldLogs()} disabled={cleaning}>{cleaning ? "Cleaning…" : `Delete logs older than ${RETENTION_DAYS} days`}</button></div></div>
    <div className="usage-filters flex gap-4 flex-wrap" aria-label="AI usage filters">
      <label>Period
        <select value={period} onChange={(event) => { setPeriod(event.target.value); setPage(0); }}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </label>
      <label>Status
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}>
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
      </label>
      <label>Feature
        <div className="flex gap-2">
          <input 
            className="input" 
            style={{ padding: "0.25rem 0.5rem", minHeight: "38px" }} 
            placeholder="All features (type to filter)" 
            value={featureInput} 
            onChange={(e) => setFeatureInput(e.target.value)} 
            onKeyDown={(e) => { if (e.key === 'Enter') { setFeatureFilter(featureInput); setPage(0); } }} 
          />
          <button className="button secondary compact" type="button" onClick={() => { setFeatureFilter(featureInput); setPage(0); }}>Apply</button>
        </div>
      </label>
    </div>
    {message && <p className="usage-retention-note">{message}</p>}
    <div className="usage-summary">
      <Metric label="Requests" value={summary.request_count.toLocaleString()} />
      <Metric label="Total tokens" value={summary.total_tokens.toLocaleString()} />
      <Metric label="Estimated cost (Project)" value={formatCost(Number(summary.estimated_cost_usd))} accent />
      <Metric 
        label={`OpenAI Account Spend (${period}d)`} 
        value={
          openaiCostLoading 
            ? "Loading…" 
            : !openaiCostConfigured 
            ? "Not Configured" 
            : openaiCost !== null 
            ? formatCost(openaiCost) 
            : "—"
        } 
        accent 
      />
      <Metric label="Failed requests" value={summary.failed_count.toLocaleString()} danger={summary.failed_count > 0} />
    </div>
    {!openaiCostConfigured && !openaiCostLoading && (
      <p className="text-xs text-muted mb-6 italic">
        💡 To see your actual live OpenAI account-wide spend, add <code>OPENAI_ADMIN_KEY</code> to your environment variables on the server.
      </p>
    )}
    <section className="card p-0 overflow-hidden">
      <div className="usage-table-head flex justify-between items-end">
        <div>
          <h2>Request history</h2>
          <p>Showing up to 50 recent requests from the selected period.</p>
        </div>
        <div className="flex gap-2">
          <button className="button secondary compact" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>Newer</button>
          <button className="button secondary compact" disabled={logs.length < 50 || loading} onClick={() => setPage(p => p + 1)}>Older</button>
        </div>
      </div>
      {loading ? <p className="status-line">Loading AI usage…</p> : logs.length === 0 ? <div className="card empty border-0"><h2 className="title text-2xl">No matching requests</h2></div> : <div className="overflow-x-auto"><table className="usage-table"><thead><tr><th>Time</th><th>Feature</th><th>Installation</th><th>Model</th><th className="text-right">Tokens</th><th className="text-right">Estimated cost</th><th>Status</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{log.feature.replaceAll("_", " ")}</td><td><span className="font-mono text-xs text-muted" title={log.installation_id || undefined}>{log.installation_id ? log.installation_id.substring(0, 8) + '...' : '—'}</span></td><td>{log.model || "—"}</td><td className="text-right">{log.total_tokens?.toLocaleString() || "—"}</td><td className="text-right text-wine font-semibold">{log.estimated_cost_usd == null ? "—" : formatCost(log.estimated_cost_usd)}</td><td><span className={`badge ${log.status === "success" ? "ready" : "archived"}`} title={log.error_code || undefined}>{log.status}</span></td></tr>)}</tbody></table></div>}
    </section>
    <p className="usage-retention-note">The cleanup action permanently removes only records older than {RETENTION_DAYS} days. It does not affect AI features or OpenAI billing history.</p>
  </main></AdminGate>;
}

function Metric({ label, value, accent = false, danger = false }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return <div className="card usage-metric"><p>{label}</p><strong className={danger ? "text-danger" : accent ? "text-wine" : ""}>{value}</strong></div>;
}
