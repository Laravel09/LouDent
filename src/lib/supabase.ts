import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim()

/** Human-readable configuration problem, or null when the client is usable. */
export const supabaseConfigError: string | null = !url || !key
  ? "LouDent is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example)."
  : !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)
    ? "VITE_SUPABASE_URL must look like https://<project-ref>.supabase.co"
    : /^sb_secret_|service_role/i.test(key) || looksLikeServiceRoleJwt(key)
      ? "A SECRET key was supplied to the browser. Use the publishable key (sb_publishable_…) and rotate the exposed secret key."
      : null

function looksLikeServiceRoleJwt(value: string) {
  try {
    const part = value.split(".")[1]
    if (!part) return false
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
    return payload?.role === "service_role"
  } catch {
    return false
  }
}

// When misconfigured, a harmless placeholder client is created so the app can
// render a clear configuration message instead of a blank page.
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseConfigError ? "http://127.0.0.1:1" : url,
  supabaseConfigError ? "missing-key" : key,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Email links are processed explicitly by src/lib/authLinks.ts so that
      // verification and recovery are handled exactly once, in one place.
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
)

/** Base URL used in auth email redirects. */
export function siteUrl() {
  const configured = (import.meta.env.VITE_SITE_URL ?? "").trim().replace(/\/+$/, "")
  return configured || window.location.origin
}
