"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { requireSupabase } from "@/lib/supabase";

type DbStat = {
  queryid: string;
  query: string;
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
  rows: number;
};

type QueryCategory = "App Queries & Functions" | "Background Jobs (Cron)" | "System & Internal";

type ParsedDbStat = DbStat & {
  label: string;
  category: QueryCategory;
};

type Summary = {
  total_queries: number;
  total_exec_time: number;
  avg_mean_exec_time: number;
};

const emptySummary: Summary = { total_queries: 0, total_exec_time: 0, avg_mean_exec_time: 0 };

function parseDbQuery(query: string): { label: string; category: QueryCategory } {
  const q = query.trim().replace(/\s+/g, ' ');
  
  // App Queries (RPC calls via PostgREST)
  const rpcMatch = q.match(/WITH pgrst_source AS \(SELECT "pgrst_call" \* FROM "public"\."([^"]+)"/i);
  if (rpcMatch) return { label: `App Function: ${rpcMatch[1]}`, category: "App Queries & Functions" };

  // App Queries (Direct Fetch/Update/Insert via PostgREST)
  const updateMatch = q.match(/WITH pgrst_source AS \(UPDATE "public"\."([^"]+)"/i);
  if (updateMatch) return { label: `App Update: ${updateMatch[1]}`, category: "App Queries & Functions" };
  
  const insertMatch = q.match(/WITH pgrst_source AS \(INSERT INTO "public"\."([^"]+)"/i);
  if (insertMatch) return { label: `App Insert: ${insertMatch[1]}`, category: "App Queries & Functions" };
  
  const selectMatch = q.match(/WITH pgrst_source AS \(SELECT .* FROM "public"\."([^"]+)"/i);
  if (selectMatch) return { label: `App Fetch: ${selectMatch[1]}`, category: "App Queries & Functions" };

  // Background Jobs
  if (q.includes("insert into cron.job_run_details")) return { label: "Log Cron Job Execution (Start)", category: "Background Jobs (Cron)" };
  if (q.includes("update cron.job_run_details set status")) return { label: "Log Cron Job Execution (End)", category: "Background Jobs (Cron)" };
  if (q.includes("select net.http_post")) return { label: "Trigger Edge Function / Webhook", category: "Background Jobs (Cron)" };
  if (q.includes("insert into net._http_response")) return { label: "Log Webhook Response", category: "Background Jobs (Cron)" };

  // System
  if (q.includes("select set_config('search_path'")) return { label: "API Security Context Setup", category: "System & Internal" };
  if (q.includes("SELECT e.name") && q.includes("pg_available_extensions")) return { label: "Check Extensions (Dashboard)", category: "System & Internal" };
  if (q.includes("pg_timezone_names")) return { label: "Check Timezones (Dashboard)", category: "System & Internal" };
  if (q.includes("pg_proc as p")) return { label: "Load Functions (Dashboard)", category: "System & Internal" };
  if (q.includes("pg_backup_start")) return { label: "Automated Database Backup", category: "System & Internal" };
  if (q.includes("pg_total_relation_size")) return { label: "Load Table Metrics (Dashboard)", category: "System & Internal" };
  if (q.includes("net.http_request_queue")) return { label: "Webhook Queue Poller", category: "System & Internal" };
  if (q.includes("net._http_response")) return { label: "Webhook Queue Cleanup", category: "System & Internal" };
  if (q.includes("storage.objects")) return { label: "Storage Internal Operation", category: "System & Internal" };
  if (q.includes("FROM sessions")) return { label: "Auth: Check Session", category: "System & Internal" };
  if (q.includes("FROM users")) return { label: "Auth: Load User Profile", category: "System & Internal" };
  if (q.includes("FROM identities")) return { label: "Auth: Load Identities", category: "System & Internal" };
  if (q.includes("FROM mfa_amr_claims")) return { label: "Auth: MFA Check", category: "System & Internal" };
  if (q.includes("pg_stat_statements")) return { label: "Fetch Database Metrics", category: "System & Internal" };
  
  // Default parsing for unknown queries to make them shorter
  const shortLabel = q.length > 50 ? q.substring(0, 50) + "..." : q;
  return { label: `Query: ${shortLabel}`, category: "System & Internal" };
}

