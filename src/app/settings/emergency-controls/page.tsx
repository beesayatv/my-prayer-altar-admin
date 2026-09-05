"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { requireSupabase } from "@/lib/supabase";

type RuntimeControl = {
  control_key: string;
  is_paused: boolean;
  paused_message: string;
};

const defaultTodayMessage = "Today is temporarily resting while we make a few improvements. Please try again soon.";
const defaultGlobalMessage = "The application is temporarily resting while we make a few improvements. Please try again soon.";

export default function EmergencyControlsPage() {
  const [todayControl, setTodayControl] = useState<RuntimeControl>({
    control_key: "today_feed",
    is_paused: false,
    paused_message: defaultTodayMessage,
  });
  const [globalControl, setGlobalControl] = useState<RuntimeControl>({
    control_key: "global_kill",
    is_paused: false,
    paused_message: defaultGlobalMessage,
  });
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await requireSupabase()
      .from("app_runtime_controls")
      .select("control_key, is_paused, paused_message");
    if (error) {
      setMessage("Could not load the emergency controls.");
      return;
    }
    if (data) {
      const today = data.find((r) => r.control_key === "today_feed");
      const global = data.find((r) => r.control_key === "global_kill");
      if (today) setTodayControl(today as RuntimeControl);
      if (global) setGlobalControl(global as RuntimeControl);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveAll = async () => {
    setIsSaving(true);
    setMessage("");
    const todayMsg = todayControl.paused_message.trim() || defaultTodayMessage;
    const globalMsg = globalControl.paused_message.trim() || defaultGlobalMessage;

    const supabase = requireSupabase();
    const [todayRes, globalRes] = await Promise.all([
      supabase.from("app_runtime_controls").update({
        is_paused: todayControl.is_paused,
        paused_message: todayMsg,
      }).eq("control_key", "today_feed"),
      supabase.from("app_runtime_controls").update({
        is_paused: globalControl.is_paused,
        paused_message: globalMsg,
      }).eq("control_key", "global_kill")
    ]);

    setIsSaving(false);
    if (todayRes.error || globalRes.error) {
      setMessage("Could not save all settings. Please try again.");
    } else {
      setMessage("Emergency controls successfully updated.");
      void load();
    }
  };

  return (
    <AdminGate>
      <main className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Emergency response</p>
            <h1 className="title">Emergency Controls</h1>
            <p className="description">Temporarily freeze all app services or individual feeds to protect Supabase, Bunny storage, and OpenAI API usage during traffic spikes or attacks.</p>
          </div>
        </div>

        {message && <p className="alert mt-6">{message}</p>}

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {/* Card 1: Global App Freeze */}
          <section className="card bg-red-50/10 border-red-200/40">
            <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
              <span className="text-red-600">🚨</span> Global App Freeze
            </h2>
            <p className="text-sm text-muted mb-6">Master Kill Switch. Disconnects all clients on launching or refreshing, stopping all incoming API calls and DB queries.</p>
            
            <label className="flex items-start gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={globalControl.is_paused} 
                onChange={(event) => setGlobalControl((curr) => ({ ...curr, is_paused: event.target.checked }))} 
              />
              <span>
                <strong>Freeze All Services</strong>
                <br />
                <span className="text-sm text-muted">Blocks OpenAI endpoints, Bunny CDN fetches, and personal prayer tools.</span>
              </span>
            </label>

            <div className="field mt-6">
              <label>Global Block Message</label>
              <textarea 
                className="input min-h-24" 
                value={globalControl.paused_message} 
                onChange={(event) => setGlobalControl((curr) => ({ ...curr, paused_message: event.target.value }))} 
              />
            </div>
          </section>

          {/* Card 2: Today Feed Pause */}
          <section className="card">
            <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
              <span>📅</span> Today Feed Control
            </h2>
            <p className="text-sm text-muted mb-6">Selectively pause only the Today Feed content. Personal saved prayers and general app services will remain online.</p>

            <label className="flex items-start gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={todayControl.is_paused} 
                onChange={(event) => setTodayControl((curr) => ({ ...curr, is_paused: event.target.checked }))} 
              />
              <span>
                <strong>Pause Today Feed</strong>
                <br />
                <span className="text-sm text-muted">Stops new content loading and Bunny media downloads specifically for Today.</span>
              </span>
            </label>

            <div className="field mt-6">
              <label>Today Feed Maintenance Message</label>
              <textarea 
                className="input min-h-24" 
                value={todayControl.paused_message} 
                onChange={(event) => setTodayControl((curr) => ({ ...curr, paused_message: event.target.value }))} 
              />
            </div>
          </section>
        </div>

        <div className="mt-8 flex justify-end">
          <button 
            className="button" 
            type="button" 
            onClick={() => void saveAll()} 
            disabled={isSaving}
          >
            {isSaving ? "Saving Settings…" : "Save Emergency Settings"}
          </button>
        </div>
      </main>
    </AdminGate>
  );
}
