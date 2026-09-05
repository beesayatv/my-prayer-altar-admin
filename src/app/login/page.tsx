"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasSupabaseConfig, requireSupabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (!hasSupabaseConfig) throw new Error("Supabase configuration is missing. Add .env.local first.");

      const form = new FormData(event.currentTarget);
      const client = requireSupabase();
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (signInError || !data.user) throw new Error("Email or password was not accepted.");

      const { data: admin, error: adminError } = await client
        .from("admin_users")
        .select("user_id")
        .eq("user_id", data.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (adminError || !admin) {
        await client.auth.signOut();
        throw new Error("This account is not an active administrator.");
      }

      router.replace("/content");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        <p className="eyebrow">My Prayer Altar</p>
        <h1 className="login-brand">Editorial administration</h1>
        <p className="description">A private space to prepare the stories and reflections shared in Today.</p>
        <form className="card form-grid mt-7" onSubmit={submit}>
          <h2>Sign in</h2>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" required name="email" type="email" autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input className="input" id="password" required name="password" type="password" autoComplete="current-password" />
          </div>
          {error && <p className="alert error" role="alert">{error}</p>}
          <button className="button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <Link className="text-link" href="/reset-password">Forgot your password?</Link>
        </form>
      </div>
    </main>
  );
}
