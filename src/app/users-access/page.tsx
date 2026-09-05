"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { requireSupabase } from "@/lib/supabase";

type UserAccess = { user_id: string; email: string | null; provider: string; prayers_used_today: number; last_prayer_at: string | null; is_premium: boolean; total_count: number };
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const PAGE_SIZE = 20;

export default function UsersAccessPage() {
  const [users, setUsers] = useState<UserAccess[]>([]); 
  const [loading, setLoading] = useState(true); 
  const [message, setMessage] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<"all" | "free" | "premium">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  
  const load = useCallback(async () => { 
    setLoading(true); 
    setMessage(null); 
    try { 
      const filterPremium = activeTab === "all" ? null : activeTab === "premium" ? true : false;
      const offset = (currentPage - 1) * PAGE_SIZE;
      
      const { data, error } = await requireSupabase().rpc("get_personal_prayer_access_users", {
        p_search_email: searchTerm || null,
        p_filter_premium: filterPremium,
        p_limit: PAGE_SIZE,
        p_offset: offset
      }); 
      if (error) throw error; 
      
      const results = (data ?? []) as UserAccess[];
      setUsers(results); 
      setTotalUsers(results.length > 0 ? results[0].total_count : 0);
    } catch { 
      setMessage("Account access information could not be loaded. Please refresh and try again."); 
    } finally { 
      setLoading(false); 
    } 
  }, [activeTab, searchTerm, currentPage]);
  
  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, [load]);
  
  const usedToday = useMemo(() => users.reduce((sum, user) => sum + user.prayers_used_today, 0), [users]);
  const totalPages = Math.ceil(totalUsers / PAGE_SIZE) || 1;
  
  async function reset(userId: string) { try { const client = requireSupabase(); const { data: { user } } = await client.auth.getUser(); if (!user) throw new Error(); const { error } = await client.from("feature_access_resets").upsert({ user_id: userId, feature_key: "my_altar_prayer", reset_at: new Date().toISOString(), reset_by: user.id }, { onConflict: "user_id,feature_key" }); if (error) throw error; setMessage("Today’s allowance was reset. Usage history was retained."); await load(); } catch { setMessage("This allowance could not be reset. Please try again."); } }
  
  async function togglePremium(userId: string, currentStatus: boolean) {
    try {
      const client = requireSupabase();
      const { error } = await client.rpc("toggle_user_premium", { target_user_id: userId, premium_status: !currentStatus });
      if (error) throw error;
      setMessage(`Premium status successfully ${!currentStatus ? "granted" : "revoked"}.`);
      await load();
    } catch {
      setMessage("Premium status could not be updated. Please try again.");
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    setSearchTerm(searchInput);
  };

  const changeTab = (tab: "all" | "free" | "premium") => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  return <AdminGate><main className="page">
    <div className="page-head">
      <div>
        <p className="eyebrow">Account overview</p>
        <h1 className="title">Users &amp; Access</h1>
        <p className="description">Review signed-in accounts and their My Altar allowance for today, using Manila time.</p>
      </div>
      <button className="button secondary compact" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
    </div>
    
    {message && <div className="alert mb-6" role="status">{message}</div>}
    
    <div className="usage-summary">
      <Metric label="Total matched accounts" value={totalUsers.toLocaleString()} />
      <Metric label="Prayers used (this page)" value={usedToday.toLocaleString()} accent />
      <Metric label="Daily allowance" value="From Access & Limits" />
      <Metric label="Reset behavior" value="History retained" />
    </div>

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2rem 0 1rem 0' }}>
      <div style={{ display: 'flex', gap: '0.5rem', background: '#f3f4f6', padding: '0.25rem', borderRadius: '0.5rem' }}>
        <button className="button compact" style={activeTab === 'all' ? {background: 'white', color: 'black'} : {background: 'transparent', border: 'none', color: '#4b5563'}} onClick={() => changeTab('all')}>All Accounts</button>
        <button className="button compact" style={activeTab === 'free' ? {background: 'white', color: 'black'} : {background: 'transparent', border: 'none', color: '#4b5563'}} onClick={() => changeTab('free')}>Free Accounts</button>
        <button className="button compact" style={activeTab === 'premium' ? {background: 'white', color: 'black'} : {background: 'transparent', border: 'none', color: '#4b5563'}} onClick={() => changeTab('premium')}>Premium Accounts</button>
      </div>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
        <input type="text" placeholder="Search email..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="input" style={{ margin: 0, padding: '0.375rem 0.75rem', width: '250px' }} />
        <button type="submit" className="button secondary compact">Search</button>
      </form>
    </div>

    <section className="card p-0 overflow-hidden">
      <div className="usage-table-head">
        <div>
          <h2>Account access</h2>
          <p>Only permanent accounts appear here. Anonymous guest sessions are intentionally excluded.</p>
        </div>
        <span className="badge draft">My Altar</span>
      </div>
      
      {loading ? <p className="status-line">Loading accounts…</p> : users.length === 0 ? 
        <div className="card empty border-0">
          <h2 className="title text-2xl">No accounts found</h2>
          <p className="description mx-auto">No matching signed-in accounts.</p>
        </div> 
        : 
        <div className="overflow-x-auto">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Provider</th>
                <th>Premium</th>
                <th className="text-right">Used today</th>
                <th>Last prayer</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => 
                <tr key={user.user_id}>
                  <td className="font-semibold text-ink">{user.email ?? "No email"}</td>
                  <td><span className="badge draft">{user.provider}</span></td>
                  <td><button className={`badge ${user.is_premium ? 'published' : 'draft'}`} style={{cursor: 'pointer'}} onClick={() => void togglePremium(user.user_id, user.is_premium)}>{user.is_premium ? 'Premium' : 'Free'}</button></td>
                  <td className="text-right text-wine font-semibold">{user.prayers_used_today}</td>
                  <td>{formatDate(user.last_prayer_at)}</td>
                  <td className="text-right"><button className="button secondary compact" type="button" onClick={() => void reset(user.user_id)}>Reset today</button></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      }
      
      {/* Pagination Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <button className="button secondary compact" disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage(p => p - 1)}>Previous</button>
        <span style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: 500 }}>Page {currentPage} of {totalPages}</span>
        <button className="button secondary compact" disabled={currentPage >= totalPages || loading} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
      </div>

    </section>
    
    <p className="usage-retention-note">Resetting starts a fresh allowance window for that account today. It does not delete AI usage records or cost history.</p>
  </main></AdminGate>;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="card usage-metric"><p>{label}</p><strong className={accent ? "text-wine" : ""}>{value}</strong></div>; }
