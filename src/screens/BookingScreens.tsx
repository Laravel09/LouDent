import { useEffect, useState } from "react"
import {
  Screen,
  BookingState,
  Appointment,
  AvailabilityDay,
  Dentist,
  CATEGORIES,
  ServiceCategory,
} from "../types"
import { api, errorMessage, Slot } from "../api/client"
import { useCatalog } from "../api/catalog"
import {
  Button,
  DentalServiceIcon,
  ProfileAvatar,
  SelectableCard,
  StepIndicator,
  icons,
  formatAppointmentDate,
} from "../components/common"

interface Props {
  navigate: (screen: Screen, params?: any) => void
  params?: any
  booking: BookingState
  setBooking: (b: BookingState) => void
  onConfirmBooking: () => Promise<Appointment>
  appointments: Appointment[]
  availability: Record<string, AvailabilityDay[]>
  blockedDates: Record<string, string[]>
  patientName: string
  dentists: Dentist[]
}

type SummaryRow = {
  label: string
  value: string
  step: Screen
}

const BOOKING_STEPS = [
  "Category",
  "Service",
  "Dentist",
  "Date",
  "Time",
  "Confirm",
]

function BookingShell({
  step,
  children,
  onBack,
  onContinue,
  canContinue,
  continueLabel = "Continue",
}: {
  step: number
  children: React.ReactNode
  onBack: () => void
  onContinue: () => void
  canContinue: boolean
  continueLabel?: string
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 flex flex-col items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">Book an Appointment</h1>
        <StepIndicator steps={BOOKING_STEPS} current={step} />
        <p className="text-sm text-muted">
          Step {step + 1} of {BOOKING_STEPS.length}: {BOOKING_STEPS[step]}
        </p>
      </div>

      <div className="bg-white border border-border rounded-2xl p-8 mb-6">
        {children}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          {icons.arrowLeft} Back
        </Button>
        <Button
          variant="primary"
          onClick={onContinue}
          disabled={!canContinue}
          size="lg"
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  )
}

// ─── Step 1: Select Category ──────────────────────────────────────────────────

