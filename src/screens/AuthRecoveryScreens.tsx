import { useEffect, useRef, useState } from "react"
import { Screen } from "../types"
import { Button, Input } from "../components/common"
import { PublicHeader } from "../components/layouts"
import { api, ApiError, errorMessage } from "../api/client"
import { emailLooksValid, passwordProblem } from "../api/validation"

interface Props {
  navigate: (screen: Screen, params?: any) => void
}

// ─── Development mail preview ─────────────────────────────────────────────────
// Shown ONLY when the API runs with MAIL_TRANSPORT=preview (development). It makes the
// verification / reset flows testable without an email provider. No real email is sent.

export function DevMailPanel({
  email,
  refreshKey = 0,
  kind,
}: {
  email: string
  refreshKey?: number
  /** Show only the verification or only the password-reset message. */
  kind?: "verify" | "reset"
}) {
  const [active, setActive] = useState(false)
  const [messages, setMessages] = useState<
    { subject: string; links: string[]; at: string }[]
  >([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if ((await api.mailMode()) !== "preview") return
        setActive(true)
        // Mail is queued by the server right after the response; give it a moment.
        await new Promise((resolve) => setTimeout(resolve, 400))
        const list = await api.devMailPreview(email)
        const wanted = kind
          ? list.filter((message) =>
              message.links.some((link) => link.includes(`${kind}=`)),
            )
          : list
        if (!cancelled) setMessages(wanted)
      } catch {
        // not in preview mode (404) or API unreachable: show nothing
      }
    })()
    return () => {
      cancelled = true
    }
  }, [email, refreshKey, kind])

  if (!active) return null
  return (
    <div
      role="note"
      className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-900"
    >
      <p className="font-semibold">
        DEVELOPMENT MAIL PREVIEW — no real email was sent.
      </p>
      <p className="mt-1 text-xs">
        This panel exists only while the API runs in preview mode. With a real
        email provider configured, you would receive this message in your inbox.
      </p>
      {messages.length === 0 ? (
        <p className="mt-3 text-xs">
          No message for {email} yet. (Nothing is created if the address has no
          account.)
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {messages.slice(0, 2).map((message) => (
            <li
              key={message.at + message.subject}
              className="rounded-lg bg-white p-3 shadow-sm"
            >
              <p className="text-xs font-semibold text-navy">{message.subject}</p>
              {message.links.map((link) => (
                <button
                  key={link}
                  type="button"
                  onClick={() => window.location.assign(link)}
                  className="mt-2 rounded-lg bg-blue px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  Open the emailed link
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Shell({
  navigate,
  title,
  subtitle,
  children,
}: Props & { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PublicHeader navigate={navigate} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-border p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-navy mb-1">{title}</h1>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

function Alert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const style =
    tone === "error"
      ? "border-red-200 bg-red-50 text-danger"
      : "border-green-200 bg-green-50 text-green-800"
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-lg border px-3 py-2 text-sm ${style}`}>
      {children}
    </p>
  )
}

// ─── Forgot password ──────────────────────────────────────────────────────────

export function ForgotPasswordScreen({
  navigate,
  audience,
}: Props & { audience: "patient" | "dentist" }) {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const back = audience === "dentist" ? "admin-login" : "patient-login"

  const submit = async () => {
    if (busy) return
    if (!emailLooksValid(email)) {
      setError("Enter a valid email address.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.forgotPassword(email.trim())
      setDone(result.message)
      setRefreshKey((key) => key + 1)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell
      navigate={navigate}
      title="Forgot Password?"
      subtitle={
        audience === "dentist"
          ? "Enter your work email and we will send reset instructions."
          : "Enter your account email and we will send reset instructions."
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {done ? (
        <>
          <Alert tone="success">{done}</Alert>
          <p className="text-xs text-muted">
            The link works once and expires in 20 minutes. We never email your
            current password.
          </p>
          <DevMailPanel email={email.trim()} refreshKey={refreshKey} kind="reset" />
        </>
      ) : (
        <div className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
          />
          <Button variant="primary" fullWidth disabled={busy} onClick={submit}>
            {busy ? "Sending…" : "Send Reset Link"}
          </Button>
          {audience === "dentist" && (
            <p className="text-xs text-muted">
              Staff accounts created with a development address (ending in
              .test) cannot receive email. Ask the clinic administrator to reset
              the password with the local staff tool.
            </p>
          )}
        </div>
      )}
      <div className="mt-5 pt-4 border-t border-border text-center">
        <button
          type="button"
          onClick={() => navigate(back)}
          className="text-sm text-blue font-medium hover:underline"
        >
          ← Back to Log In
        </button>
      </div>
    </Shell>
  )
}

// ─── Reset password (opened from the emailed link) ────────────────────────────

export function ResetPasswordScreen({
  navigate,
  token,
}: Props & { token: string }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<{ message: string; stale: boolean } | null>(() =>
    token.startsWith("error:")
      ? { message: token.slice("error:".length), stale: true }
      : null,
  )
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    const next: Record<string, string> = {}
    const problem = passwordProblem(password)
    if (problem) next.password = problem
    if (password !== confirm) next.confirm = "Passwords do not match."
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    setFormError(null)
    try {
      setDone((await api.resetPassword(token, password)).message)
    } catch (caught) {
      const stale = caught instanceof ApiError && caught.status === 400 && !/at least|letter|common|contain/i.test(caught.message)
      setFormError({ message: errorMessage(caught), stale })
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Shell navigate={navigate} title="Password Changed">
        <Alert tone="success">{done}</Alert>
        <p className="mb-4 text-xs text-muted">
          You were signed out everywhere. Use your new password to log in.
        </p>
        <div className="space-y-3">
          <Button variant="primary" fullWidth onClick={() => navigate("patient-login")}>
            Patient Log In
          </Button>
          <Button variant="secondary" fullWidth onClick={() => navigate("admin-login")}>
            Dentist Log In
          </Button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell navigate={navigate} title="Choose a New Password" subtitle="Use at least 8 characters with a letter and a number.">
      {formError && (
        <Alert tone="error">
          {formError.message}
          {formError.stale && (
            <>
              {" "}
              <button type="button" className="font-semibold underline" onClick={() => navigate("forgot-password", { audience: "patient" })}>
                Request a new link
              </button>
            </>
          )}
        </Alert>
      )}
      <div className="space-y-4">
        <Input label="New Password" type="password" value={password} onChange={setPassword} error={errors.password} required />
        <Input label="Confirm New Password" type="password" value={confirm} onChange={setConfirm} error={errors.confirm} required />
        <Button variant="primary" fullWidth disabled={busy} onClick={submit}>
          {busy ? "Saving…" : "Change Password"}
        </Button>
      </div>
    </Shell>
  )
}

// ─── Verify email (opened from the emailed link) ──────────────────────────────

export function VerifyEmailScreen({
  navigate,
  token,
  signedIn,
  onVerified,
}: Props & { token: string; signedIn: boolean; onVerified: () => void }) {
  const [state, setState] = useState<"working" | "ok" | "failed">("working")
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [resent, setResent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // The link token is one-time. React StrictMode (used by `vite dev`) runs effects twice, so remember
  // which token was already submitted and send exactly ONE request per token.
  const submitted = useRef<string | null>(null)
  useEffect(() => {
    if (submitted.current === token) return
    submitted.current = token
    if (token.startsWith("error:")) {
      setMessage(token.slice("error:".length))
      setState("failed")
      return
    }
    ;(async () => {
      try {
        const result = await api.verifyEmail(token)
        setMessage(result.message)
        setState("ok")
        onVerified()
      } catch (caught) {
        setMessage(errorMessage(caught))
        setState("failed")
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const resend = async () => {
    if (busy) return
    if (!emailLooksValid(email)) {
      setResent(null)
      setMessage("Enter the email address you registered with.")
      return
    }
    setBusy(true)
    try {
      setResent((await api.resendVerification(email.trim())).message)
      setRefreshKey((key) => key + 1)
    } catch (caught) {
      setMessage(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  if (state === "working")
    return (
      <Shell navigate={navigate} title="Verifying…">
        <p role="status" className="text-center text-sm text-muted">Checking your verification link…</p>
      </Shell>
    )

  if (state === "ok")
    return (
      <Shell navigate={navigate} title="Email Verified">
        <Alert tone="success">{message}</Alert>
        <Button variant="primary" fullWidth onClick={() => navigate(signedIn ? "patient-home" : "patient-login")}>
          {signedIn ? "Continue" : "Log In"}
        </Button>
      </Shell>
    )

  return (
    <Shell navigate={navigate} title="Link Not Valid">
      <Alert tone="error">{message}</Alert>
      {resent ? (
        <>
          <Alert tone="success">{resent}</Alert>
          <DevMailPanel email={email.trim()} refreshKey={refreshKey} kind="verify" />
        </>
      ) : (
        <div className="space-y-4">
          <Input label="Send a new verification email to" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Button variant="primary" fullWidth disabled={busy} onClick={resend}>
            {busy ? "Sending…" : "Resend Verification Email"}
          </Button>
        </div>
      )}
      <div className="mt-5 pt-4 border-t border-border text-center">
        <button type="button" onClick={() => navigate("patient-login")} className="text-sm text-blue font-medium hover:underline">
          Go to Log In
        </button>
      </div>
    </Shell>
  )
}
