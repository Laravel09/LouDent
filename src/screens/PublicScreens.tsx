import { useState } from "react"
import { AvailabilityDay, Dentist, Screen } from "../types"
import { useCatalog } from "../api/catalog"
import { api, errorMessage } from "../api/client"
import { DevMailPanel } from "./AuthRecoveryScreens"
import { emailLooksValid, passwordProblem, phoneLooksValid } from "../api/validation"
import {
  Button,
  Input,
  Logo,
  Card,
  Checkbox,
  DentalServiceIcon,
  ProfileAvatar,
  icons,
} from "../components/common"
import { PublicHeader, PublicFooter } from "../components/layouts"

interface Props {
  navigate: (screen: Screen, params?: any) => void
}

interface PublicServiceDetailProps extends Props {
  params?: any
  dentists: Dentist[]
}

interface PublicDentistProfileProps extends Props {
  params?: any
  dentists: Dentist[]
  availability: Record<string, AvailabilityDay[]>
  blockedDates: Record<string, string[]>
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

// Stock photo (Unsplash). If it cannot load (offline, blocked), show a clear placeholder.
function HeroImage() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div
        role="img"
        aria-label="Dental treatment room photo unavailable"
        className="flex h-72 w-full flex-col items-center justify-center gap-2 bg-blue-tint text-center"
      >
        <Logo size="lg" />
        <p className="text-sm text-muted">Treatment room photo unavailable offline</p>
      </div>
    )
  }
  return (
    <img
      src="https://images.unsplash.com/photo-1704455306251-b4634215d98f?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=1080"
      alt="Modern dental treatment room with dental chair and clinical equipment"
      onError={() => setFailed(true)}
      className="w-full h-72 object-cover object-center"
    />
  )
}

