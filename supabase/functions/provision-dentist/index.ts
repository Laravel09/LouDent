// Supabase Edge Function: provision-dentist
// ---------------------------------------------------------------------------
// Lets the clinic administrator (Dr. Maria Santos) create a dentist login securely.
//
// Security
//  * The project uses ASYMMETRIC JWT signing keys (ES256, see
//    /auth/v1/.well-known/jwks.json). The legacy gateway "verify_jwt" HS256
//    check is therefore disabled for this function (supabase/config.toml) and
//    the caller's access token is verified HERE against the project's JWKS
//    (signature, issuer, audience, expiry).
//  * Authorization is read from public.profiles (role = dentist AND
//    is_clinic_admin) with the admin client — never from the request body or
//    token metadata.
//  * Retrieves the rotated named secret key "loudent_backend_rotated" from the
//    Supabase-injected SUPABASE_SECRET_KEYS JSON dictionary. Does NOT depend on
//    the old "default" secret key or the legacy SUPABASE_SERVICE_ROLE_KEY.
//  * No password is chosen or returned here: the new dentist receives a Supabase
//    invitation email and sets their own password (single-use, expiring link).
//  * Every attempt that passes authorization is written to audit_logs.
// ---------------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2"
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from "npm:jose@5"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SECRET_KEY_NAME = "loudent_backend_rotated"

function getRotatedSecretKey(): string | null {
  const rawDict = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (rawDict) {
    try {
      const parsed = JSON.parse(rawDict)
      if (parsed && typeof parsed[SECRET_KEY_NAME] === "string" && parsed[SECRET_KEY_NAME].length > 0) {
        return parsed[SECRET_KEY_NAME]
      }
    } catch {
      // malformed JSON; fall through
    }
  }
  return null
}

const SITE_URL = (Deno.env.get("LOUDENT_SITE_URL") ?? "").replace(/\/+$/, "")
const ALLOWED_ORIGINS = (Deno.env.get("LOUDENT_ALLOWED_ORIGINS") ?? "http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean)

const ISSUER = `${SUPABASE_URL}/auth/v1`
const RAW_JWKS = Deno.env.get("SUPABASE_JWKS")
const JWKS = RAW_JWKS
  ? (() => {
      try {
        return createLocalJWKSet(JSON.parse(RAW_JWKS))
      } catch {
        return createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))
      }
    })()
  : createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

function reply(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) })
  if (req.method !== "POST") return reply(origin, 405, { error: "Method not allowed" })

  const secretKey = getRotatedSecretKey()
  if (!secretKey) {
    return reply(origin, 500, {
      error: `Named secret key "${SECRET_KEY_NAME}" is not present in SUPABASE_SECRET_KEYS.`,
    })
  }

  // 1. Authenticate: verify the caller's access token against the project's JWKS.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  let callerId: string
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: "authenticated" })
    if (typeof payload.sub !== "string" || payload.role !== "authenticated") throw new Error("bad subject")
    callerId = payload.sub
  } catch {
    return reply(origin, 401, { error: "Please log in again." })
  }

  // 2. Initialize admin client with the named secret key "loudent_backend_rotated".
  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 3. Authorize from the database (public.profiles), never from the token or body.
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role, is_clinic_admin")
    .eq("id", callerId)
    .maybeSingle()
  if (callerError || !caller || caller.role !== "dentist" || caller.is_clinic_admin !== true) {
    return reply(origin, 403, { error: "Only the clinic administrator can provision dentist accounts." })
  }

  // 4. Validate input.
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return reply(origin, 400, { error: "Invalid request." })
  }
  const email = String(body.email ?? "").trim().toLowerCase()
  const dentistId = String(body.dentistId ?? "").trim().toLowerCase()
  const name = String(body.name ?? "").trim().slice(0, 150)
  const title = String(body.title ?? "").trim().slice(0, 80)
  const specialty = String(body.specialty ?? "").trim().slice(0, 160)
  const makeAdmin = body.isClinicAdmin === true
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return reply(origin, 400, { error: "Enter a valid work email address." })
  }
  if (!ID_RE.test(dentistId)) {
    return reply(origin, 400, { error: "Dentist ID: 2-40 lowercase letters, digits or dashes." })
  }
  if (name.length < 2) {
    return reply(origin, 400, { error: "Enter the dentist's full name." })
  }

  // 5. Create the auth user via invitation (no password handled here).
  const redirectTo = SITE_URL ? `${SITE_URL}/auth/confirm?flow=recovery` : undefined
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name },
    redirectTo,
  })
  if (inviteError || !invited?.user) {
    const msg = /already|registered|exists/i.test(inviteError?.message ?? "")
      ? "An account with this email address already exists."
      : "The invitation could not be sent. Check the SMTP configuration and try again."
    await admin.from("audit_logs").insert({
      actor_id: callerId,
      action: "staff.provision_failed",
      entity_type: "profile",
      entity_id: null,
      details: { dentist_id: dentistId, reason: msg },
    })
    return reply(origin, 409, { error: msg })
  }

  // 6. Promote the new profile to a dentist login (service-role-only SQL function).
  const { error: linkError } = await admin.rpc("provision_dentist_account", {
    p_user_id: invited.user.id,
    p_dentist_id: dentistId,
    p_name: name,
    p_title: title,
    p_specialty: specialty,
    p_is_admin: makeAdmin,
    p_actor: callerId,
  })
  if (linkError) {
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
    return reply(origin, 409, { error: linkError.message })
  }

  return reply(origin, 201, {
    ok: true,
    userId: invited.user.id,
    dentistId,
    message: `Invitation sent to ${email}. The dentist sets their own password from the email link.`,
  })
})
