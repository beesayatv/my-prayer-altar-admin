"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasSupabaseConfig, requireSupabase } from "@/lib/supabase";

type ResetMode = "checking" | "request" | "choose";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ResetMode>(hasSupabaseConfig ? "checking" : "request");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(hasSupabaseConfig ? "" : "Supabase configuration is missing. Add .env.local first.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    const client = requireSupabase();
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) setMode(data.session ? "choose" : "request");
    });
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setMode("choose");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function sendRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (!hasSupabaseConfig) throw new Error("Supabase configuration is missing.");
      const email = String(new FormData(event.currentTarget).get("email"));
      const { error: recoveryError } = await requireSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (recoveryError) throw new Error("We could not send a password reset email. Please wait a little while and try again.");
      setMessage("If this email belongs to an account, a password reset link has been sent.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not send a password reset email.");
    } finally {
      setBusy(false);
    }
  }

  async function setPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirmation = String(form.get("confirmation"));
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await requireSupabase().auth.updateUser({ password });
      if (updateError) throw new Error("We could not update the password. Open a fresh recovery link and try again.");
      setMessage("Password updated. Opening the Studio…");
      router.replace("/content");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not update the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        <p className="eyebrow">My Prayer Altar</p>
        <h1 className="login-brand">Reset password</h1>
        <p className="description">Set a password for Editorial Administration, or request a new recovery link.</p>
        <section className="card form-grid mt-7" aria-busy={mode === "checking"}>
          {mode === "checking" && <p className="status-line">Checking your recovery link…</p>}
          {mode === "request" && (
            <form className="form-grid" onSubmit={sendRecovery}>
              <h2>Send a recovery link</h2>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input className="input" id="email" required name="email" type="email" autoComplete="email" />
              </div>
              <button className="button" disabled={busy}>{busy ? "Sending…" : "Send recovery link"}</button>
            </form>
          )}
          {mode === "choose" && (
            <form className="form-grid" onSubmit={setPassword}>
              <h2>Choose a new password</h2>
              <div className="field">
                <label htmlFor="password">New password</label>
                <input className="input" id="password" required minLength={8} name="password" type="password" autoComplete="new-password" />
              </div>
              <div className="field">
                <label htmlFor="confirmation">Confirm new password</label>
                <input className="input" id="confirmation" required minLength={8} name="confirmation" type="password" autoComplete="new-password" />
              </div>
              <button className="button" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
            </form>
          )}
          {message && <p className="alert success" role="status">{message}</p>}
          {error && <p className="alert error" role="alert">{error}</p>}
          <Link className="text-link" href="/login">Return to sign in</Link>
        </section>
      </div>
    </main>
  );
}
