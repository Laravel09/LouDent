import { useState } from "react"
import { PatientProfile, Screen } from "../types"
import { groupServices, useCatalog } from "../api/catalog"
import {
  Button,
  DentalServiceIcon,
  LogoutDialog,
  icons,
} from "../components/common"
import { PublicHeader, PublicFooter } from "../components/layouts"

// ─── About Page ───────────────────────────────────────────────────────────────

export function AboutPage({
  navigate,
}: {
  navigate: (s: Screen, p?: any) => void
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader navigate={navigate} activeScreen="about" />
      <main className="flex-1">
        <section className="bg-navy px-6 py-16 text-white">
          <div className="mx-auto max-w-3xl">
            <p className="mb-3 text-sm font-semibold text-blue-300">
              About LouDent
            </p>
            <h1 className="text-4xl font-bold">
              Professional dental care, made easier to access.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
              LouDent is a Cebu City dental clinic demo focused on clear service
              information and convenient appointment requests.
            </p>
          </div>
        </section>
        <section className="px-6 py-14">
          <div className="mx-auto max-w-3xl space-y-10">
            <div>
              <h2 className="text-2xl font-bold text-navy">Our Story</h2>
              <p className="mt-3 leading-relaxed text-muted">
                LouDent was designed around a straightforward idea: patients
                should be able to understand available treatments, choose a
                dentist, and request a suitable visit without a complicated
                process.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-lg font-bold text-navy">Mission</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  To provide accessible, quality dental care through
                  professional service and convenient appointment management.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-lg font-bold text-navy">Vision</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  To create a trusted dental care experience that puts patients
                  first.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter navigate={navigate} />
    </div>
  )
}

// ─── Contact Page ─────────────────────────────────────────────────────────────