export function LandingPage({ navigate }: Props) {
  const { services } = useCatalog()
  const previewServices = services.slice(0, 4)

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader navigate={navigate} activeScreen="landing" />

      {/* Hero */}
      <section className="bg-gradient-to-br from-surface via-white to-blue-tint">
        <div className="max-w-6xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-tint text-blue text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue" />
              Trusted Dental Care in Cebu City
            </div>
            <h1 className="text-5xl font-bold text-navy leading-tight mb-5">
              Your Smile,
              <br />
              Our Care.
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              Quality dental care and convenient appointment booking in Cebu
              City.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="primary"
                size="lg"
                onClick={() =>
                  navigate("patient-login", {
                    pendingDestination: "book-category",
                  })
                }
              >
                Book Appointment
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate("services")}
              >
                Explore Services
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl bg-surface-2">
              <HeroImage />
            </div>
          </div>
        </div>
      </section>

      {/* Services Preview */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl font-bold text-navy mb-2">
                Our Dental Services
              </h2>
              <p className="text-muted">
                Comprehensive dental care for every need
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("services")}
            >
              See All Services →
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {previewServices.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => navigate("service-detail", { serviceId: s.id })}
                className="bg-white border border-border rounded-xl p-5 text-left hover:border-blue/40 hover:shadow-md transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <div className="mb-4 inline-flex rounded-xl bg-blue-tint p-2.5 text-blue">
                  <DentalServiceIcon serviceId={s.id} />
                </div>
                <h3 className="font-semibold text-navy text-sm mb-1">
                  {s.name}
                </h3>
                <p className="text-xs text-muted mb-3">
                  {s.duration} min · ₱{s.price.toLocaleString()}
                </p>
                <p className="text-xs text-muted leading-relaxed line-clamp-2">
                  {s.description}
                </p>
                <p className="text-xs font-semibold text-blue mt-3 group-hover:underline">
                  View Details →
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-surface">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-navy mb-3">
              Why Choose LouDent?
            </h2>
            <p className="text-muted">
              We make dental care accessible, comfortable, and stress-free.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: icons.dentists,
                title: "Quality Dental Care",
                desc: "Professional care delivered with clear explanations and attention to your comfort.",
              },
              {
                icon: icons.appointments,
                title: "Convenient Online Booking",
                desc: "Choose a service, dentist, and available schedule through one guided flow.",
              },
              {
                icon: icons.services,
                title: "Patient-Focused Service",
                desc: "Manage requests and appointment updates from your personal patient portal.",
              },
            ].map((b) => (
              <Card key={b.title} className="text-center">
                <div className="mx-auto mb-4 inline-flex rounded-xl bg-blue-tint p-3 text-blue">
                  {b.icon}
                </div>
                <h3 className="font-semibold text-navy mb-2">{b.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{b.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter navigate={navigate} />
    </div>
  )
}

export function PublicServiceDetailScreen({
  navigate,
  params,
  dentists,
}: PublicServiceDetailProps) {
  const { getService, loading: catalogLoading } = useCatalog()
  const service = getService(params?.serviceId)
  if (!service) {
    return (
      <div className="min-h-screen bg-surface">
        <PublicHeader navigate={navigate} activeScreen="services" />
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-2xl font-bold text-navy">
            {catalogLoading ? "Loading service…" : "Service not found"}
          </h1>
          <Button
            className="mt-5"
            variant="secondary"
            onClick={() => navigate("services")}
          >
            Back to Services
          </Button>
        </div>
      </div>
    )
  }
  const eligibleDentists = dentists.filter((dentist) =>
    dentist.services.includes(service.name),
  )
  return (
    <div className="min-h-screen bg-surface">
      <PublicHeader navigate={navigate} activeScreen="services" />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <button
          onClick={() => navigate("services")}
          className="mb-6 text-sm font-medium text-blue hover:underline"
        >
          ← Back to Services
        </button>
        <article className="rounded-2xl border border-border bg-white p-6 sm:p-8">
          <p className="text-sm font-semibold text-blue">Dental Service</p>
          <h1 className="mt-1 text-3xl font-bold text-navy">{service.name}</h1>
          <p className="mt-4 leading-relaxed text-muted">
            {service.description}
          </p>
          <div className="my-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-muted">
                Duration
              </p>
              <p className="mt-1 font-bold text-navy">
                {service.duration} minutes
              </p>
            </div>
            <div className="rounded-xl bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-muted">
                Starting Price
              </p>
              <p className="mt-1 font-bold text-navy">
                ₱{service.price.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mb-6 rounded-xl border border-border p-4">
            <h2 className="font-semibold text-navy">Preparation</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {service.preparation}
            </p>
          </div>
          <div className="mb-6">
            <h2 className="mb-3 font-semibold text-navy">Available Dentists</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {eligibleDentists.map((dentist) => (
                <button
                  key={dentist.id}
                  onClick={() =>
                    navigate("dentist-profile", { dentistId: dentist.id })
                  }
                  className="rounded-xl border border-border p-4 text-left hover:border-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                >
                  <span className="block font-semibold text-navy">
                    {dentist.name}
                  </span>
                  <span className="text-sm text-muted">
                    {dentist.specialty}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() =>
              navigate("patient-login", { preselectedServiceId: service.id })
            }
          >
            Log In to Book This Service
          </Button>
        </article>
      </main>
      <PublicFooter navigate={navigate} />
    </div>
  )
}

export function PublicDentistProfileScreen({
  navigate,
  params,
  dentists,
  availability,
  blockedDates,
}: PublicDentistProfileProps) {
  const dentist = dentists.find((item) => item.id === params?.dentistId)
  if (!dentist) {
    return (
      <div className="min-h-screen bg-surface">
        <PublicHeader navigate={navigate} />
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-2xl font-bold text-navy">Dentist not found</h1>
          <Button
            className="mt-5"
            variant="secondary"
            onClick={() => navigate("landing")}
          >
            Back to Home
          </Button>
        </div>
      </div>
    )
  }
  const schedule = (availability[dentist.id] ?? []).filter(
    (day) => day.available,
  )
  return (
    <div className="min-h-screen bg-surface">
      <PublicHeader navigate={navigate} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <button
          onClick={() => navigate("landing")}
          className="mb-6 text-sm font-medium text-blue hover:underline"
        >
          ← Back to Home
        </button>
        <article className="rounded-2xl border border-border bg-white p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row">
            <ProfileAvatar
              photo={dentist.photo}
              initials={dentist.name
                .split(" ")
                .slice(1)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
              className="h-28 w-28 flex-shrink-0 text-xl"
            />
            <div>
              <h1 className="text-2xl font-bold text-navy">
                {dentist.name}, {dentist.title}
              </h1>
              <p className="mt-1 font-medium text-teal">{dentist.specialty}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {dentist.bio}
              </p>
            </div>
          </div>
          <div className="my-6 rounded-xl bg-surface p-4">
            <h2 className="mb-2 font-semibold text-navy">Current Schedule</h2>
            {schedule.map((day) => (
              <div key={day.day} className="flex justify-between py-1 text-sm">
                <span>{day.day}</span>
                <span className="text-muted">
                  {day.start}–{day.end}
                  {day.breakStart && day.breakEnd
                    ? ` · Break ${day.breakStart}–${day.breakEnd}`
                    : ""}
                </span>
              </div>
            ))}
            {(blockedDates[dentist.id] ?? []).length > 0 && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                Unavailable dates: {blockedDates[dentist.id].join(", ")}
              </p>
            )}
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() =>
              navigate("patient-login", { preselectedDentistId: dentist.id })
            }
          >
            Log In to Book with {dentist.name.split(" ")[1]}
          </Button>
        </article>
      </main>
      <PublicFooter navigate={navigate} />
    </div>
  )
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export type RegisterOutcome =
  | { ok: true }
  | { ok: false; status: number; message: string; requestId?: string }

export function SignUpScreen({
  navigate,
  onRegister,
}: Props & {
  onRegister: (data: {
    name: string
    email: string
    phone: string
    password: string
    confirmPassword: string
    acceptedTerms: boolean
  }) => Promise<RegisterOutcome>
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  })
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [resendNote, setResendNote] = useState<string | null>(null)
  const [mailRefresh, setMailRefresh] = useState(0)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.name.trim().length < 2) e.name = "Enter your full name."
    if (!emailLooksValid(form.email)) e.email = "Enter a valid email address."
    if (!phoneLooksValid(form.phone))
      e.phone = "Enter a valid Philippine number, e.g. 0917 123 4567."
    const problem = passwordProblem(form.password, form.email)
    if (problem) e.password = problem
    if (form.password !== form.confirm) e.confirm = "Passwords do not match."
    if (!agreed) e.agreed = "You must agree to the Terms & Privacy Policy."
    return e
  }

  const handleSubmit = async () => {
    if (submitting) return
    const e = validate()
    setErrors(e)
    setFormError(null)
    if (Object.keys(e).length > 0) return
    setSubmitting(true)
    const outcome = await onRegister({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      password: form.password,
      confirmPassword: form.confirm,
      acceptedTerms: agreed,
    })
    setSubmitting(false)
    if (outcome.ok) {
      setSubmitted(true)
      return
    }
    // Distinguish: network (0), invalid input (400), duplicate email (409), too many tries (429), server fault (5xx).
    if (outcome.status === 409) setErrors({ email: outcome.message })
    else if (outcome.status === 400) {
      const m = outcome.message
      if (/email/i.test(m)) setErrors({ email: m })
      else if (/phone/i.test(m)) setErrors({ phone: m })
      else if (/password/i.test(m)) setErrors({ password: m })
      else if (/name/i.test(m)) setErrors({ name: m })
      else setFormError(m)
    } else setFormError(outcome.message)
  }

  const resend = async () => {
    try {
      setResendNote((await api.resendVerification(form.email.trim())).message)
      setMailRefresh((key) => key + 1)
    } catch (caught) {
      setResendNote(errorMessage(caught))
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-border p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-8 h-8 text-success"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="M5 12l5 5L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-navy mb-2">
            Account Created!
          </h2>
          <p className="text-muted text-sm mb-4">
            Welcome to LouDent, {form.name.trim().split(" ")[0]}! One more step:
            we sent a verification link to{" "}
            <span className="font-medium text-navy">{form.email.trim()}</span>.
            Verify your email to start booking appointments.
          </p>
          <p className="text-xs text-muted mb-4">
            The link works once and expires in 24 hours. Check your spam folder
            if it does not arrive.
          </p>
          {resendNote && (
            <p role="status" className="mb-3 text-xs text-green-800">
              {resendNote}
            </p>
          )}
          <button
            type="button"
            onClick={resend}
            className="mb-4 text-sm font-medium text-blue hover:underline"
          >
            Resend verification email
          </button>
          <DevMailPanel email={form.email.trim()} refreshKey={mailRefresh} kind="verify" />
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate("patient-login")}
          >
            Log In to Your Account
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PublicHeader navigate={navigate} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-border p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-navy mb-1">
              Create Your Account
            </h1>
            <p className="text-sm text-muted">
              Start your journey to a healthier smile
            </p>
          </div>

          <div className="space-y-4">
            <Input
              label="Full Name"
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder="Louie Bonghanoy"
              error={errors.name}
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={form.email}
              onChange={(v) => set("email", v)}
              placeholder="you@example.com"
              error={errors.email}
              required
            />
            <Input
              label="Phone Number"
              type="tel"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              placeholder="09xx xxx xxxx"
              error={errors.phone}
              required
            />
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(v) => set("password", v)}
              placeholder="8+ characters, a letter and a number"
              error={errors.password}
              required
            />
            <Input
              label="Confirm Password"
              type="password"
              value={form.confirm}
              onChange={(v) => set("confirm", v)}
              placeholder="Re-enter your password"
              error={errors.confirm}
              required
            />
            <div>
              <Checkbox
                checked={agreed}
                onChange={setAgreed}
                label={
                  <span>
                    I agree to the{" "}
                    <span className="font-medium text-navy">
                      Terms of Service
                    </span>{" "}
                    and{" "}
                    <span className="font-medium text-navy">
                      Privacy Policy
                    </span>
                  </span>
                }
              />
              {errors.agreed && (
                <p className="text-xs text-danger mt-1">{errors.agreed}</p>
              )}
            </div>
            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger"
              >
                {formError}
              </p>
            )}
            <Button
              variant="primary"
              fullWidth
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Creating Account…" : "Create Account"}
            </Button>
          </div>

          <p className="text-center text-sm text-muted mt-5">
            Already have an account?{" "}
            <button
              onClick={() => navigate("patient-login")}
              className="text-blue font-medium hover:underline"
            >
              Log In
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Patient Login ────────────────────────────────────────────────────────────

export function PatientLoginScreen({
  navigate,
  onLogin,
  notice,
}: Props & {
  onLogin: (email: string, password: string) => Promise<string | null>
  notice?: string | null
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (submitting) return
    const e: Record<string, string> = {}
    if (!email.includes("@")) e.email = "Enter a valid email address."
    if (!password) e.password = "Password is required."
    setErrors(e)
    if (Object.keys(e).length === 0) {
      setSubmitting(true)
      const authError = await onLogin(email, password)
      setSubmitting(false)
      if (authError) setErrors({ password: authError })
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PublicHeader navigate={navigate} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-border p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-navy mb-1">Welcome Back</h1>
            <p className="text-sm text-muted">
              Log in to your LouDent patient account
            </p>
          </div>

          {notice && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800"
            >
              {notice}
            </p>
          )}
          <div className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              error={errors.email}
              required
            />
            <div>
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="Your password"
                error={errors.password}
                required
              />
              <div className="text-right mt-1">
                <button
                  type="button"
                  onClick={() => navigate("forgot-password", { audience: "patient" })}
                  className="text-xs font-medium text-blue hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            </div>
            <Button
              variant="primary"
              fullWidth
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Logging In…" : "Log In"}
            </Button>
          </div>

          <div className="space-y-3 mt-5 text-center text-sm">
            <p className="text-muted">
              Don't have an account?{" "}
              <button
                onClick={() => navigate("signup")}
                className="text-blue font-medium hover:underline"
              >
                Sign Up
              </button>
            </p>
            <div className="pt-3 border-t border-border">
              <button
                onClick={() => navigate("admin-login")}
                className="text-xs text-muted hover:text-navy hover:underline"
              >
                Dentist Login →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dentist Login ────────────────────────────────────────────────────────────

export function AdminLoginScreen({
  navigate,
  onLogin,
  notice,
}: Props & {
  onLogin: (email: string, password: string) => Promise<string | null>
  notice?: string | null
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (submitting) return
    const e: Record<string, string> = {}
    if (!email.includes("@")) e.email = "Enter a valid email address."
    if (!password) e.password = "Password is required."
    setErrors(e)
    if (Object.keys(e).length === 0) {
      setSubmitting(true)
      const authError = await onLogin(email, password)
      setSubmitting(false)
      if (authError) setErrors({ password: authError })
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PublicHeader navigate={navigate} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-border p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-navy flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 2a5 5 0 015 5v2a5 5 0 01-10 0V7a5 5 0 015-5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M4 20c0-4 3.58-7 8-7s8 3 8 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-navy mb-1">Dentist Login</h1>
            <p className="text-sm text-muted">
              Access your personalized Dentist Portal
            </p>
          </div>

          {notice && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800"
            >
              {notice}
            </p>
          )}
          <div className="space-y-4">
            <Input
              label="Work Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="name@example.com"
              error={errors.email}
              required
            />
            <div>
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="Your password"
                error={errors.password}
                required
              />
              <div className="text-right mt-1">
                <button
                  type="button"
                  onClick={() => navigate("forgot-password", { audience: "dentist" })}
                  className="text-xs font-medium text-blue hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            </div>
            <Button
              variant="primary"
              fullWidth
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Logging In…" : "Log In to Dentist Portal"}
            </Button>
          </div>

          <div className="text-center mt-5 pt-4 border-t border-border">
            <button
              onClick={() => navigate("patient-login")}
              className="text-xs text-muted hover:text-navy hover:underline"
            >
              ← Patient Login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