export function SelectCategoryScreen({
  navigate,
  booking,
  setBooking,
  params,
}: Props) {
  const { services, categoryOf } = useCatalog()
  const preselected = params?.preselectedCategoryId ?? null
  const [selected, setSelected] = useState<ServiceCategory | null>(
    booking.categoryId as ServiceCategory ?? preselected,
  )

  const onContinue = () => {
    // Clear service if category changed
    const prev = booking.categoryId
    const serviceStillValid =
      booking.serviceId && categoryOf(booking.serviceId) === selected
    setBooking({
      ...booking,
      categoryId: selected,
      serviceId: serviceStillValid ? booking.serviceId : null,
    })
    navigate("book-service")
  }

  return (
    <BookingShell
      step={0}
      onBack={() => navigate("patient-home")}
      onContinue={onContinue}
      canContinue={!!selected}
    >
      <h2 className="text-lg font-semibold text-navy mb-2">
        Select a Category
      </h2>
      <p className="text-sm text-muted mb-6">
        Choose the type of dental care you need, then pick your specific
        service.
      </p>
      <div className="space-y-4">
        {CATEGORIES.map((cat) => {
          const count = services.filter((s) => s.category === cat.id).length
          return (
            <SelectableCard
              key={cat.id}
              selected={selected === cat.id}
              onClick={() => setSelected(cat.id)}
              className="p-5"
            >
              <div className="flex items-center gap-5 pr-6">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 transition-colors ${
                    selected === cat.id ? "bg-blue/10" : "bg-surface-2"
                  }`}
                >
                  <DentalServiceIcon serviceId={cat.id} className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-navy text-base mb-0.5">
                    {cat.id}
                  </p>
                  <p className="text-xs text-muted leading-relaxed mb-2">
                    {cat.description}
                  </p>
                  <span className="text-xs font-semibold text-blue bg-blue-tint px-2 py-0.5 rounded-full">
                    {count} service{count !== 1 ? "s" : ""} available
                  </span>
                </div>
              </div>
            </SelectableCard>
          )
        })}
      </div>
    </BookingShell>
  )
}

// ─── Step 2: Select Service ───────────────────────────────────────────────────

export function SelectServiceScreen({
  navigate,
  booking,
  setBooking,
  params,
}: Props) {
  const { services, categoryOf } = useCatalog()
  const preselectedId = params?.preselectedServiceId ?? null
  const [selected, setSelected] = useState<string | null>(
    booking.serviceId ?? preselectedId,
  )
  const [search, setSearch] = useState("")

  // If arriving from service-detail shortcut, auto-set category from the preselected service
  const resolvedCategoryId: ServiceCategory | null =
    booking.categoryId as ServiceCategory | null ??
    (preselectedId ? categoryOf(preselectedId) : null)

  const categoryId = resolvedCategoryId
  const categoryServices = categoryId
    ? services.filter((s) => s.category === categoryId)
    : services

  const filtered = categoryServices.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()),
  )

  const onContinue = () => {
    setBooking({
      ...booking,
      categoryId: resolvedCategoryId,
      serviceId: selected,
    })
    navigate("book-dentist")
  }

  return (
    <BookingShell
      step={1}
      onBack={() => navigate("book-category")}
      onContinue={onContinue}
      canContinue={!!selected}
    >
      {/* Category breadcrumb */}
      {categoryId && (
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">
            Category
          </span>
          <span className="text-muted">/</span>
          <span className="text-xs font-bold text-blue bg-blue-tint px-2.5 py-1 rounded-full">
            {categoryId}
          </span>
        </div>
      )}

      <h2 className="text-lg font-semibold text-navy mb-4">Select a Service</h2>

      {/* Search */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
          fill="none"
          viewBox="0 0 16 16"
        >
          <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 10l3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="text"
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border text-sm text-navy placeholder-muted bg-white focus:outline-none focus:ring-2 focus:ring-blue focus:border-blue"
        />
      </div>

      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {filtered.map((s) => {
          const isBraces = s.id === "braces-install"
          return (
            <SelectableCard
              key={s.id}
              selected={selected === s.id}
              onClick={() => setSelected(s.id)}
            >
              <div className="flex items-center gap-3 pr-6">
                <span className="w-8 text-center text-blue flex-shrink-0">
                  <DentalServiceIcon serviceId={s.id} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-navy text-sm">{s.name}</p>
                    {isBraces && (
                      <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded">
                        Major Treatment
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {s.duration} min · ₱{s.price.toLocaleString()}
                    {isBraces && " (est.)"}
                  </p>
                </div>
              </div>
            </SelectableCard>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted py-8">
            No services match your search.
          </p>
        )}
      </div>
    </BookingShell>
  )
}

// ─── Step 3: Select Dentist ───────────────────────────────────────────────────

export function SelectDentistScreen({
  navigate,
  booking,
  setBooking,
  dentists,
}: Props) {
  const { getService } = useCatalog()
  const [selected, setSelected] = useState<string | null>(booking.dentistId)
  const service = getService(booking.serviceId)
  const eligibleDentists = dentists.filter(
    (dentist) => !service || dentist.services.includes(service.name),
  )

  const onContinue = () => {
    setBooking({ ...booking, dentistId: selected })
    navigate("book-date")
  }

  return (
    <BookingShell
      step={2}
      onBack={() => navigate("book-service")}
      onContinue={onContinue}
      canContinue={!!selected}
    >
      <h2 className="text-lg font-semibold text-navy mb-5">Select a Dentist</h2>
      <div className="space-y-3">
        {eligibleDentists.map((d) => (
          <SelectableCard
            key={d.id}
            selected={selected === d.id}
            onClick={() => setSelected(d.id)}
          >
            <div className="flex items-center gap-4 pr-6">
              <ProfileAvatar
                photo={d.photo}
                initials={d.name
                  .split(" ")
                  .slice(1)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
                className="h-14 w-14 flex-shrink-0 text-sm"
              />
              <div className="flex-1">
                <p className="font-semibold text-navy">
                  {d.name}, {d.title}
                </p>
                <p className="text-xs text-teal font-medium">{d.specialty}</p>
                <p className="text-xs text-muted mt-0.5">
                  {d.experience} yrs exp ·{" "}
                  {d.availableDays.slice(0, 3).join(", ")}
                </p>
              </div>
            </div>
          </SelectableCard>
        ))}
      </div>
    </BookingShell>
  )
}

// ─── Step 4: Select Date ──────────────────────────────────────────────────────

function Calendar({
  selectedDate,
  onSelect,
  availableDays,
  blockedDates,
}: {
  selectedDate: string | null
  onSelect: (d: string) => void
  availableDays: AvailabilityDay[]
  blockedDates: string[]
}) {
  const manilaToday = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
  )
  const today = new Date(
    manilaToday.getFullYear(),
    manilaToday.getMonth(),
    manilaToday.getDate(),
  )
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  )

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  const isPast = (day: number) => {
    const d = new Date(year, month, day)
    return d < today
  }
  const isUnavailable = (day: number) => {
    const dayName = new Date(year, month, day).toLocaleDateString("en-US", {
      weekday: "long",
    })
    return !availableDays.find((item) => item.day === dayName)?.available
  }

  const formatDate = (day: number) => {
    const m = String(month + 1).padStart(2, "0")
    const d = String(day).padStart(2, "0")
    return `${year}-${m}-${d}`
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          aria-label="Previous month"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-2 rounded-lg hover:bg-surface-2 text-muted hover:text-navy transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
            <path
              d="M10 4L6 8l4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="font-semibold text-navy">
          {monthNames[month]} {year}
        </span>
        <button
          aria-label="Next month"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-2 rounded-lg hover:bg-surface-2 text-muted hover:text-navy transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {dayNames.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-semibold text-muted py-1"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = formatDate(day)
          const disabled =
            isPast(day) || isUnavailable(day) || blockedDates.includes(dateStr)
          const isToday = dateStr === todayStr
          const isSelected = selectedDate === dateStr

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${new Date(year, month, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${disabled ? " (unavailable)" : ""}`}
              onClick={() => !disabled && onSelect(dateStr)}
              className={`aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-colors
                ${isSelected ? "bg-blue text-white" : ""}
                ${
                  isToday && !isSelected
                    ? "ring-2 ring-blue text-blue font-bold"
                    : ""
                }
                ${
                  !isSelected && !isToday && !disabled
                    ? "hover:bg-blue-tint hover:text-blue"
                    : ""
                }
                ${
                  disabled
                    ? "text-muted/40 cursor-not-allowed"
                    : "cursor-pointer"
                }
              `}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-md bg-blue" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-md border-2 border-blue" />
          <span>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-md bg-surface-2" />
          <span>Unavailable</span>
        </div>
      </div>
    </div>
  )
}

export function SelectDateScreen({
  navigate,
  booking,
  setBooking,
  availability,
  blockedDates,
}: Props) {
  const [selected, setSelected] = useState<string | null>(booking.date)
  const availableDays = booking.dentistId
    ? availabilityFor({ availability }, booking.dentistId)
    : []

  const formatDisplay = (d: string) => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]
    const [y, m, day] = d.split("-").map(Number)
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]
    const dn = new Date(y, m - 1, day).getDay()
    return `${dayNames[dn]}, ${months[m - 1]} ${day}, ${y}`
  }

  const onContinue = () => {
    setBooking({ ...booking, date: selected })
    navigate("book-time")
  }

  return (
    <BookingShell
      step={3}
      onBack={() => navigate("book-dentist")}
      onContinue={onContinue}
      canContinue={!!selected}
    >
      <h2 className="text-lg font-semibold text-navy mb-5">Select a Date</h2>
      <Calendar
        selectedDate={selected}
        onSelect={setSelected}
        availableDays={availableDays}
        blockedDates={
          booking.dentistId ? (blockedDates[booking.dentistId] ?? []) : []
        }
      />
      {selected && (
        <div className="mt-4 bg-blue-tint rounded-lg px-4 py-2.5 text-sm font-medium text-blue">
          ✓ Selected: {formatDisplay(selected)}
        </div>
      )}
    </BookingShell>
  )
}

