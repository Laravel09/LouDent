// Processing of the links sent in Supabase Auth emails.
//
// Supported link shapes (see docs/SUPABASE_SETUP.md, "Email templates"):
//  1. Recommended (works in any browser/device):
//       {SITE}/auth/confirm?token_hash=…&type=email      (sign-up verification)
//       {SITE}/auth/confirm?token_hash=…&type=recovery   (password reset)
//     -> supabase.auth.verifyOtp({ token_hash, type })
//  2. Default Supabase templates with PKCE: Supabase verifies the token and
//     redirects to {SITE}/auth/confirm?flow=signup|recovery&code=…
//     -> supabase.auth.exchangeCodeForSession(code) (same browser only)
//  3. Error redirects: ?error=…&error_description=… (query or #hash)
//
// The URL is read once and immediately cleaned so tokens do not stay in the
// address bar, history, or Referer headers. Each link is redeemed only once
// (Supabase tokens are single-use and expire).
import { supabase } from "./supabase"

export type EmailLinkKind = "verify" | "reset"
export interface EmailLink {
  kind: EmailLinkKind
  tokenHash?: string
  code?: string
  error?: string
}

export function takeEmailLink(): EmailLink | null {
  try {
    const url = new URL(window.location.href)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""))
    const get = (k: string) => url.searchParams.get(k) ?? hash.get(k)
    const type = get("type")
    const flow = get("flow")
    const tokenHash = get("token_hash")
    const code = get("code")
    const error = get("error_description") ?? get("error")
    const onCallbackPath = url.pathname.replace(/\/+$/, "") === "/auth/confirm"

    let link: EmailLink | null = null
    const kind: EmailLinkKind = type === "recovery" || flow === "recovery" ? "reset" : "verify"
    if (tokenHash && type) link = { kind, tokenHash }
    else if (code && onCallbackPath) link = { kind, code }
    else if (error && (onCallbackPath || type || flow)) link = { kind, error: friendlyLinkError(error) }

    if (link || onCallbackPath) window.history.replaceState(null, "", "/")
    return link
  } catch {
    return null
  }
}

function friendlyLinkError(raw: string) {
  return /expired|invalid|not found|already/i.test(raw)
    ? "This link is invalid, has already been used, or has expired. Please request a new one."
    : raw.slice(0, 200)
}

const redeemed = new Map<string, Promise<void>>()

/** Redeem an email link exactly once (safe under React StrictMode double effects). */
export function redeemEmailLink(link: EmailLink): Promise<void> {
  const id = link.tokenHash ?? link.code ?? link.error ?? "none"
  let pending = redeemed.get(id)
  if (!pending) {
    pending = (async () => {
      if (link.error) throw new Error(link.error)
      if (link.tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: link.tokenHash,
          type: link.kind === "reset" ? "recovery" : "email",
        })
        if (error) throw new Error(friendlyLinkError(error.message))
        return
      }
      if (link.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(link.code)
        if (error) {
          // For sign-up links Supabase has ALREADY confirmed the address before
          // redirecting; only the automatic sign-in failed (e.g. other browser).
          if (link.kind === "verify") return
          throw new Error(friendlyLinkError(error.message))
        }
        return
      }
      throw new Error("This link is incomplete. Please request a new one.")
    })()
    redeemed.set(id, pending)
  }
  return pending
}
