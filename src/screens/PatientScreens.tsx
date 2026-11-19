import { useState } from "react"
import {
  Screen,
  Service,
  Dentist,
  PatientProfile,
  AvailabilityDay,
  Appointment,
  AppointmentStatus,
} from "../types"
import { groupServices, useCatalog } from "../api/catalog"
import {
  Button,
  Card,
  DentalServiceIcon,
  StatusBadge,
  EmptyState,
  Avatar,
  Input,
  ProfileAvatar,
  ProfilePhotoControl,
  SuccessToast,
  PageHeader,
  ConfirmDialog,
  icons,
  formatAppointmentDate,
} from "../components/common"

interface Props {
  navigate: (screen: Screen, params?: any) => void
  params?: any
  appointments: Appointment[]
  onCancelAppointment: (id: string) => Promise<string | null>
  onRescheduleAppointment: (appointment: Appointment) => void
  onUpdateProfile: (data: PatientProfile) => Promise<string | null>
  profile: PatientProfile
  dentists: Dentist[]
  availability: Record<string, AvailabilityDay[]>
  blockedDates: Record<string, string[]>
}

// ─── Patient Home ─────────────────────────────────────────────────────────────

function appointmentTimestamp(appointment: Appointment) {
  const [clock, period] = appointment.time.split(" ")
  const [rawHour, minute] = clock.split(":").map(Number)
  const hour = (rawHour % 12) + (period === "PM" ? 12 : 0)
  return new Date(
    `${appointment.date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
  ).getTime()
}


export function PatientHome({ navigate, appointments, profile }: Props) {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
  ).getTime()
  const upcoming = appointments
    .filter(
      (appointment) =>
        (appointment.status === "Pending" ||
          appointment.status === "Confirmed") &&
        appointmentTimestamp(appointment) >= now,
    )
    .sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b))
  const nextAppointment = upcoming[0]
  const recent = [...appointments]
    .sort((a, b) => appointmentTimestamp(b) - appointmentTimestamp(a))
    .filter((appointment) => appointment.id !== nextAppointment?.id)
    .slice(0, 3)
  const firstName = profile.name.trim().split(" ")[0] || "Patient"
  const hour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
  ).getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-navy">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Review your next visit and recent appointment activity.
        </p>
      </div>

      <section aria-labelledby="next-appointment-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="next-appointment-heading"
            className="text-base font-bold text-navy"
          >
            Next Appointment
          </h2>
          <button
            onClick={() => navigate("my-appointments")}
            className="text-sm font-medium text-blue hover:underline"
          >
            View All
          </button>
        </div>
        {nextAppointment ? (
          <div className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-navy">
                    {nextAppointment.serviceName}
                  </h3>
                  <StatusBadge status={nextAppointment.status} />
                </div>
                <p className="text-sm text-muted">
                  {nextAppointment.dentistName}
                </p>
                <p className="mt-1 text-sm font-semibold text-navy">
                  {formatAppointmentDate(nextAppointment.date)} ·{" "}
                  {nextAppointment.time}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {nextAppointment.duration} minutes · Ref #
                  {nextAppointment.reference}
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() =>
                  navigate("appointment-detail", {
                    appointmentId: nextAppointment.id,
                  })
                }
              >
                View Details
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-10 text-center">
            <h3 className="font-semibold text-navy">
              No upcoming appointments
            </h3>
            <p className="mx-auto mb-4 mt-1 max-w-sm text-sm text-muted">
              Choose a service and request a convenient time with one of our
              dentists.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("book-category", { freshBooking: true })}
            >
              Book Now
            </Button>
          </div>
        )}
      </section>

      <section
        aria-labelledby="recent-activity-heading"
        className="rounded-2xl border border-border bg-white p-5 sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-activity-heading" className="font-bold text-navy">
            Recent Activity
          </h2>
          <button
            onClick={() => navigate("my-appointments")}
            className="text-sm font-medium text-blue hover:underline"
          >
            All Appointments
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="py-4 text-sm text-muted">
            No appointment activity yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((appointment) => (
              <button
                key={appointment.id}
                onClick={() =>
                  navigate("appointment-detail", {
                    appointmentId: appointment.id,
                  })
                }
                className="flex w-full items-center gap-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">
                    {appointment.serviceName}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {formatAppointmentDate(appointment.date)} ·{" "}
                    {appointment.time} · {appointment.dentistName}
                  </p>
                </div>
                <StatusBadge status={appointment.status} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Services ─────────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onClick,
}: {
  service: Service
  onClick: () => void
}) {
  const isBracesInstall = service.id === "braces-install"

  if (isBracesInstall) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative bg-navy border border-navy rounded-xl p-5 cursor-pointer group overflow-hidden flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
      >
        {/* subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue/20 to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between mb-3">
            <DentalServiceIcon
              serviceId={service.id}
              className="h-8 w-8 text-blue-300"
            />
            <span className="text-xs font-semibold bg-white/10 text-white/80 px-2 py-1 rounded-md">
              {service.duration} min
            </span>
          </div>
          <h3 className="font-bold text-white mb-1">{service.name}</h3>
          <p className="text-xs text-white/60 mb-2">
            Both upper &amp; lower arches
          </p>
          <p className="text-2xl font-bold text-white mb-1">
            ₱{service.price.toLocaleString()}
          </p>
          <p className="text-xs text-white/50 mb-3">Estimated starting price</p>
          <p className="text-xs text-white/70 leading-relaxed line-clamp-2">
            {service.description}
          </p>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-white/50">
              Consultation required first
            </span>
            <span className="text-xs font-semibold text-blue-300 group-hover:underline">
              Book Consultation →
            </span>
          </div>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white border border-border rounded-xl p-5 hover:border-blue/40 hover:shadow-sm transition-all cursor-pointer group flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-blue">
          <DentalServiceIcon serviceId={service.id} />
        </span>
        <span className="text-xs font-semibold text-muted bg-surface-2 px-2 py-1 rounded-md">
          {service.duration} min
        </span>
      </div>
      <h3 className="font-semibold text-navy mb-1 text-sm">{service.name}</h3>
      <p className="text-base font-bold text-navy mb-2">
        ₱{service.price.toLocaleString()}
      </p>
      <p className="text-xs text-muted leading-relaxed flex-1 line-clamp-2">
        {service.description}
      </p>
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted">
          {service.id === "braces-combo"
            ? "Book Appointment"
            : "View details & book"}
        </span>
        <span className="text-xs font-semibold text-blue group-hover:underline">
          Select →
        </span>
      </div>
    </button>
  )
}

export function ServicesScreen({ navigate }: Props) {
  const { services: allServices, loading, error } = useCatalog()
  const groupedServices = groupServices(allServices)
  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Dental Services</h1>
          <p className="text-sm text-muted mt-1">
            Browse all available treatments and book your appointment.
          </p>
        </div>
      </div>

      {/* Price disclaimer */}
      <div className="flex items-start gap-2.5 bg-blue-tint border border-blue/20 rounded-xl px-4 py-3 mb-7 text-xs text-navy/70">
        <svg
          className="w-4 h-4 text-blue flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 16 16"
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 5v4M8 10.5h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span>
          Prices listed are estimates for reference. Actual fees are subject to
          dental examination and individual treatment requirements. Final
          charges will be confirmed by your dentist.
        </span>
      </div>

      {/* Grouped service sections */}
      {groupedServices.length === 0 && (
        <p role="status" className="py-10 text-center text-sm text-muted">
          {loading
            ? "Loading services…"
            : error
              ? "Services could not be loaded. Use Retry in the message below."
              : "No services are available right now."}
        </p>
      )}
      <div className="space-y-8">
        {groupedServices.map(({ category, ids }) => {
          const services = ids
            .map((id) => allServices.find((s) => s.id === id))
            .filter(Boolean) as Service[]
          return (
            <div key={category}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-bold text-navy uppercase tracking-wider">
                  {category}
                </h2>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map((s) => (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    onClick={() =>
                      navigate("service-detail", { serviceId: s.id })
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Service Detail ───────────────────────────────────────────────────────────

function CheckItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted">
      <div className="mt-0.5 w-5 h-5 rounded-full bg-blue-tint flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-blue" fill="none" viewBox="0 0 12 12">
          <path
            d="M2.5 6l2.5 2.5L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {text}
    </li>
  )
}

export function ServiceDetailScreen({ navigate, params }: Props) {
  const { getService, loading: catalogLoading } = useCatalog()
  const service = getService(params?.serviceId)
  if (!service) {
    return (
      <div>
        <button
          onClick={() => navigate("services")}
          className="mb-6 text-sm font-medium text-blue hover:underline"
        >
          ← Back to Services
        </button>
        <EmptyState
          icon="—"
          title={catalogLoading ? "Loading service…" : "Service not found"}
          description={
            catalogLoading ? "" : "This service could not be loaded."
          }
        />
      </div>
    )
  }
  const isBracesInstall = service.id === "braces-install"
  const ctaLabel = isBracesInstall
    ? "Book Consultation"
    : service.id === "braces-combo"
      ? "Book Appointment"
      : "Book Appointment"
  const conciseDescription = `${service.description.split(". ")[0].replace(/[.—]$/, "")}.`
  const treatmentHighlights = service.involves.slice(0, 3)

  return (
    <div className="mx-auto w-full max-w-4xl">
      <button
        onClick={() => navigate("services")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-navy mb-6 transition-colors"
      >
        {icons.arrowLeft} Back to Services
      </button>

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {/* Header band */}
        <div
          className={`px-6 pb-6 pt-7 sm:px-8 sm:pt-8 ${
            isBracesInstall ? "bg-navy" : ""
          }`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className={isBracesInstall ? "text-blue-300" : "text-blue"}>
              <DentalServiceIcon serviceId={service.id} className="h-12 w-12" />
            </div>
            <div className="flex-1">
              <h1
                className={`text-2xl font-bold mb-1 ${
                  isBracesInstall ? "text-white" : "text-navy"
                }`}
              >
                {service.name}
              </h1>
              {isBracesInstall && (
                <p className="text-sm text-white/60 mb-2">
                  Both upper &amp; lower arches · Conventional metal braces
                </p>
              )}
              <p
                className={`text-sm mb-1 ${
                  isBracesInstall ? "text-white/60" : "text-muted"
                }`}
              >
                {service.duration} min session
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <p
                  className={`text-3xl font-bold ${
                    isBracesInstall ? "text-white" : "text-navy"
                  }`}
                >
                  ₱{service.price.toLocaleString()}
                </p>
                {isBracesInstall && (
                  <span className="text-xs text-white/50">
                    estimated starting price
                  </span>
                )}
              </div>
              {isBracesInstall && (
                <p className="text-xs text-amber-300 mt-1.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
                    <circle
                      cx="7"
                      cy="7"
                      r="5.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M7 4.5v3M7 9h.01"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                  Final fee may vary depending on treatment needs and dentist
                  assessment.
                </p>
              )}
              {service.id === "braces-combo" && (
                <p className="text-xs text-muted mt-1.5">
                  Fee may vary depending on treatment plan.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-7 sm:px-8">
          <p className="mb-6 max-w-3xl text-base leading-relaxed text-muted">
            {conciseDescription}
          </p>

          <div className="mb-6">
            <h2 className="font-semibold text-navy mb-3">
              What this treatment includes
            </h2>
            <ul className="space-y-2">
              {treatmentHighlights.map((item, i) => (
                <CheckItem key={i} text={item} />
              ))}
            </ul>
          </div>

          {/* Additional fees note for braces install */}
          {isBracesInstall && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-amber-800 text-sm mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                  <path
                    d="M8 2L14 13H2L8 2z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 6v3M8 10.5h.01"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
                Possible Additional Fees
              </h3>
              <ul className="grid gap-1.5 text-xs text-amber-700 sm:grid-cols-2">
                {[
                  "Dental X-rays or panoramic imaging (if not yet taken)",
                  "Tooth extractions required prior to braces",
                  "Fillings or restorations needed before installation",
                  "Final retainer after braces removal (quoted separately)",
                ].map((note, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-surface rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-navy text-sm mb-2">
              {isBracesInstall
                ? "Before Your Appointment"
                : "Preparation Notes"}
            </h3>
            <p className="text-sm text-muted leading-relaxed">
              {service.preparation}
            </p>
          </div>

          {/* Dentist note for braces */}
          {(isBracesInstall ||
            service.id === "braces-combo" ||
            service.id === "retainer") && (
            <div className="bg-surface rounded-xl p-4 mb-6">
              <div>
                <p className="text-xs font-semibold text-navy">
                  Orthodontic care is provided by Dr. Adrian Reyes
                </p>
                <p className="text-xs text-teal">
                  Orthodontics Specialist · 6 years experience
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Available Mon, Wed, Fri, Sat
                </p>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() =>
              navigate("book-service", { preselectedServiceId: service.id })
            }
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Dentists ─────────────────────────────────────────────────────────────────

export function DentistsScreen({ navigate, dentists, availability }: Props) {
  return (
    <div>
      <PageHeader
        title="Our Dentists"
        description="Meet our experienced team of dental professionals."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {dentists.map((d) => (
          <article
            key={d.id}
            className="bg-white border border-border rounded-xl p-6"
          >
            <div className="flex gap-5 mb-4">
              <ProfileAvatar
                photo={d.photo}
                initials={d.name
                  .split(" ")
                  .slice(1)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
                className="h-20 w-20 flex-shrink-0 text-lg"
              />
              <div>
                <h3 className="font-bold text-navy text-lg">{d.name}</h3>
                <p className="text-sm font-medium text-teal mb-1">
                  {d.specialty}
                </p>
                <p className="text-xs text-muted">
                  {d.experience} years of experience
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted mb-4">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
                <rect
                  x="2"
                  y="3"
                  width="10"
                  height="10"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M5 2v2M9 2v2M2 7h10"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Available:{" "}
              {(availability[d.id] ?? [])
                .filter((day) => day.available)
                .map((day) => day.day.slice(0, 3))
                .join(", ") || "No weekly hours set"}
            </div>
            <div className="flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("dentist-profile", { dentistId: d.id })}
              >
                View Profile
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  navigate("book-category", { preselectedDentistId: d.id })
                }
              >
                Book
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

// ─── Dentist Profile ──────────────────────────────────────────────────────────

export function DentistProfileScreen({
  navigate,
  params,
  dentists,
  availability,
  blockedDates,
}: Props) {
  const dentist = dentists.find((d) => d.id === params?.dentistId)
  if (!dentist) {
    return (
      <div>
        <button
          onClick={() => navigate("dentists")}
          className="mb-6 text-sm font-medium text-blue hover:underline"
        >
          ← Back to Dentists
        </button>
        <EmptyState
          icon="—"
          title="Dentist not found"
          description="This dentist profile could not be loaded."
        />
      </div>
    )
  }
  const liveSchedule = availability[dentist.id] ?? []
  const conciseBio = `${dentist.bio
    .split(". ")
    .slice(0, 2)
    .join(". ")
    .replace(/\.$/, "")}.`
  return (
    <div className="mx-auto w-full max-w-4xl">
      <button
        onClick={() => navigate("dentists")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-navy mb-6 transition-colors"
      >
        {icons.arrowLeft} Back to Dentists
      </button>

      <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
        <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-center">
          <ProfileAvatar
            photo={dentist.photo}
            initials={dentist.name
              .split(" ")
              .slice(1)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)}
            className="h-32 w-32 flex-shrink-0 text-2xl"
          />
          <div>
            <h1 className="text-2xl font-bold text-navy">
              {dentist.name}, {dentist.title}
            </h1>
            <p className="text-teal font-medium mb-2">{dentist.specialty}</p>
            <p className="text-sm text-muted">
              {dentist.experience} years of experience
            </p>
          </div>
        </div>

        <p className="mb-7 max-w-3xl text-base leading-relaxed text-muted">
          {conciseBio}
        </p>

        <div className="mb-7 grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl bg-surface p-5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Current Weekly Schedule
            </p>
            <div className="space-y-1.5">
              {liveSchedule
                .filter((day) => day.available)
                .map((day) => (
                  <div
                    key={day.day}
                    className="flex justify-between gap-4 text-sm"
                  >
                    <span className="text-navy">{day.day}</span>
                    <span className="text-muted">
                      {day.start}–{day.end}
                      {day.breakStart && day.breakEnd
                        ? ` · Break ${day.breakStart}–${day.breakEnd}`
                        : ""}
                    </span>
                  </div>
                ))}
              {!liveSchedule.some((day) => day.available) && (
                <p className="text-sm text-muted">
                  No weekly availability is currently set.
                </p>
              )}
              {(blockedDates[dentist.id] ?? []).length > 0 && (
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                  Unavailable dates: {blockedDates[dentist.id].join(", ")}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Services Offered
            </p>
            <div className="flex flex-wrap gap-2">
              {dentist.services.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-blue-tint px-3 py-1.5 text-xs font-medium text-blue"
                >
                  {s}
                </span>
              ))}
            </div>
          </section>
        </div>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={() =>
            navigate("book-service", { preselectedDentistId: dentist.id })
          }
        >
          Book an Appointment with {dentist.name.split(" ")[1]}
        </Button>
      </div>
    </div>
  )
}

// ─── My Appointments ──────────────────────────────────────────────────────────

type AptTab = "All" | AppointmentStatus

export function MyAppointmentsScreen({
  navigate,
  appointments,
  params,
}: Props) {
  const initialTab: AptTab = params?.tab ?? "All"
  const [tab, setTab] = useState<AptTab>(initialTab)

  const tabs: AptTab[] = [
    "All",
    "Pending",
    "Confirmed",
    "Completed",
    "Cancelled",
    "Declined",
  ]
  const sorted = [...appointments].sort(
    (a, b) => appointmentTimestamp(b) - appointmentTimestamp(a),
  )
  const filtered =
    tab === "All"
      ? sorted
      : sorted.filter((appointment) => appointment.status === tab)

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <PageHeader
          title="My Appointments"
          description="View and manage all your dental appointments."
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate("book-category", { freshBooking: true })}
        >
          + Book New
        </Button>
      </div>

      <div className="flex max-w-full flex-wrap gap-1 bg-surface-2 rounded-xl p-1 w-fit mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-white text-navy shadow-sm"
                : "text-muted hover:text-navy"
            }`}
          >
            {t}
            <span
              className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                tab === t ? "bg-blue text-white" : "bg-white text-muted"
              }`}
            >
              {t === "All"
                ? appointments.length
                : appointments.filter((appointment) => appointment.status === t)
                    .length}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon="—"
            title={`No ${tab === "All" ? "" : tab.toLowerCase()} appointments`}
            description="Appointments matching this filter will appear here."
          />
        ) : (
          filtered.map((apt) => (
            <div
              key={apt.id}
              className="bg-white border border-border rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap hover:border-blue/20 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-tint flex items-center justify-center text-blue flex-shrink-0">
                  <DentalServiceIcon
                    serviceId={apt.serviceId}
                    className="h-6 w-6"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="font-semibold text-navy text-sm">
                      {apt.serviceName}
                    </p>
                    <StatusBadge status={apt.status} />
                  </div>
                  <p className="text-xs text-muted">
                    {apt.dentistName} · {formatAppointmentDate(apt.date)} ·{" "}
                    {apt.time}
                  </p>
                  <p className="text-xs text-muted">
                    ₱{apt.price.toLocaleString()} · {apt.duration} min
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigate("appointment-detail", { appointmentId: apt.id })
                  }
                >
                  View
                </Button>
                {(apt.status === "Pending" || apt.status === "Confirmed") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-red-50"
                    onClick={() =>
                      navigate("appointment-detail", {
                        appointmentId: apt.id,
                        showCancel: true,
                      })
                    }
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Appointment Detail ───────────────────────────────────────────────────────

export function AppointmentDetailScreen({
  navigate,
  appointments,
  onCancelAppointment,
  onRescheduleAppointment,
  params,
}: Props) {
  const apt = appointments.find((a) => a.id === params?.appointmentId)
  const [cancelOpen, setCancelOpen] = useState(params?.showCancel ?? false)
  const [cancelled, setCancelled] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  if (!apt) {
    return (
      <div>
        <button
          onClick={() => navigate("my-appointments")}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-navy mb-6 transition-colors"
        >
          {icons.arrowLeft} Back to Appointments
        </button>
        <EmptyState
          icon="📋"
          title="Appointment not found"
          description="This appointment could not be loaded."
        />
      </div>
    )
  }

  if (cancelled) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="bg-white border border-border rounded-2xl p-10">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-8 h-8 text-danger"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-navy mb-2">
            Appointment Cancelled
          </h2>
          <p className="text-sm text-muted mb-6">
            Your appointment has been successfully cancelled.
          </p>
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate("my-appointments", { tab: "Cancelled" })}
          >
            Back to Appointments
          </Button>
        </div>
      </div>
    )
  }

  const canCancel = apt.status === "Pending" || apt.status === "Confirmed"

  const rows: [string, string][] = [
    ["Service", apt.serviceName],
    ["Dentist", apt.dentistName],
    ["Date", formatAppointmentDate(apt.date)],
    ["Time", apt.time],
    ["Duration", `${apt.duration} minutes`],
    ["Price", `₱${apt.price.toLocaleString()}`],
  ]
  if (apt.status === "Declined" && apt.declineReason) {
    rows.push(["Decline Reason", apt.declineReason])
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <button
        onClick={() => navigate("my-appointments")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-navy mb-6 transition-colors"
      >
        {icons.arrowLeft} Back to Appointments
      </button>

      <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy mb-1">
              Appointment Details
            </h1>
            <p className="text-sm text-muted">Reference #{apt.reference}</p>
          </div>
          <StatusBadge status={apt.status} />
        </div>

        <div className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex py-3">
              <dt className="w-28 text-xs font-semibold text-muted uppercase tracking-wide pt-0.5">
                {k}
              </dt>
              <dd className="flex-1 text-sm text-navy font-medium">{v}</dd>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          {canCancel && (
            <Button
              variant="secondary"
              onClick={() => onRescheduleAppointment(apt)}
            >
              Reschedule
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              Cancel Appointment
            </Button>
          )}
        </div>
      </div>

      {cancelOpen && (
        <ConfirmDialog
          title="Cancel Appointment?"
          message="This appointment will be cancelled and cannot be undone."
          confirmLabel="Cancel Appointment"
          cancelLabel="Keep Appointment"
          dangerous
          busy={cancelBusy}
          error={cancelError}
          onConfirm={async () => {
            if (cancelBusy) return
            setCancelBusy(true)
            setCancelError(null)
            const failure = await onCancelAppointment(apt.id)
            setCancelBusy(false)
            if (failure) {
              setCancelError(failure)
              return
            }
            setCancelOpen(false)
            setCancelled(true)
          }}
          onCancel={() => {
            if (cancelBusy) return
            setCancelError(null)
            setCancelOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export function ProfileScreen({ navigate, profile }: Props) {
  const initials = profile.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">My Profile</h1>
          <p className="mt-1 text-sm text-muted">
            Review the personal information used for your appointments.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate("edit-profile")}>
          Edit Profile
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
        <div className="mb-7 flex items-center gap-4 border-b border-border pb-6">
          <ProfileAvatar
            photo={profile.photoDataUrl}
            initials={initials}
            className="h-16 w-16 text-xl"
          />
          <div>
            <h2 className="text-lg font-bold text-navy">{profile.name}</h2>
            <p className="text-sm text-muted">LouDent Patient</p>
          </div>
        </div>
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
              Full Name
            </dt>
            <dd className="mt-1 text-sm font-medium text-navy">
              {profile.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
              Email Address
            </dt>
            <dd className="mt-1 text-sm font-medium text-navy">
              {profile.email}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
              Phone Number
            </dt>
            <dd className="mt-1 text-sm font-medium text-navy">
              {profile.phone}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

// ─── Edit Profile ─────────────────────────────────────────────────────────────

export function EditProfileScreen({
  navigate,
  profile,
  onUpdateProfile,
}: Props) {
  const [form, setForm] = useState({
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    photoDataUrl: profile.photoDataUrl,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = "Full name is required."
    if (form.phone.length < 7) e.phone = "Enter a valid phone number."
    return e
  }

  const handleSave = async () => {
    if (saving) return
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length === 0) {
      setSaving(true)
      setSaved(false)
      const saveError = await onUpdateProfile(form)
      setSaving(false)
      if (saveError) {
        setErrors({ save: saveError })
      } else {
        setSaved(true)
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <button
        onClick={() => navigate("profile")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-navy mb-6 transition-colors"
      >
        {icons.arrowLeft} Back to Profile
      </button>

      <div className="bg-white border border-border rounded-2xl p-6 sm:p-8">
        <h1 className="text-xl font-bold text-navy mb-6">Edit Profile</h1>

        {saved && (
          <div className="mb-5">
            <SuccessToast message="Profile updated successfully." />
          </div>
        )}

        <div className="mb-6 flex justify-center">
          <ProfilePhotoControl
            photo={form.photoDataUrl}
            initials={form.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
            onChange={(photoDataUrl) =>
              setForm((current) => ({ ...current, photoDataUrl }))
            }
            disabled={saving}
            onProcessingChange={setPhotoProcessing}
          />
        </div>
        {errors.save && (
          <p role="alert" className="mb-4 text-center text-sm text-danger">
            {errors.save}
          </p>
        )}

        <div className="space-y-4">
          <Input
            label="Full Name"
            value={form.name}
            onChange={(v) => set("name", v)}
            error={errors.name}
            required
          />
          <div>
            <label className="block text-sm font-medium text-navy">
              Email Address
            </label>
            <div className="mt-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-muted">
              {form.email}
            </div>
            <p className="mt-1 text-xs text-muted">
              Your email address cannot be changed from the profile.
            </p>
          </div>
          <Input
            label="Phone Number"
            type="tel"
            value={form.phone}
            onChange={(v) => set("phone", v)}
            error={errors.phone}
            required
          />
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => navigate("profile")}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={saving || photoProcessing}
            onClick={handleSave}
          >
            {photoProcessing
              ? "Processing Photo…"
              : saving
                ? "Saving…"
                : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