// ─── Step 5: Select Time ──────────────────────────────────────────────────────

function availabilityFor(
  props: Pick<Props, "availability">,
  dentistId: string,
) {
  return props.availability[dentistId] ?? []
}

export function SelectTimeScreen({
  navigate,
  booking,
  setBooking,
}: Props) {
  const [selected, setSelected] = useState<string | null>(booking.time)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Availability is decided by the server (schedule, blocked dates, breaks, service length and
  // existing Pending/Confirmed bookings). When rescheduling, the appointment's own slot is allowed.
  useEffect(() => {
    if (!booking.dentistId || !booking.serviceId || !booking.date) {
      setSlots([])
      setLoadingSlots(false)
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    setSlotError(null)
    api
      .slots({
        dentistId: booking.dentistId,
        serviceId: booking.serviceId,
        date: booking.date,
        excludeAppointmentId: booking.rescheduleAppointmentId,
      })
      .then((list) => {
        if (cancelled) return
        setSlots(list)
        setSelected((current) =>
          current && list.some((slot) => slot.time === current && slot.available)
            ? current
            : null,
        )
      })
      .catch((error) => {
        if (cancelled) return
        setSlots([])
        setSlotError(errorMessage(error, "Could not load available times."))
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    booking.dentistId,
    booking.serviceId,
    booking.date,
    booking.rescheduleAppointmentId,
    reloadKey,
  ])

  const onContinue = () => {
    setBooking({ ...booking, time: selected })
    navigate("book-summary")
  }

  return (
    <BookingShell
      step={4}
      onBack={() => navigate("book-date")}
      onContinue={onContinue}
      canContinue={!!selected && !loadingSlots && !slotError}
    >
      <h2 className="text-lg font-semibold text-navy mb-2">Select a Time</h2>
      {booking.date && (
        <p className="text-sm text-muted mb-5">
          Available slots for{" "}
          {new Date(`${booking.date}T12:00:00`).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      )}
      {slotError && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
        >
          <span>{slotError}</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}
      {loadingSlots && (
        <p role="status" className="mb-4 text-sm text-muted">
          Loading available times…
        </p>
      )}
      {!loadingSlots && !slotError && !slots.some((item) => item.available) && (
        <p role="status" className="mb-4 text-sm text-muted">
          No times are available on this date. Please choose another date.
        </p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {slots.map(({ time: slot, available }) => {
          const isBooked = !available
          const isSelected = selected === slot
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={isSelected}
              disabled={isBooked}
              onClick={() => !isBooked && setSelected(slot)}
              className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                isSelected
                  ? "bg-blue border-blue text-white"
                  : isBooked
                    ? "bg-surface-2 border-surface-2 text-muted/40 cursor-not-allowed line-through"
                    : "bg-white border-border text-navy hover:border-blue hover:bg-blue-tint hover:text-blue"
              }`}
            >
              {slot}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-border text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-md bg-blue" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-md bg-surface-2" />
          <span>Unavailable or already reserved</span>
        </div>
      </div>
    </BookingShell>
  )
}

// ─── Step 6: Summary ──────────────────────────────────────────────────────────

export function AppointmentSummaryScreen({
  navigate,
  booking,
  onConfirmBooking,
  patientName,
  dentists,
}: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { getService } = useCatalog()
  const service = getService(booking.serviceId)
  const dentist = dentists.find((d) => d.id === booking.dentistId)

  const formatDate = (d: string | null) => {
    if (!d) return "—"
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]
    const [y, m, day] = d.split("-").map(Number)
    return `${months[m - 1]} ${day}, ${y}`
  }

  const rows: SummaryRow[] = [
    { label: "Patient", value: patientName, step: "book-category" },
    { label: "Service", value: service?.name ?? "—", step: "book-service" },
    { label: "Dentist", value: dentist?.name ?? "—", step: "book-dentist" },
    { label: "Date", value: formatDate(booking.date), step: "book-date" },
    { label: "Time", value: booking.time ?? "—", step: "book-time" },
    {
      label: "Duration",
      value: service ? `${service.duration} min` : "—",
      step: "book-service",
    },
    {
      label: "Price",
      value: service
        ? `₱${service.price.toLocaleString()}${
            service.id === "braces-install" ? " (est.)" : ""
          }`
        : "—",
      step: "book-service",
    },
  ]

  const handleConfirm = async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onConfirmBooking()
      navigate("book-success")
    } catch (error) {
      setSubmitError(
        errorMessage(error, "Unable to submit this booking request."),
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 flex flex-col items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">Book an Appointment</h1>
        <StepIndicator steps={BOOKING_STEPS} current={5} />
        <p className="text-sm text-muted">
          Step 6 of 6: Confirm — please review before submitting
        </p>
      </div>

      <div className="bg-white border border-border rounded-2xl p-8 mb-6">
        <h2 className="text-lg font-semibold text-navy mb-5">
          Appointment Summary
        </h2>
        <div className="mb-5 rounded-xl border border-blue/20 bg-blue-tint px-4 py-3 text-sm text-navy">
          Your selected dentist will review this request. New requests remain
          Pending until confirmed.
        </div>
        {submitError && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
          >
            <p>{submitError}</p>
            <button
              type="button"
              onClick={() => navigate("book-time")}
              className="mt-2 text-xs font-semibold text-blue hover:underline"
            >
              Choose another time
            </button>
          </div>
        )}

        {service?.id === "braces-install" && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700">
            <svg
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 16 16"
            >
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
            Final fee may vary depending on treatment needs and dentist
            assessment.
          </div>
        )}

        <div className="divide-y divide-border">
          {rows.map(({ label, value, step }) => (
            <div key={label} className="flex items-center py-3 gap-4">
              <dt className="w-24 text-xs font-semibold text-muted uppercase tracking-wide">
                {label}
              </dt>
              <dd className="flex-1 text-sm font-medium text-navy">{value}</dd>
              {["Service", "Dentist", "Date", "Time"].includes(label) && (
                <button
                  onClick={() => navigate(step)}
                  className="text-xs text-blue hover:underline flex items-center gap-1 flex-shrink-0"
                >
                  {icons.edit} Edit
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("book-time")}>
          {icons.arrowLeft} Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={submitting}
          onClick={handleConfirm}
        >
          {submitting ? "Submitting…" : "Submit Booking Request →"}
        </Button>
      </div>
    </div>
  )
}

// ─── Booking Success ──────────────────────────────────────────────────────────

export function BookingSuccessScreen({
  navigate,
  newAppointment,
}: {
  navigate: (screen: Screen, params?: any) => void
  booking: BookingState
  newAppointment: Appointment | null
}) {
  const apt = newAppointment
  if (!apt) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto text-center py-8">
      <div className="bg-white border border-border rounded-2xl p-10">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-success"
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

        <h1 className="text-2xl font-bold text-navy mb-2">
          Appointment request submitted
        </h1>
        <p className="text-muted text-sm mb-8">
          Your dentist will review the request. You can track its status in My
          Appointments.
        </p>

        <div className="bg-surface rounded-xl p-5 text-left space-y-3 mb-6">
          <div className="flex justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">
              Reference
            </span>
            <span className="text-sm font-bold text-navy">
              #{apt.reference}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">
              Service
            </span>
            <span className="text-sm text-navy">{apt.serviceName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">
              Dentist
            </span>
            <span className="text-sm text-navy">{apt.dentistName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">
              Date & Time
            </span>
            <span className="text-sm text-navy">
              {formatAppointmentDate(apt.date)} · {apt.time}
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">
              Status
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-tint text-blue">
              <span className="w-1.5 h-1.5 rounded-full bg-blue" />
              Pending
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={() =>
              navigate("appointment-detail", { appointmentId: apt.id })
            }
          >
            View Appointment
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate("patient-home")}
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  )
}
