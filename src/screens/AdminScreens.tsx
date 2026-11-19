import { useEffect, useState } from "react"
import {
  Screen,
  Appointment,
  AppointmentStatus,
  WEEKLY_AVAILABILITY,
  AvailabilityDay,
  Dentist,
} from "../types"
import {
  Button,
  Card,
  StatusBadge,
  EmptyState,
  PageHeader,
  ProfileAvatar,
  ProfilePhotoControl,
  SuccessToast,
  ConfirmDialog,
  icons,
  formatAppointmentDate,
} from "../components/common"

interface Props {
  navigate: (screen: Screen, params?: any) => void
  params?: any
  adminAppointments: Appointment[]
  onUpdateAdminAppointment: (
    id: string,
    status: AppointmentStatus,
    declineReason?: string,
  ) => Promise<string | null>
  activeDentistId: string
  /** Clinic administrator (server-decided): may manage every dentist's appointments. */
  isClinicAdmin: boolean
  availability: Record<string, AvailabilityDay[]>
  blockedDates: Record<string, string[]>
  /** Saves weekly hours + blocked dates on the server. Resolves to an error message or null. */
  onSaveSchedule: (
    dentistId: string,
    days: AvailabilityDay[],
    blockedDates: string[],
  ) => Promise<string | null>
  dentists: Dentist[]
  onUpdateDentist: (dentist: Dentist) => Promise<string | null>
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export function AdminDashboard({
  navigate,
  adminAppointments,
  activeDentistId,
  isClinicAdmin,
  dentists,
}: Props) {
  const dentistName = (
    dentists.find((item) => item.id === activeDentistId)?.name ?? ""
  ).replace(/^Dr\.?\s+/i, "")
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  // The clinic administrator's dashboard covers every dentist's appointments.
  const personal = isClinicAdmin
    ? adminAppointments
    : adminAppointments.filter((a) => a.dentistId === activeDentistId)
  const today = personal
    .filter((a) => a.date === todayKey)
    .sort((a, b) => timeValue(a.time) - timeValue(b.time))
  const pending = personal.filter((a) => a.status === "Pending").length
  const completed = personal.filter((a) => a.status === "Completed").length

  const stats = [
    {
      label: "Today's Appointments",
      value: today.length,
      color: "text-navy",
      bg: "bg-blue-tint",
    },
    {
      label: "Pending Requests",
      value: pending,
      color: "text-warning",
      bg: "bg-amber-100",
    },
    {
      label: "Completed Appointments",
      value: completed,
      color: "text-success",
      bg: "bg-green-100",
    },
  ]

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-navy">
            Welcome, Dr. {dentistName}
          </h1>
          <p className="text-sm text-muted mt-1">
            Here is your personalized schedule and request overview.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="text-center">
            <div
              className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 ${s.bg}`}
            >
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            </div>
            <p className="text-xs font-medium text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Today's Schedule */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-navy">
            Today's Schedule
          </h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate("admin-appointments", { status: "Pending" })
            }
          >
            Review Requests →
          </Button>
        </div>
        <div className="space-y-2">
          {today.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-4 py-3 border-b border-border last:border-0"
            >
              <div className="w-16 text-xs font-semibold text-muted flex-shrink-0">
                {row.time}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-navy truncate">
                  {row.patientName}
                </p>
                <p className="text-xs text-muted truncate">{row.serviceName}</p>
              </div>
              <StatusBadge status={row.status} />
            </div>
          ))}
          {today.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              No appointments are scheduled for today.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function to24Hour(time: string) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time)
  if (!match) return "00:00"
  const hour = (Number(match[1]) % 12) + (match[3] === "PM" ? 12 : 0)
  return `${String(hour).padStart(2, "0")}:${match[2]}`
}

function timeValue(value: string) {
  const [clock, period] = value.split(" ")
  const [rawHour, minute] = clock.split(":").map(Number)
  return ((rawHour % 12) + (period === "PM" ? 12 : 0)) * 60 + minute
}

function formatDisplayDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(parsed)
}

// ─── Manage Appointments ──────────────────────────────────────────────────────

type StatusFilter = "All" | AppointmentStatus

export function ManageAppointmentsScreen({
  navigate,
  adminAppointments,
  activeDentistId,
  isClinicAdmin,
  params,
}: Props) {
  const [search, setSearch] = useState("")
  const statusFromNavigation = [
    "Pending",
    "Confirmed",
    "Completed",
    "Cancelled",
    "Declined",
  ].includes(params?.status)
    ? params.status as AppointmentStatus
    : "All"
  const [filter, setFilter] = useState<StatusFilter>(statusFromNavigation)
  const [scope, setScope] = useState<"mine" | "clinic">("mine")
  const [dateFilter, setDateFilter] = useState("")

  const filters: StatusFilter[] = [
    "All",
    "Pending",
    "Confirmed",
    "Completed",
    "Cancelled",
    "Declined",
  ]

  const filtered = adminAppointments.filter((a) => {
    const matchesScope = scope === "clinic" || a.dentistId === activeDentistId
    const matchesSearch =
      !search ||
      a.patientName.toLowerCase().includes(search.toLowerCase()) ||
      a.serviceName.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === "All" || a.status === filter
    const matchesDate = !dateFilter || a.date === dateFilter
    return matchesScope && matchesSearch && matchesFilter && matchesDate
  })

  return (
    <div>
      <PageHeader
        title="Manage Appointments"
        description="Review and update appointment statuses."
      />
      {isClinicAdmin && (
      <div className="mb-4 inline-flex rounded-xl bg-surface-2 p-1">
        {(["mine", "clinic"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setScope(item)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              scope === item ? "bg-white text-navy shadow-sm" : "text-muted"
            }`}
          >
            {item === "mine" ? "My Appointments" : "All Clinic Appointments"}
          </button>
        ))}
      </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {icons.search}
          </div>
          <input
            type="text"
            placeholder="Search patient or service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border text-sm text-navy placeholder-muted bg-white focus:outline-none focus:ring-2 focus:ring-blue focus:border-blue"
          />
        </div>
        <input
          aria-label="Filter by date"
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-navy"
        />
      </div>

      <div className="flex gap-1 bg-surface-2 rounded-xl p-1 w-fit mb-5 flex-wrap">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-white text-navy shadow-sm"
                : "text-muted hover:text-navy"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon="—"
            title="No appointments found"
            description="Try adjusting your search or filter."
          />
        ) : (
          filtered.map((apt) => (
            <div
              key={apt.id}
              className="bg-white border border-border rounded-xl p-4 flex items-center gap-4 flex-wrap hover:border-blue/20 transition-colors cursor-pointer"
              onClick={() =>
                navigate("admin-appointment-detail", { appointmentId: apt.id })
              }
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-semibold text-sm text-navy">
                    {apt.patientName}
                  </p>
                  <StatusBadge status={apt.status} />
                </div>
                <p className="text-xs text-muted">
                  {apt.serviceName} · {apt.dentistName}
                </p>
                <p className="text-xs text-muted">
                  {formatAppointmentDate(apt.date)} · {apt.time}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-navy">
                  ₱{apt.price.toLocaleString()}
                </span>
                <span className="text-muted">{icons.chevronRight}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Admin Appointment Detail ─────────────────────────────────────────────────

export function AdminAppointmentDetailScreen({
  navigate,
  adminAppointments,
  onUpdateAdminAppointment,
  activeDentistId,
  isClinicAdmin,
  params,
}: Props) {
  const apt = adminAppointments.find((a) => a.id === params?.appointmentId)
  const [confirmAction, setConfirmAction] =
    useState<null | "Confirmed" | "Declined" | "Completed" | "Cancelled">(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState("")
  const [declineMode, setDeclineMode] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (!apt) {
    return (
      <div>
        <button
          onClick={() => navigate("admin-appointments")}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-navy mb-6"
        >
          {icons.arrowLeft} Back
        </button>
        <EmptyState icon="—" title="Appointment not found" description="" />
      </div>
    )
  }

  // Status-aware actions (§9)
  // The server lets a dentist manage their own appointments, and lets the clinic administrator
  // manage everyone's. An appointment can only be completed once its start time has passed.
  const canManage = isClinicAdmin || apt.dentistId === activeDentistId
  const showConfirmReject = canManage && apt.status === "Pending"
  const showMarkCompleted = canManage && apt.status === "Confirmed"
  const startsAt = new Date(`${apt.date}T${to24Hour(apt.time)}:00+08:00`)
  const isFutureAppointment = startsAt.getTime() > Date.now()

  const actionLabels: Record<string, string> = {
    Confirmed: "appointment confirmed",
    Declined: "appointment declined",
    Completed: "appointment marked as completed",
    Cancelled: "appointment cancelled",
  }

  const handleAction = async (
    newStatus: "Confirmed" | "Declined" | "Completed" | "Cancelled",
  ) => {
    if (actionBusy) return
    setActionBusy(true)
    setActionError(null)
    const failure = await onUpdateAdminAppointment(
      apt.id,
      newStatus,
      newStatus === "Declined" ? declineReason.trim() || undefined : undefined,
    )
    setActionBusy(false)
    if (failure) {
      setActionError(failure)
      return
    }
    setConfirmAction(null)
    setDeclineMode(false)
    setSuccess(`Successfully — ${actionLabels[newStatus]}.`)
  }

  const rows: [string, string][] = [
    ["Patient", apt.patientName],
    ["Service", apt.serviceName],
    ["Dentist", apt.dentistName],
    ["Date", formatDisplayDate(apt.date)],
    ["Time", apt.time],
    ["Duration", `${apt.duration} minutes`],
    ["Price", `₱${apt.price.toLocaleString()}`],
  ]

  const dialogConfigs: Record<string, {
    title: string
    message: string
    label: string
    dangerous: boolean
  }> = {
    Confirmed: {
      title: "Confirm Appointment?",
      message:
        "This will confirm the appointment and update its status in the patient's portal.",
      label: "Confirm",
      dangerous: false,
    },
    Declined: {
      title: "Decline Appointment?",
      message: "This will decline the request and release the reserved time.",
      label: "Decline",
      dangerous: true,
    },
    Completed: {
      title: "Mark as Completed?",
      message: "This will mark the appointment as completed.",
      label: "Mark Completed",
      dangerous: false,
    },
    Cancelled: {
      title: "Cancel Confirmed Appointment?",
      message:
        "The appointment will remain in both portals with Cancelled status and its time will be released.",
      label: "Cancel Appointment",
      dangerous: true,
    },
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <button
        onClick={() => navigate("admin-appointments")}
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
            <p className="text-sm text-muted">Ref #{apt.reference}</p>
          </div>
          <StatusBadge status={apt.status} />
        </div>

        {success && (
          <div className="mb-5">
            <SuccessToast message={success} />
          </div>
        )}

        <div className="divide-y divide-border mb-6">
          {rows.map(([k, v]) => (
            <div key={k} className="flex py-3">
              <dt className="w-24 text-xs font-semibold text-muted uppercase tracking-wide pt-0.5">
                {k}
              </dt>
              <dd className="flex-1 text-sm text-navy font-medium">{v}</dd>
            </div>
          ))}
        </div>

        {/* Status-aware actions */}
        <div className="flex flex-wrap gap-3">
          {showConfirmReject && !declineMode && (
            <>
              <Button
                variant="destructive"
                onClick={() => setDeclineMode(true)}
              >
                Decline
              </Button>
              <Button
                variant="primary"
                onClick={() => setConfirmAction("Confirmed")}
              >
                Confirm
              </Button>
            </>
          )}
          {showMarkCompleted && (
            <>
              <Button
                variant="destructive"
                onClick={() => setConfirmAction("Cancelled")}
              >
                Cancel Appointment
              </Button>
              <Button
                variant="primary"
                disabled={isFutureAppointment}
                onClick={() => setConfirmAction("Completed")}
              >
                Mark Completed
              </Button>
            </>
          )}
        </div>
        {showMarkCompleted && isFutureAppointment && (
          <p className="mt-3 text-xs text-muted">
            An appointment can be marked completed once its time has passed.
          </p>
        )}
        {!canManage && (
          <p className="mt-3 text-xs text-muted">
            This appointment belongs to {apt.dentistName}. Only the assigned
            dentist or the clinic administrator can change its status.
          </p>
        )}
        {actionError && !confirmAction && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {actionError}
          </p>
        )}
        {showConfirmReject && declineMode && (
          <div className="mt-5 rounded-xl border border-border bg-surface p-4">
            <label
              className="mb-1.5 block text-xs font-semibold text-muted"
              htmlFor="decline-reason"
            >
              Optional decline reason
            </label>
            <textarea
              id="decline-reason"
              rows={2}
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              placeholder="Briefly explain why this time cannot be accepted"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm text-navy"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => setConfirmAction("Declined")}
              >
                Continue to Decline
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDeclineMode(false)
                  setDeclineReason("")
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {!showConfirmReject &&
          !showMarkCompleted &&
          apt.status !== "Pending" && (
            <p className="text-xs text-muted mt-3">
              No status actions available for this appointment.
            </p>
          )}
      </div>

      {confirmAction && (
        <ConfirmDialog
          title={dialogConfigs[confirmAction].title}
          message={dialogConfigs[confirmAction].message}
          confirmLabel={dialogConfigs[confirmAction].label}
          cancelLabel="Cancel"
          dangerous={dialogConfigs[confirmAction].dangerous}
          busy={actionBusy}
          error={actionError}
          onConfirm={() => handleAction(confirmAction)}
          onCancel={() => {
            if (actionBusy) return
            setActionError(null)
            setConfirmAction(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Manage Availability ──────────────────────────────────────────────────────

export function ManageAvailabilityScreen({
  activeDentistId,
  availability: allAvailability,
  blockedDates: allBlockedDates,
  onSaveSchedule,
}: Props) {
  const originalAvailability =
    allAvailability[activeDentistId] ?? WEEKLY_AVAILABILITY
  const [availability, setAvailability] =
    useState<AvailabilityDay[]>(originalAvailability)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [blockedDates, setBlockedDates] = useState(
    allBlockedDates[activeDentistId] ?? [],
  )
  const [newBlockedDate, setNewBlockedDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] =
    useState<Record<string, string>>({})

  // While not editing, always show what the server currently has (other tabs/browsers may change it).
  const serverAvailability = allAvailability[activeDentistId]
  const serverBlocked = allBlockedDates[activeDentistId]
  useEffect(() => {
    if (editing) return
    setAvailability(serverAvailability ?? WEEKLY_AVAILABILITY)
    setBlockedDates(serverBlocked ?? [])
  }, [editing, serverAvailability, serverBlocked])

  const toggle = (day: string) => {
    setAvailability((prev) =>
      prev.map((d) => (d.day === day ? { ...d, available: !d.available } : d)),
    )
    setValidationErrors((current) => {
      const next = { ...current }
      delete next[day]
      return next
    })
  }

  const updateTime = (
    day: string,
    field: "start" | "end" | "breakStart" | "breakEnd",
    value: string,
  ) => {
    setAvailability((prev) =>
      prev.map((d) =>
        d.day === day
          ? field === "breakStart" && !value
            ? { ...d, breakStart: "", breakEnd: "" }
            : { ...d, [field]: value }
          : d,
      ),
    )
    setValidationErrors((current) => {
      const next = { ...current }
      delete next[day]
      return next
    })
  }

  const toggleBreak = (day: string, enabled: boolean) => {
    setAvailability((current) =>
      current.map((item) =>
        item.day === day
          ? {
              ...item,
              breakStart: enabled ? item.breakStart || "12:00 PM" : "",
              breakEnd: enabled ? item.breakEnd || "1:00 PM" : "",
            }
          : item,
      ),
    )
    setValidationErrors((current) => {
      const next = { ...current }
      delete next[day]
      return next
    })
  }

  const handleSave = async () => {
    if (saving) return
    const errors: Record<string, string> = {}
    availability.forEach((day) => {
      if (!day.available) return
      const shiftStart = timeValue(day.start)
      const shiftEnd = timeValue(day.end)
      if (shiftStart >= shiftEnd) {
        errors[day.day] = "Start time must be earlier than end time."
        return
      }
      const hasBreakStart = Boolean(day.breakStart)
      const hasBreakEnd = Boolean(day.breakEnd)
      if (hasBreakStart !== hasBreakEnd) {
        errors[day.day] = "Choose both a break start and break end."
        return
      }
      if (day.breakStart && day.breakEnd) {
        const breakStart = timeValue(day.breakStart)
        const breakEnd = timeValue(day.breakEnd)
        if (breakStart >= breakEnd) {
          errors[day.day] = "Break start must be earlier than break end."
        } else if (breakStart < shiftStart || breakEnd > shiftEnd) {
          errors[day.day] = "The break must fall within working hours."
        }
      }
    })
    setValidationErrors(errors)
    if (Object.keys(errors).length > 0) {
      setSaveError(null)
      setSaved(false)
      return
    }
    // The server is authoritative: it refuses hours or blocked dates that would strand an
    // existing Pending or Confirmed appointment and explains which one.
    setSaving(true)
    setSaveError(null)
    const failure = await onSaveSchedule(
      activeDentistId,
      availability,
      blockedDates,
    )
    setSaving(false)
    if (failure) {
      setSaveError(failure)
      return
    }
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 4000)
  }

  const timeOptions = [
    "7:00 AM",
    "8:00 AM",
    "9:00 AM",
    "10:00 AM",
    "11:00 AM",
    "12:00 PM",
    "1:00 PM",
    "2:00 PM",
    "3:00 PM",
    "4:00 PM",
    "5:00 PM",
    "6:00 PM",
  ]

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <PageHeader
          title="Manage Availability"
          description="Set your weekly working schedule."
        />
        {!editing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
          >
            {icons.edit} Edit Schedule
          </Button>
        )}
      </div>

      {saved && (
        <div className="mb-5">
          <SuccessToast message="Availability saved successfully." />
        </div>
      )}
      {saveError && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
        >
          {saveError}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {availability.map((day, index) => {
          const breakEnabled = Boolean(day.breakStart || day.breakEnd)
          return (
            <div
              key={day.day}
              className={`px-5 py-5 sm:px-6 ${
                index < availability.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="grid gap-4 md:grid-cols-[150px_1fr] md:items-start">
                <div className="flex min-h-10 items-center gap-3">
                  {editing ? (
                    <button
                      type="button"
                      aria-label={`${
                        day.available ? "Disable" : "Enable"
                      } ${day.day}`}
                      aria-pressed={day.available}
                      onClick={() => toggle(day.day)}
                      className={`relative inline-flex h-6 w-10 flex-shrink-0 items-center rounded-full transition-colors ${
                        day.available ? "bg-blue" : "bg-surface-2"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          day.available ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  ) : (
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        day.available
                          ? "bg-success"
                          : "border border-border bg-surface-2"
                      }`}
                    />
                  )}
                  <span className="text-sm font-semibold text-navy">
                    {day.day}
                  </span>
                </div>

                {!day.available ? (
                  <p className="py-2 text-sm italic text-muted">Unavailable</p>
                ) : editing ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-muted">
                        Shift starts
                        <select
                          aria-label={`${day.day} shift start`}
                          value={day.start}
                          onChange={(event) =>
                            updateTime(day.day, "start", event.target.value)
                          }
                          className="mt-1.5 w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-medium text-navy focus:outline-none focus:ring-2 focus:ring-blue/30"
                        >
                          {timeOptions.map((time) => (
                            <option key={time}>{time}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-muted">
                        Shift ends
                        <select
                          aria-label={`${day.day} shift end`}
                          value={day.end}
                          onChange={(event) =>
                            updateTime(day.day, "end", event.target.value)
                          }
                          className="mt-1.5 w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-medium text-navy focus:outline-none focus:ring-2 focus:ring-blue/30"
                        >
                          {timeOptions.map((time) => (
                            <option key={time}>{time}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {breakEnabled ? (
                      <div className="rounded-xl bg-surface p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-navy">
                            Break time
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleBreak(day.day, false)}
                            className="text-xs font-medium text-danger hover:underline"
                          >
                            Remove break
                          </button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-muted">
                            Break starts
                            <select
                              aria-label={`${day.day} break start`}
                              value={day.breakStart ?? ""}
                              onChange={(event) =>
                                updateTime(
                                  day.day,
                                  "breakStart",
                                  event.target.value,
                                )
                              }
                              className="mt-1.5 w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-medium text-navy"
                            >
                              {timeOptions.map((time) => (
                                <option key={time}>{time}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs font-semibold text-muted">
                            Break ends
                            <select
                              aria-label={`${day.day} break end`}
                              value={day.breakEnd ?? ""}
                              onChange={(event) =>
                                updateTime(
                                  day.day,
                                  "breakEnd",
                                  event.target.value,
                                )
                              }
                              className="mt-1.5 w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-medium text-navy"
                            >
                              {timeOptions.map((time) => (
                                <option key={time}>{time}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleBreak(day.day, true)}
                        className="text-sm font-medium text-blue hover:underline"
                      >
                        + Add break time
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-surface px-4 py-3 text-sm text-navy">
                    <span className="font-medium">
                      {day.start}–{day.end}
                    </span>
                    {day.breakStart && day.breakEnd && (
                      <span className="ml-2 text-muted">
                        · Break {day.breakStart}–{day.breakEnd}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {validationErrors[day.day] && (
                <p
                  role="alert"
                  className="mt-3 text-xs text-danger md:ml-[166px]"
                >
                  {validationErrors[day.day]}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-semibold text-navy">Unavailable Dates</h2>
        <p className="mb-4 mt-1 text-xs text-muted">
          Block leave days or clinic closures without changing your weekly
          schedule.
        </p>
        {editing && (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <input
              aria-label="Date to block"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={newBlockedDate}
              onChange={(event) => setNewBlockedDate(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm text-navy"
            />
            <Button
              variant="secondary"
              disabled={
                !newBlockedDate || blockedDates.includes(newBlockedDate)
              }
              onClick={() => {
                setBlockedDates((dates) => [...dates, newBlockedDate].sort())
                setNewBlockedDate("")
              }}
            >
              Block Date
            </Button>
          </div>
        )}
        {blockedDates.length === 0 ? (
          <p className="text-sm text-muted">No specific dates are blocked.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blockedDates.map((date) => (
              <span
                key={date}
                className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs text-navy"
              >
                {date}
                {editing && (
                  <button
                    aria-label={`Remove blocked date ${date}`}
                    onClick={() =>
                      setBlockedDates((dates) =>
                        dates.filter((item) => item !== date),
                      )
                    }
                    className="text-danger"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setEditing(false)
              setAvailability(originalAvailability)
              setBlockedDates(allBlockedDates[activeDentistId] ?? [])
              setSaveError(null)
              setValidationErrors({})
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  )
}

export function DentistPortalProfile({
  activeDentistId,
  navigate,
  dentists,
  onUpdateDentist,
  availability,
  blockedDates,
}: Props) {
  const dentist =
    dentists.find((item) => item.id === activeDentistId) ?? dentists[0]
  const liveSchedule = availability[activeDentistId] ?? []
  const dentistBlockedDates = blockedDates[activeDentistId] ?? []
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [form, setForm] = useState({
    specialty: dentist.specialty,
    bio: dentist.bio,
    photo: dentist.photo,
  })
  const saveProfile = async () => {
    if (saving) return
    if (!form.specialty.trim() || !form.bio.trim()) {
      setSaveError("Specialty and biography are required.")
      return
    }
    setSaving(true)
    setSaveError(null)
    const error = await onUpdateDentist({ ...dentist, ...form })
    setSaving(false)
    if (error) {
      setSaveError(error)
      return
    }
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }
  return (
    <div>
      <PageHeader
        title="My Professional Profile"
        description="This information is shown to patients when they choose a dentist."
      />
      {saved && (
        <div className="mb-5">
          <SuccessToast message="Professional profile updated." />
        </div>
      )}
      {saveError && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
        >
          {saveError}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="text-center">
          <div className="mb-4 flex justify-center">
            {editing ? (
              <ProfilePhotoControl
                photo={form.photo}
                initials={dentist.name
                  .split(" ")
                  .slice(1)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
                onChange={(photo) =>
                  setForm((current) => ({ ...current, photo: photo ?? "" }))
                }
                disabled={saving}
                onProcessingChange={setPhotoProcessing}
              />
            ) : (
              <ProfileAvatar
                photo={dentist.photo}
                initials={dentist.name
                  .split(" ")
                  .slice(1)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
                className="h-28 w-28 text-xl"
              />
            )}
          </div>
          <h2 className="font-bold text-navy">
            {dentist.name}, {dentist.title}
          </h2>
          {editing ? (
            <input
              aria-label="Specialty"
              value={form.specialty}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  specialty: event.target.value,
                }))
              }
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm text-navy"
            />
          ) : (
            <p className="mt-1 text-sm font-medium text-teal">
              {dentist.specialty}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {dentist.experience} years of experience
          </p>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold text-navy">About</h2>
          {editing ? (
            <textarea
              aria-label="Professional biography"
              rows={7}
              value={form.bio}
              onChange={(event) =>
                setForm((current) => ({ ...current, bio: event.target.value }))
              }
              className="w-full rounded-xl border border-border px-3 py-2 text-sm text-navy"
            />
          ) : (
            <p className="text-sm leading-relaxed text-muted">{dentist.bio}</p>
          )}
          <h3 className="mb-3 mt-6 text-xs font-bold uppercase tracking-wider text-muted">
            Services Offered
          </h3>
          <div className="flex flex-wrap gap-2">
            {dentist.services.map((service) => (
              <span
                key={service}
                className="rounded-full bg-blue-tint px-3 py-1 text-xs font-medium text-blue"
              >
                {service}
              </span>
            ))}
          </div>
          <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-muted">
            Regular Schedule
          </h3>
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
              <p className="text-sm text-muted">No weekly schedule is set.</p>
            )}
            {dentistBlockedDates.length > 0 && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                Unavailable dates: {dentistBlockedDates.join(", ")}
              </p>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {editing ? (
              <>
                <Button
                  variant="primary"
                  disabled={saving || photoProcessing}
                  onClick={saveProfile}
                >
                  {photoProcessing
                    ? "Processing Photo…"
                    : saving
                      ? "Saving…"
                      : "Save Profile"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(false)
                    setSaveError(null)
                    setForm({
                      specialty: dentist.specialty,
                      bio: dentist.bio,
                      photo: dentist.photo,
                    })
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setEditing(true)}>
                Edit Profile
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => navigate("admin-availability")}
            >
              Manage Availability
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
