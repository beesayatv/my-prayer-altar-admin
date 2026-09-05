"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasSupabaseConfig, requireSupabase } from "@/lib/supabase";
export default function Home() { const router = useRouter(); useEffect(() => { if (!hasSupabaseConfig) { router.replace("/login"); return; } requireSupabase().auth.getUser().then(({ data }) => router.replace(data.user ? "/content" : "/login")); }, [router]); return <main className="p-8">Loading…</main>; }
