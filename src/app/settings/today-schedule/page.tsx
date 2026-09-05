"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { requireSupabase } from "@/lib/supabase";

type Policy = {
  content_type: string;
  is_enabled: boolean;
  publish_time: string;
  expire_time: string;
  expires_after_days: number;
};

const labels: Record<string, string> = {
  daily_prayer: "Daily Prayer",
  daily_inspiration: "Daily Inspiration",
  church_highlight: "Church Highlight",
  bible_reading: "Scripture & Reflection",
  faith_story: "Faith Story",
  update: "Update",
};

const order = ["daily_prayer", "daily_inspiration", "church_highlight", "bible_reading", "faith_story", "update"];

function timeValue(time: string) {
  return time.slice(0, 5);
}

export default function TodayScheduleSettingsPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [message, setMessage] = useState("");
  const [savingType, setSavingType] = useState<string | null>(null);

  const loadPolicies = useCallback(async () => {
    setMessage("");
    const { data, error } = await requireSupabase()
      .from("today_content_schedule_policies")
      .select("content_type, is_enabled, publish_time, expire_time, expires_after_days");
    if (error) {
      setMessage("Could not load scheduling rules. Apply the Today Feed scheduling migration first.");
      return;
    }
    setPolicies(((data ?? []) as Policy[]).sort((a, b) => order.indexOf(a.content_type) - order.indexOf(b.content_type)));
  }, []);

  // The rules must be read from Supabase after the authenticated client has mounted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadPolicies(); }, [loadPolicies]);

  const changePolicy = (type: string, change: Partial<Policy>) => {
    setPolicies((current) => current.map((policy) => policy.content_type === type ? { ...policy, ...change } : policy));
  };

  const savePolicy = async (policy: Policy) => {
    setSavingType(policy.content_type);
    setMessage("");
    const { error } = await requireSupabase().from("today_content_schedule_policies").update({
      is_enabled: policy.is_enabled,
      publish_time: policy.publish_time,
      expire_time: policy.expire_time,
      expires_after_days: Number(policy.expires_after_days),
    }).eq("content_type", policy.content_type);
    setSavingType(null);
    setMessage(error ? `Could not save ${labels[policy.content_type] ?? policy.content_type}.` : `${labels[policy.content_type] ?? policy.content_type} rule saved.`);
  };

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Today Feed configuration</p>
            <h1 className="title">Scheduling Rules</h1>
            <p className="description">These rules power “Suggest next slot.” Times use Asia/Manila and never change existing content automatically.</p>
          </div>
        </div>
        {message && <p className="alert mt-6">{message}</p>}
        <div className="flex flex-col gap-4 mt-8">
          {policies.map((policy) => (
            <section className="card" key={policy.content_type}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div><h2 className="card-title mb-1">{labels[policy.content_type] ?? policy.content_type}</h2><p className="text-sm text-muted">{policy.content_type === "update" ? "News content stays manually scheduled." : "Suggestions start after the latest item in this content type expires."}</p></div>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={policy.is_enabled} onChange={(event) => changePolicy(policy.content_type, { is_enabled: event.target.checked })} /> Enable suggestions</label>
              </div>
              <div className="form-grid">
                <label className="field"><span>Publish time</span><input className="input" type="time" value={timeValue(policy.publish_time)} disabled={!policy.is_enabled} onChange={(event) => changePolicy(policy.content_type, { publish_time: event.target.value })} /></label>
                <label className="field"><span>Expiry time</span><input className="input" type="time" value={timeValue(policy.expire_time)} disabled={!policy.is_enabled} onChange={(event) => changePolicy(policy.content_type, { expire_time: event.target.value })} /></label>
                <label className="field"><span>Expires after (days)</span><input className="input" type="number" min="1" max="365" value={policy.expires_after_days} disabled={!policy.is_enabled} onChange={(event) => changePolicy(policy.content_type, { expires_after_days: Number(event.target.value) })} /></label>
              </div>
              <div className="mt-5 flex justify-end"><button className="button" type="button" onClick={() => void savePolicy(policy)} disabled={savingType === policy.content_type}>{savingType === policy.content_type ? "Saving…" : "Save rule"}</button></div>
            </section>
          ))}
        </div>
      </main>
    </AdminGate>
  );
}
