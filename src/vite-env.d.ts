/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://<project-ref>.supabase.co */
  readonly VITE_SUPABASE_URL: string
  /** Supabase PUBLISHABLE key (sb_publishable_…). Never put a secret/service-role key here. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Optional: public site URL used in auth email redirects (defaults to window.location.origin). */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
