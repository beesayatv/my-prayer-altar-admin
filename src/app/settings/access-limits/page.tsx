"use client";

import { useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { Field } from "@/components/ContentEditor";
import { requireSupabase } from "@/lib/supabase";

type AccessPolicy = {
  feature_key: string;
  guest_lifetime_generations: number;
  free_daily_generations: number;
  free_saved_prayers_limit: number;
  premium_daily_generations: number | null;
  premium_saved_prayers_limit: number | null;
  require_account_to_save: boolean;
};

const DEFAULT_POLICY: AccessPolicy = {
  feature_key: "my_altar_prayer",
  guest_lifetime_generations: 1,
  free_daily_generations: 2,
  free_saved_prayers_limit: 5,
  premium_daily_generations: null,
  premium_saved_prayers_limit: null,
  require_account_to_save: true,
};

export default function AccessLimitsSettingsPage() {
  const [policy, setPolicy] = useState<AccessPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPolicy() {
      try {
        const { data, error } = await requireSupabase()
          .from("feature_access_policies")
          .select("*")
          .eq("feature_key", "my_altar_prayer")
          .maybeSingle();
        if (error) throw error;
        if (data && active) {
          setPolicy({
            feature_key: "my_altar_prayer",
            guest_lifetime_generations: data.guest_lifetime_generations ?? 1,
            free_daily_generations: data.free_daily_generations ?? 2,
            free_saved_prayers_limit: data.free_saved_prayers_limit ?? 5,
            premium_daily_generations: data.premium_daily_generations ?? null,
            premium_saved_prayers_limit: data.premium_saved_prayers_limit ?? null,
            require_account_to_save: data.require_account_to_save ?? true,
          });
        }
      } catch {
        if (active) setMessage({ type: "error", text: "Could not load My Altar access settings." });
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPolicy();
    return () => { active = false; };
  }, []);

  async function savePolicy(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await requireSupabase().from("feature_access_policies").upsert({
        ...policy,
        updated_at: new Date().toISOString(),
      }, { onConflict: "feature_key" });
      if (error) throw error;
      setMessage({ type: "success", text: "Access and limit settings saved." });
    } catch {
      setMessage({ type: "error", text: "Could not save My Altar access settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Settings · My Altar</p>
            <h1 className="title">Access &amp; Limits</h1>
            <p className="description">Set the guest trial and the daily allowance for signed-in free users.</p>
          </div>
        </div>

        {loading ? <p className="status-line">Loading access settings…</p> : (
          <form onSubmit={savePolicy} className="flex max-w-4xl flex-col gap-8 pb-16">
            {message && <div className={`alert ${message.type}`} role="alert">{message.text}</div>}

            <section className="card">
              <div className="flex flex-col gap-1 border-b border-line pb-3 mb-4">
                <h2 className="card-title">My Altar access policy</h2>
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Prayer Generation</h3>
                  <div className="form-columns" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <Field label="Trial">
                      <input type="number" min="0" max="10" className="input" value={policy.guest_lifetime_generations} onChange={(event) => setPolicy({ ...policy, guest_lifetime_generations: Math.max(0, Number(event.target.value) || 0) })} />
                    </Field>
                    <Field label="Signed-in">
                      <input type="number" min="0" max="20" className="input" value={policy.free_daily_generations} onChange={(event) => setPolicy({ ...policy, free_daily_generations: Math.max(0, Number(event.target.value) || 0) })} />
                    </Field>
                    <Field label="Premium">
                      <input type="number" min="1" max="1000" className="input" value={policy.premium_daily_generations ?? ""} onChange={(event) => setPolicy({ ...policy, premium_daily_generations: event.target.value === "" ? null : Math.max(1, Number(event.target.value) || 1) })} />
                    </Field>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Saved Prayers</h3>
                  <div className="form-columns" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <Field label="Signed-in">
                      <input type="number" min="1" max="1000" className="input" value={policy.free_saved_prayers_limit} onChange={(event) => setPolicy({ ...policy, free_saved_prayers_limit: Math.max(1, Number(event.target.value) || 1) })} />
                    </Field>
                    <Field label="Premium">
                      <input type="number" min="1" max="10000" className="input" value={policy.premium_saved_prayers_limit ?? ""} onChange={(event) => setPolicy({ ...policy, premium_saved_prayers_limit: event.target.value === "" ? null : Math.max(1, Number(event.target.value) || 1) })} />
                    </Field>
                    <div className="flex h-full items-end pb-1">
                      <label className="flex w-full items-center justify-between rounded-xl border border-line bg-beige/40 p-4">
                        <strong className="text-sm font-medium text-ink">Require account to save</strong>
                        <input type="checkbox" className="h-5 w-5 cursor-pointer accent-wine" checked={policy.require_account_to_save} onChange={(event) => setPolicy({ ...policy, require_account_to_save: event.target.checked })} />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button type="submit" className="button" disabled={saving}>{saving ? "Saving…" : "Save Access Settings"}</button>
            </div>
          </form>
        )}
      </main>
    </AdminGate>
  );
}