export default function DbUsagePage() {
  const [appStats, setAppStats] = useState<ParsedDbStat[]>([]);
  const [cronStats, setCronStats] = useState<ParsedDbStat[]>([]);
  const [sysStats, setSysStats] = useState<ParsedDbStat[]>([]);
  const [integrityStats, setIntegrityStats] = useState({ total: 0, valid: 0, invalid: 0 });
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "high_volume" | "slow_query">("all");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    try {
      const client = requireSupabase();
      const result = await client.rpc("get_db_performance_stats", { p_limit: 100 });
      
      if (result.error) throw result.error;
      
      const rawData = (result.data ?? []) as DbStat[];
      
      if (rawData.length > 0) {
        const total_queries = rawData.reduce((acc, curr) => acc + curr.calls, 0);
        const total_exec = rawData.reduce((acc, curr) => acc + curr.total_exec_time, 0);
        const avg_mean = rawData.reduce((acc, curr) => acc + curr.mean_exec_time, 0) / rawData.length;
        setSummary({ total_queries, total_exec_time: total_exec, avg_mean_exec_time: avg_mean });
        
        const parsedData = rawData.map(stat => ({
          ...stat,
          ...parseDbQuery(stat.query)
        }));
        
        setAppStats(parsedData.filter(s => s.category === "App Queries & Functions"));
        setCronStats(parsedData.filter(s => s.category === "Background Jobs (Cron)"));
        setSysStats(parsedData.filter(s => s.category === "System & Internal"));
        
      } else {
        setSummary(emptySummary);
        setAppStats([]);
        setCronStats([]);
        setSysStats([]);
      }
      const integrityRes = await client.from("play_integrity_logs").select("is_valid").limit(5000);
      if (!integrityRes.error && integrityRes.data) {
        const valid = integrityRes.data.filter(r => r.is_valid).length;
        setIntegrityStats({
          total: integrityRes.data.length,
          valid,
          invalid: integrityRes.data.length - valid
        });
      }

    } catch (e: any) { 
      setMessage("Database usage could not be loaded. Please ensure the migration is applied."); 
      console.error(e);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const applyFilter = (stats: ParsedDbStat[]) => {
    if (filter === "high_volume") return stats.filter((s) => s.calls > 10000);
    if (filter === "slow_query") return stats.filter((s) => s.mean_exec_time > 100);
    return stats;
  };

  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset all database statistics? Historical data will be cleared and started from 0.")) return;
    setLoading(true);
    try {
      const client = requireSupabase();
      await client.rpc("reset_db_performance_stats");
      await load();
      setMessage("Database statistics reset successfully.");
    } catch (e: any) {
      console.error(e);
      setMessage("Failed to reset database statistics.");
      setLoading(false);
    }
  };

  return <AdminGate><main className="page">
    <div className="page-head">
      <div>
        <p className="eyebrow">Monitoring & accounting</p>
        <h1 className="title">Database Usage</h1>
        <p className="description">Aggregate query performance metrics grouped by function type.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className="button compact" type="button" onClick={() => void handleReset()} disabled={loading}>Reset Statistics</button>
        <button className="button secondary compact" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
      </div>
    </div>
    
    <div className="usage-filters" aria-label="Database usage filters">
      <label>
        Filter By
        <select value={filter} onChange={(event) => setFilter(event.target.value as any)}>
          <option value="all">All Queries</option>
          <option value="high_volume">High Volume (&gt;10k calls)</option>
          <option value="slow_query">Slow Queries (&gt;100ms)</option>
        </select>
      </label>
    </div>
    
    {message && <p className="usage-retention-note text-danger">{message}</p>}
    
    <div className="usage-summary">
      <Metric label="Total Query Calls (Top 100)" value={summary.total_queries.toLocaleString()} />
      <Metric label="Total Execution Time" value={`${summary.total_exec_time.toFixed(2)} ms`} accent />
      <Metric label="Average Latency" value={`${summary.avg_mean_exec_time.toFixed(2)} ms`} />
    </div>

    <div className="usage-table-head mt-8">
      <div>
        <h2>Play Integrity Validations (Recent)</h2>
        <p>Security checks performed on Android devices requesting Edge Functions.</p>
      </div>
    </div>
    <div className="usage-summary mb-8">
      <Metric label="Total Verifications" value={integrityStats.total.toLocaleString()} />
      <Metric label="Valid Devices" value={integrityStats.valid.toLocaleString()} />
      <Metric label="Failed (Emulators/Rooted)" value={integrityStats.invalid.toLocaleString()} danger={integrityStats.invalid > 0} />
    </div>
    
    {loading ? (
      <p className="status-line">Loading database usage…</p>
    ) : summary.total_queries === 0 ? (
      <section className="card p-0 overflow-hidden">
        <div className="card empty border-0">
          <h2 className="title text-2xl">No metrics available</h2>
          <p className="text-muted text-sm mt-2">Ensure the pg_stat_statements extension is enabled.</p>
        </div>
      </section>
    ) : (
      <div className="flex flex-col gap-6">
        <QueryTable title="App Queries & Functions" description="Queries coming from your application (via Supabase API)" stats={applyFilter(appStats)} />
        <QueryTable title="Background Jobs (Cron)" description="Logging and webhook execution from pg_cron" stats={applyFilter(cronStats)} disableAlerts={true} />
        <QueryTable title="System & Internal" description="Internal Supabase plumbing (safe to ignore)" stats={applyFilter(sysStats)} isMuted={filter === "all"} disableAlerts={true} />
      </div>
    )}
  </main></AdminGate>;
}

