import { createClient } from "@supabase/supabase-js";

export async function verifyAdminAuth(request: Request): Promise<{ authorized: boolean; userId?: string; token?: string; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { authorized: false, error: "Server configuration missing." };
  }

  let projectHost = "unknown";
  try {
    projectHost = new URL(url).hostname;
  } catch {}

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authorized: false, error: "Missing or invalid authorization token." };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return { authorized: false, error: "Empty authorization token." };
  }

  try {
    // 1. Verify user JWT token with Supabase Auth
    const authClient = createClient(url, key, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);

    if (userError || !userData.user) {
      console.log(`[AUTH DIAGNOSTIC] Host: ${projectHost} | Token validation error: ${userError?.message || "No user"}`);
      return { authorized: false, error: "Invalid or expired session token." };
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? "Unknown";

    // 2. Query admin_users with user Authorization header or service key to satisfy RLS / permissions
    const dbClient = serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : createClient(url, key, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

    const { data: admin, error: adminError } = await dbClient
      .from("admin_users")
      .select("user_id, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    console.log(
      `[AUTH DIAGNOSTIC] Host: ${projectHost} | UserID: ${userId} | Email: ${userEmail} | RowFound: ${Boolean(admin)} | is_active: ${admin?.is_active ?? "N/A"} | Error: ${adminError ? `${adminError.code} - ${adminError.message}` : "None"}`
    );

    if (adminError) {
      return { authorized: false, error: `Database lookup failed: ${adminError.message}` };
    }

    if (!admin || !admin.is_active) {
      return { authorized: false, error: "User is not an active administrator." };
    }

    return { authorized: true, userId: userId, token: token };
  } catch (err) {
    console.error("[AUTH DIAGNOSTIC] Server Exception:", err);
    return { authorized: false, error: "Authentication check failed." };
  }
}
