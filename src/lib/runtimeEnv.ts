import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Reads a deployed Cloudflare Worker binding, with a process environment fallback
 * for local Next.js development and non-Worker test runners.
 */
export function runtimeEnv(name: string): string | undefined {
  try {
    const value = (getCloudflareContext().env as Record<string, unknown>)[name];
    if (typeof value === "string" && value.length > 0) return value;
  } catch {
    // Cloudflare context is unavailable outside the Workers runtime.
  }

  return process.env[name];
}