function QueryTable({ title, description, stats, isMuted = false, disableAlerts = false }: { title: string; description: string; stats: ParsedDbStat[]; isMuted?: boolean; disableAlerts?: boolean }) {
  if (stats.length === 0) return null;
  
  return (
    <section className={`card p-0 overflow-hidden ${isMuted ? 'opacity-80' : ''}`}>
      <div className="usage-table-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="usage-table">
          <thead>
            <tr>
              <th>Operation</th>
              <th className="text-right">Calls</th>
              <th className="text-right">Mean Latency</th>
              <th className="text-right">Total Time</th>
              <th className="text-right">Rows</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, index) => {
              const isExcessiveCalls = !disableAlerts && stat.calls > 10000;
              const isHighLatency = !disableAlerts && stat.mean_exec_time > 100;
              
              return (
                <tr key={`${stat.queryid}-${index}`} className={isExcessiveCalls || isHighLatency ? "bg-rose-50/30" : ""}>
                  <td className="w-1/2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{stat.label}</span>
                        {isExcessiveCalls && <span className="badge archived text-[10px] py-0.5">High Volume</span>}
                        {isHighLatency && <span className="badge archived text-[10px] py-0.5">Slow Query</span>}
                      </div>
                      <span className="font-mono text-[10px] text-muted truncate max-w-lg mt-0.5" title={stat.query}>
                        {stat.query}
                      </span>
                    </div>
                  </td>
                  <td className={`text-right font-semibold ${isExcessiveCalls ? "text-danger" : ""}`}>
                    {stat.calls.toLocaleString()}
                  </td>
                  <td className={`text-right ${isHighLatency ? "text-danger font-semibold" : ""}`}>
                    {stat.mean_exec_time.toFixed(2)} ms
                  </td>
                  <td className="text-right text-wine font-semibold">{stat.total_exec_time.toFixed(2)} ms</td>
                  <td className="text-right">{stat.rows.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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