export function ContactPage({
  navigate,
}: {
  navigate: (s: Screen, p?: any) => void
}) {
  const [form, setForm] = useState({ name: "", email: "", message: "" })
  const [draftOpened, setDraftOpened] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!form.name.trim()) nextErrors.name = "Enter your full name."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address."
    }
    if (!form.message.trim()) nextErrors.message = "Enter a message."
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    window.location.href = `mailto:info@loudent.com?subject=${encodeURIComponent(`LouDent inquiry from ${form.name}`)}&body=${encodeURIComponent(`${form.message}\n\nReply to: ${form.email}`)}`
    setDraftOpened(true)
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PublicHeader navigate={navigate} activeScreen="contact" />
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-6 py-12 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl bg-navy p-7 text-white">
          <p className="text-sm font-semibold text-blue-300">
            Clinic Information
          </p>
          <h1 className="mt-2 text-3xl font-bold">Contact LouDent</h1>
          <dl className="mt-8 space-y-5 text-sm">
            <div>
              <dt className="text-white/50">Address</dt>
              <dd className="mt-1 font-medium">Cebu City, Cebu, Philippines</dd>
            </div>
            <div>
              <dt className="text-white/50">Phone</dt>
              <dd className="mt-1 font-medium">
                <a href="tel:0325551234">(032) 555-1234</a>
              </dd>
            </div>
            <div>
              <dt className="text-white/50">Email</dt>
              <dd className="mt-1 font-medium">
                <a href="mailto:info@loudent.com">info@loudent.com</a>
              </dd>
            </div>
            <div>
              <dt className="text-white/50">Clinic Hours</dt>
              <dd className="mt-1 font-medium">
                Monday–Friday · 9:00 AM–6:00 PM
                <br />
                Saturday · 9:00 AM–3:00 PM
                <br />
                Sunday · Closed
              </dd>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border border-border bg-white p-7">
          <h2 className="text-xl font-bold text-navy">Send an Email</h2>
          <p className="mt-1 text-sm text-muted">
            This opens a prepared draft in your email app; LouDent does not send
            it automatically.
          </p>
          {draftOpened && (
            <div
              role="status"
              className="mt-5 rounded-xl bg-blue-tint px-4 py-3 text-sm text-blue"
            >
              If your email app opened, review and send your message there.
              Nothing has been sent from LouDent.
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="contact-name"
                className="mb-1.5 block text-sm font-medium text-navy"
              >
                Full Name
              </label>
              <input
                id="contact-name"
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                aria-describedby={
                  errors.name ? "contact-name-error" : undefined
                }
                className={`w-full rounded-xl border px-4 py-2.5 text-sm ${
                  errors.name ? "border-danger" : "border-border"
                }`}
              />
              {errors.name && (
                <p id="contact-name-error" className="mt-1 text-xs text-danger">
                  {errors.name}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="contact-email"
                className="mb-1.5 block text-sm font-medium text-navy"
              >
                Email Address
              </label>
              <input
                id="contact-email"
                type="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                aria-describedby={
                  errors.email ? "contact-email-error" : undefined
                }
                className={`w-full rounded-xl border px-4 py-2.5 text-sm ${
                  errors.email ? "border-danger" : "border-border"
                }`}
              />
              {errors.email && (
                <p
                  id="contact-email-error"
                  className="mt-1 text-xs text-danger"
                >
                  {errors.email}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="contact-message"
                className="mb-1.5 block text-sm font-medium text-navy"
              >
                Message
              </label>
              <textarea
                id="contact-message"
                required
                rows={5}
                value={form.message}
                onChange={(event) =>
                  setForm({ ...form, message: event.target.value })
                }
                aria-describedby={
                  errors.message ? "contact-message-error" : undefined
                }
                className={`w-full resize-none rounded-xl border px-4 py-2.5 text-sm ${
                  errors.message ? "border-danger" : "border-border"
                }`}
              />
              {errors.message && (
                <p
                  id="contact-message-error"
                  className="mt-1 text-xs text-danger"
                >
                  {errors.message}
                </p>
              )}
            </div>
            <Button type="submit" variant="primary">
              Open Email Draft
            </Button>
          </form>
        </section>
      </main>
      <PublicFooter navigate={navigate} />
    </div>
  )
}

// ─── Public Services Page ─────────────────────────────────────────────────────


export function PublicServicesPage({
  navigate,
}: {
  navigate: (s: Screen, p?: any) => void
}) {
  const [activeCategory, setActiveCategory] = useState<string>("All")
  const { services: allServices, loading, error } = useCatalog()
  const GROUPED = groupServices(allServices)

  const categories = ["All", "General Dentistry", "Orthodontics"]

  const visibleGroups = GROUPED.filter(
    (g) => activeCategory === "All" || g.category === activeCategory,
  )

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader navigate={navigate} activeScreen="services" />

      {/* Hero */}
      <section className="bg-navy text-white py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm font-medium mb-5">
            <DentalServiceIcon className="h-5 w-5" /> Our Services
          </div>
          <h1 className="text-4xl font-bold mb-3">Comprehensive Dental Care</h1>
          <p className="text-white/70 text-lg max-w-xl mx-auto">
            From routine check-ups to full orthodontic treatment, we offer a
            complete range of dental services for all ages.
          </p>
        </div>
      </section>

      <section className="py-14 px-6 bg-surface flex-1">
        <div className="max-w-5xl mx-auto">
          {/* Category filter */}
          <div className="flex gap-2 mb-8 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-blue text-white"
                    : "bg-white text-muted border border-border hover:border-blue hover:text-blue"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800 mb-8">
            <strong>Note:</strong> Prices listed are starting rates and may vary
            based on individual assessment. Final fees will be confirmed at
            consultation. All prices in Philippine Peso (₱).
          </div>

          {visibleGroups.length === 0 && (
            <p role="status" className="py-10 text-center text-sm text-muted">
              {loading
                ? "Loading services…"
                : error
                  ? "Services could not be loaded. Check the connection message below and retry."
                  : "No services are available right now."}
            </p>
          )}

          {visibleGroups.map(({ category, ids }) => {
            const services = ids
              .map((id) => allServices.find((s) => s.id === id))
              .filter(Boolean) as typeof allServices
            return (
              <div key={category} className="mb-10">
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-blue">
                    <DentalServiceIcon serviceId={ids[0]} />
                  </span>
                  <h2 className="text-xl font-bold text-navy">{category}</h2>
                  <span className="ml-auto text-xs text-muted bg-white border border-border rounded-full px-3 py-1 font-medium">
                    {services.length} services
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {services.map((svc) => {
                    const isBraces = svc.id === "braces-install"
                    return (
                      <div
                        key={svc.id}
                        className={`rounded-xl border p-5 ${
                          isBraces
                            ? "bg-navy border-navy/60 text-white"
                            : "bg-white border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                isBraces ? "text-blue-300" : "text-blue"
                              }
                            >
                              <DentalServiceIcon
                                serviceId={svc.id}
                                className="h-5 w-5"
                              />
                            </span>
                            <h3
                              className={`font-bold text-sm ${
                                isBraces ? "text-white" : "text-navy"
                              }`}
                            >
                              {svc.name}
                            </h3>
                          </div>
                          <div
                            className={`text-sm font-bold whitespace-nowrap ${
                              isBraces ? "text-amber-400" : "text-blue"
                            }`}
                          >
                            ₱{svc.price.toLocaleString()}
                          </div>
                        </div>
                        <p
                          className={`text-xs leading-relaxed mb-4 ${
                            isBraces ? "text-white/70" : "text-muted"
                          }`}
                        >
                          {svc.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs ${
                              isBraces ? "text-white/50" : "text-muted"
                            }`}
                          >
                            ⏱ ~{svc.duration} min
                          </span>
                          <button
                            onClick={() =>
                              navigate("service-detail", { serviceId: svc.id })
                            }
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                              isBraces
                                ? "bg-amber-400 text-navy hover:bg-amber-300"
                                : "bg-blue-tint text-blue hover:bg-blue/10"
                            }`}
                          >
                            View Details →
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <PublicFooter navigate={navigate} />
    </div>
  )
}

// ─── Settings Page (Patient) ──────────────────────────────────────────────────

interface SettingsPageProps {
  navigate: (s: Screen, p?: any) => void
  profile: PatientProfile
  onLogout: () => void
}

function SettingsSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-bold text-muted uppercase tracking-widest mb-3 px-1">
        {title}
      </h2>
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function SettingsRow({
  icon,
  label,
  value,
  children,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value?: string
  children?: React.ReactNode
  onClick?: () => void
}) {
  const content = (
    <>
      {icon && <span className="text-xl w-7 text-center">{icon}</span>}
      <div className="flex-1">
        <div className="text-sm font-medium text-navy">{label}</div>
        {value && <div className="text-xs text-muted mt-0.5">{value}</div>}
      </div>
      {children && <div>{children}</div>}
      {onClick && !children && (
        <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24">
          <path
            d="M9 18l6-6-6-6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-4 border-b border-border px-5 py-4 text-left transition-colors last:border-0 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        onClick={onClick}
      >
        {content}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
      {content}
    </div>
  )
}

export function SettingsPage({
  navigate,
  profile,
  onLogout,
}: SettingsPageProps) {
  const [logoutOpen, setLogoutOpen] = useState(false)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-navy">Settings</h1>
      <p className="mb-7 mt-1 text-sm text-muted">
        Manage your account.
      </p>

      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="border-b border-border bg-surface px-6 py-4">
            <h2 className="font-bold text-navy">Account</h2>
          </div>
          <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-semibold text-navy">{profile.name}</p>
              <p className="text-sm text-muted">
                {profile.email} · {profile.phone}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => navigate("edit-profile")}
            >
              Edit Profile
            </Button>
          </div>
          <div className="border-t border-border px-6 py-3 text-xs text-muted">
            To change a forgotten password, log out and use “Forgot password?” on
            the login page.
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <button
            onClick={() => navigate("contact")}
            className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-surface"
          >
            <span>
              <span className="block text-sm font-semibold text-navy">
                Contact LouDent
              </span>
              <span className="text-xs text-muted">
                Clinic details and email-draft form
              </span>
            </span>
            <span className="text-blue">→</span>
          </button>
          <button
            onClick={() => setLogoutOpen(true)}
            className="w-full border-t border-border px-6 py-4 text-left text-sm font-semibold text-danger hover:bg-red-50"
          >
            Log Out
          </button>
        </section>
      </div>

      {logoutOpen && (
        <LogoutDialog
          onConfirm={() => {
            setLogoutOpen(false)
            onLogout()
          }}
          onCancel={() => setLogoutOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Dentist Settings Page ────────────────────────────────────────────────────

interface AdminSettingsPageProps {
  navigate: (s: Screen, p?: any) => void
  onLogout: () => void
}

export function AdminSettingsPage({ navigate }: AdminSettingsPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-navy">Settings</h1>
      <p className="mb-8 text-sm text-muted">
        Manage your dentist account and find support.
      </p>

      <SettingsSection title="Dentist Account">
        <SettingsRow
          icon={icons.profile}
          label="Dentist profile"
          value="Manage professional details from My Profile"
          onClick={() => navigate("admin-profile")}
        />
        <SettingsRow
          icon={icons.services}
          label="Role"
          value="Dentist · Clinic appointment access"
        />
      </SettingsSection>

      <SettingsSection title="Help & Support">
        <SettingsRow
          icon={icons.services}
          label="Contact Support"
          value="info@loudent.com"
          onClick={() => navigate("contact")}
        />
      </SettingsSection>
    </div>
  )
}
