"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSupabaseConfig, requireSupabase } from "@/lib/supabase";
import { AdminShell } from "@/components/AdminShell";

type GateStatus = "checking" | "allowed" | "configuration" | "denied";

let cachedStatus: GateStatus | null = null;
let cachedEmail: string = "";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<GateStatus>(cachedStatus ?? "checking");
  const [email, setEmail] = useState<string>(cachedEmail);

  useEffect(() => {
    let active = true;
    async function verifyAccess() {
      if (!hasSupabaseConfig) {
        cachedStatus = "configuration";
        if (active) setStatus("configuration");
        return;
      }
      const client = requireSupabase();
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) {
        cachedStatus = null;
        cachedEmail = "";
        router.replace("/login");
        return;
      }
      const { data: admin, error: adminError } = await client
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userData.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (adminError || !admin) {
        await client.auth.signOut();
        cachedStatus = "denied";
        cachedEmail = "";
        if (active) setStatus("denied");
        return;
      }
      const userEmail = userData.user.email ?? "Administrator";
      cachedStatus = "allowed";
      cachedEmail = userEmail;
      if (active) {
        setStatus("allowed");
        setEmail(userEmail);
      }
    }
    void verifyAccess();
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    cachedStatus = null;
    cachedEmail = "";
    if (hasSupabaseConfig) await requireSupabase().auth.signOut();
    router.replace("/login");
  }

  if (status === "checking") return <main className="p-8">Checking access…</main>;
  if (status === "configuration") return <main className="p-8"><p>Supabase configuration is missing. Add the public URL and publishable key to .env.local.</p></main>;
  if (status === "denied") return <main className="p-8"><p>This account is not an active administrator.</p><a href="/login">Return to sign in</a></main>;
  return <AdminShell email={email} onSignOut={() => void signOut()}>{children}</AdminShell>;
}
