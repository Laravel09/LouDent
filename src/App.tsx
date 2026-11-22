import { useCallback, useEffect, useRef, useState } from "react"
import { Logo, Button } from "./components/common"
import {
  Screen,
  BookingState,
  Appointment,
  AppointmentStatus,
  AvailabilityDay,
  Dentist,
  PatientProfile,
  Service,
} from "./types"
import {
  api,
  ApiError,
  ApiUser,
  errorMessage,
  setUnauthorizedHandler,
} from "./api/client"
import { CatalogProvider } from "./api/catalog"
import { supabase, supabaseConfigError } from "./lib/supabase"
import { takeEmailLink, redeemEmailLink } from "./lib/authLinks"

import { PatientLayout, AdminLayout } from "./components/layouts"

import {
  LandingPage,
  SignUpScreen,
  PatientLoginScreen,
  AdminLoginScreen,
  PublicServiceDetailScreen,
  PublicDentistProfileScreen,
  RegisterOutcome,
} from "./screens/PublicScreens"
import {
  ForgotPasswordScreen,
  ResetPasswordScreen,
  VerifyEmailScreen,
  DevMailPanel,
} from "./screens/AuthRecoveryScreens"
import {
  AboutPage,
  ContactPage,
  AuthenticatedContactScreen,
  PublicServicesPage,
  SettingsPage,
  AdminSettingsPage,
} from "./screens/ExtraScreens"
import {
  PatientHome,
  ServicesScreen,
  ServiceDetailScreen,
  DentistsScreen,
  DentistProfileScreen,
  MyAppointmentsScreen,
  AppointmentDetailScreen,
  ProfileScreen,
  EditProfileScreen,
} from "./screens/PatientScreens"
import {
  SelectCategoryScreen,
  SelectServiceScreen,
  SelectDentistScreen,
  SelectDateScreen,
  SelectTimeScreen,
  AppointmentSummaryScreen,
  BookingSuccessScreen,
} from "./screens/BookingScreens"
import {
  AdminDashboard,
  ManageAppointmentsScreen,
  AdminAppointmentDetailScreen,
  ManageAvailabilityScreen,
  DentistPortalProfile,
} from "./screens/AdminScreens"

type Role = "none" | "patient" | "dentist"

function AuthGate({
  navigate,
}: {
  navigate: (screen: Screen, params?: any) => void
}) {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-border p-10 w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <div className="w-14 h-14 rounded-full bg-blue-tint flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-blue" fill="none" viewBox="0 0 24 24">
            <rect
              x="5"
              y="11"
              width="14"
              height="10"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M8 11V7a4 4 0 018 0v4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-navy mb-2">
          Sign in to continue
        </h1>
        <p className="text-sm text-muted mb-8">
          You need a LouDent account to access this feature. Log in or create a
          free account to book appointments and manage your dental care.
        </p>
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate("patient-login")}
          >
            Log In to Your Account
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate("signup")}
          >
            Create a Free Account
          </Button>
        </div>
        <button
          onClick={() => navigate("landing")}
          className="mt-5 text-xs text-muted hover:text-navy hover:underline transition-colors"
        >
          ← Back to Landing Page
        </button>
      </div>
    </div>
  )
}

const PATIENT_SCREENS: Screen[] = [
  "patient-home",
  "service-detail",
  "dentists",
  "dentist-profile",
  "my-appointments",
  "appointment-detail",
  "profile",
  "edit-profile",
  "settings",
  "book-category",
  "book-service",
  "book-dentist",
  "book-date",
  "book-time",
  "book-summary",
  "book-success",
]

const ADMIN_SCREENS: Screen[] = [
  "admin-dashboard",
  "admin-appointments",
  "admin-appointment-detail",
  "admin-availability",
  "admin-profile",
  "admin-settings",
]

const EMPTY_BOOKING: BookingState = {
  categoryId: null,
  serviceId: null,
  dentistId: null,
  date: null,
  time: null,
}

// Screens whose data should be re-read from the server when the user opens them,
// so status changes made by the other role (or another browser) show up.
const REFRESH_APPOINTMENT_SCREENS: Screen[] = [
  "patient-home",
  "my-appointments",
  "appointment-detail",
  "admin-dashboard",
  "admin-appointments",
  "admin-appointment-detail",
]
const POLL_MS = 20000

function ConnectionBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-3 border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
    >
      <span>{message}</span>
      <button
        onClick={onRetry}
        className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-danger hover:bg-red-100"
      >
        Retry
      </button>
    </div>
  )
}


function VerifyEmailBanner({ user }: { user: ApiUser }) {
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const resend = async () => {
    if (busy) return
    setBusy(true)
    try {
      setNote((await api.resendVerification(user.email)).message)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      setNote(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      role="status"
      className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-semibold">Please verify your email address to book appointments.</p>
      <p className="mt-1 text-xs">
        We sent a verification link to {user.email}. You can look around, but booking
        stays locked until the link is opened.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={resend}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-amber-100 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Resend verification email"}
        </button>
        {note && <span className="text-xs">{note}</span>}
      </div>
      <DevMailPanel email={user.email} refreshKey={refreshKey} kind="verify" />
    </div>
  )
}

export default function App() {
  // ── Server session (HttpOnly cookie). Nothing about auth is kept in browser storage. ──
  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<ApiUser | null>(null)
  const role: Role = user?.role ?? "none"
  const activeDentistId = user?.role === "dentist" ? user.dentistId : null
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)
  const [emailLink] = useState(takeEmailLink)

  const [screen, setScreen] = useState<Screen>("landing")
  const [params, setParams] = useState<any>({})
  const [pendingPatientDestination, setPendingPatientDestination] =
    useState<Screen | null>(null)

  // ── Data loaded from the API ──
  const [services, setServices] = useState<Service[]>([])
  const [dentists, setDentists] = useState<Dentist[]>([])
  const [availability, setAvailability] = useState<
    Record<string, AvailabilityDay[]>
  >({})
  const [blockedDates, setBlockedDates] = useState<Record<string, string[]>>({})
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [dataError, setDataError] = useState<string | null>(null)
  const [lastBookedApt, setLastBookedApt] = useState<Appointment | null>(null)
  const [booking, setBooking] = useState<BookingState>(EMPTY_BOOKING)

  const userRef = useRef<ApiUser | null>(null)
  userRef.current = user

  const profile: PatientProfile = {
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    photoDataUrl: user?.photoDataUrl ?? undefined,
  }

  const applySchedules = (
    list: Dentist[],
    schedules: { days: AvailabilityDay[]; blockedDates: string[] }[],
  ) => {
    setAvailability(
      Object.fromEntries(list.map((d, i) => [d.id, schedules[i].days])),
    )
    setBlockedDates(
      Object.fromEntries(list.map((d, i) => [d.id, schedules[i].blockedDates])),
    )
  }

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      const [serviceList, dentistList] = await Promise.all([
        api.services(),
        api.dentists(),
      ])
      const schedules = await Promise.all(
        dentistList.map((dentist) => api.schedule(dentist.id)),
      )
      setServices(serviceList)
      setDentists(dentistList)
      applySchedules(dentistList, schedules)
      setCatalogError(null)
    } catch (error) {
      setCatalogError(errorMessage(error))
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  // Quiet refresh of dentists + schedules (used after edits and while booking).
  const refreshDentistsAndSchedules = useCallback(async () => {
    try {
      const dentistList = await api.dentists()
      const schedules = await Promise.all(
        dentistList.map((dentist) => api.schedule(dentist.id)),
      )
      setDentists(dentistList)
      applySchedules(dentistList, schedules)
      setCatalogError(null)
    } catch {
      // keep showing the last data; the next successful call recovers
    }
  }, [])

  const loadAppointments = useCallback(async (silent = false) => {
    if (!userRef.current) return
    try {
      const list = await api.appointments()
      setAppointments(list)
      setDataError(null)
    } catch (error) {
      if (!silent) setDataError(errorMessage(error))
    }
  }, [])

  const mergeAppointment = (saved: Appointment) =>
    setAppointments((current) =>
      current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current],
    )

  // Initial load: redeem any email link (verify / reset), check Supabase session, and load public catalog.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (emailLink) {
          if (emailLink.kind === "verify") {
            try {
              await redeemEmailLink(emailLink)
              if (!cancelled) {
                setParams({ token: "verified" })
                setScreen("verify-email")
              }
            } catch (err) {
              if (!cancelled) {
                setParams({ token: `error:${errorMessage(err)}` })
                setScreen("verify-email")
              }
            }
          } else {
            try {
              await redeemEmailLink(emailLink)
              if (!cancelled) {
                setParams({ token: "ready" })
                setScreen("reset-password")
              }
            } catch (err) {
              if (!cancelled) {
                setParams({ token: `error:${errorMessage(err)}` })
                setScreen("reset-password")
              }
            }
          }
        }

        if (!supabaseConfigError) {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          if (session && !cancelled) {
            const current = await api.me()
            setUser(current)
            if (!emailLink) {
              setScreen(
                current.role === "patient" ? "patient-home" : "admin-dashboard",
              )
            }
          }
        }
      } catch {
        // Not logged in; network errors are shown by the catalog banner
      } finally {
        if (!cancelled) {
          setAuthReady(true)
        }
      }
    })()
    loadCatalog()

    if (supabaseConfigError) {
      return () => {
        cancelled = true
      }
    }

    // Listen for Supabase auth state changes (email verification, password recovery)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setParams({ token: "ready" })
        setScreen("reset-password")
      } else if (event === "SIGNED_IN" && session) {
        try {
          const current = await api.me()
          setUser(current)
        } catch {
          // ignore
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null)
        setAppointments([])
        setBooking(EMPTY_BOOKING)
      } else if (event === "USER_UPDATED") {
        try {
          const current = await api.me()
          setUser(current)
        } catch {
          // ignore
        }
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadCatalog, emailLink])

  // Appointments follow the signed-in user.
  useEffect(() => {
    if (user) loadAppointments()
    else setAppointments([])
  }, [user?.id, loadAppointments])

  // Authenticated request returned 401 (cookie expired or logged out elsewhere).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      const wasDentist = userRef.current?.role === "dentist"
      if (!userRef.current) return
      setUser(null)
      setAppointments([])
      setBooking(EMPTY_BOOKING)
      setSessionNotice("Your session has expired. Please log in again.")
      setScreen(wasDentist ? "admin-login" : "patient-login")
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  // Pick up changes made in other browsers / by the other role.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      if (userRef.current) loadAppointments(true)
      refreshDentistsAndSchedules()
    }
    const timer = window.setInterval(refresh, POLL_MS)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [loadAppointments, refreshDentistsAndSchedules])

  const navigate = (s: Screen, p: any = {}) => {
    if (
      role === "none" &&
      ["landing", "about", "contact", "services"].includes(s) &&
      !p.preselectedServiceId &&
      !p.preselectedDentistId
    ) {
      setPendingPatientDestination(null)
      setBooking(EMPTY_BOOKING)
    }
    // A "fresh" booking entry point (sidebar button, Book Now, + Book New) must never
    // inherit leftovers from an abandoned booking or an abandoned reschedule.
    if (p.freshBooking) {
      setBooking(EMPTY_BOOKING)
    } else if (booking.rescheduleAppointmentId && !s.startsWith("book-")) {
      setBooking(EMPTY_BOOKING)
    }
    if (p.pendingDestination) {
      setPendingPatientDestination(p.pendingDestination)
    }
    if (p.preselectedServiceId || p.preselectedDentistId) {
      setBooking((current) => ({
        ...current,
        categoryId: p.preselectedServiceId
          ? (services.find((item) => item.id === p.preselectedServiceId)
              ?.category ?? current.categoryId)
          : current.categoryId,
        serviceId: p.preselectedServiceId ?? current.serviceId,
        dentistId: p.preselectedDentistId ?? current.dentistId,
      }))
      setPendingPatientDestination(
        p.preselectedServiceId ? "book-dentist" : "book-category",
      )
    }
    if (user && REFRESH_APPOINTMENT_SCREENS.includes(s)) loadAppointments(true)
    if (s === "book-date" || s === "book-time") refreshDentistsAndSchedules()
    setScreen(s)
    setParams(p)
    window.scrollTo(0, 0)
  }

  // ── Authentication (all handlers return an error message or null) ──
  const handlePatientLogin = async (
    email: string,
    password: string,
  ): Promise<string | null> => {
    try {
      const signedIn = await api.login(email.trim(), password)
      if (signedIn.role !== "patient") {
        await api.logout().catch(() => undefined)
        return "That is a dentist account. Use Dentist Login instead."
      }
      setSessionNotice(null)
      setUser(signedIn)
      const destination = pendingPatientDestination
      setPendingPatientDestination(null)
      navigate(destination ?? "patient-home")
      return null
    } catch (error) {
      return errorMessage(error)
    }
  }

  const handleRegister = async (data: {
    name: string
    email: string
    phone: string
    password: string
    confirmPassword: string
    acceptedTerms: boolean
  }): Promise<RegisterOutcome> => {
    try {
      await api.register(data)
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status >= 500)
          return {
            ok: false,
            status: error.status,
            requestId: error.requestId,
            message: `The server had a problem creating your account, so nothing was saved. Please try again in a moment.${error.requestId ? ` (reference ${error.requestId})` : ""}`,
          }
        return { ok: false, status: error.status, message: error.message }
      }
      return { ok: false, status: 0, message: errorMessage(error) }
    }
  }

  const handleDentistLogin = async (
    email: string,
    password: string,
  ): Promise<string | null> => {
    try {
      const signedIn = await api.login(email.trim(), password)
      if (signedIn.role !== "dentist") {
        await api.logout().catch(() => undefined)
        return "That is a patient account. Use the patient login instead."
      }
      setSessionNotice(null)
      setUser(signedIn)
      navigate("admin-dashboard")
      return null
    } catch (error) {
      return errorMessage(error)
    }
  }

  const refreshMe = async () => {
    try {
      setUser(await api.me())
    } catch {
      // not signed in; nothing to refresh
    }
  }

  const handleLogout = async () => {
    try {
      await api.logout()
    } catch {
      // The local view is cleared either way; an expired cookie is already logged out.
    }
    setUser(null)
    setAppointments([])
    setPendingPatientDestination(null)
    setBooking(EMPTY_BOOKING)
    setLastBookedApt(null)
    navigate("landing")
  }

  // ── Appointments ──
  const handleCancelAppointment = async (id: string) => {
    try {
      mergeAppointment(await api.cancelAppointment(id))
      return null
    } catch (error) {
      loadAppointments(true)
      return errorMessage(error)
    }
  }

  const handleUpdateAppointment = async (
    id: string,
    status: AppointmentStatus,
    declineReason?: string,
  ) => {
    try {
      mergeAppointment(
        await api.setAppointmentStatus(id, status, declineReason),
      )
      return null
    } catch (error) {
      loadAppointments(true)
      return errorMessage(error)
    }
  }

  // Throws an Error with a user-readable message when the server refuses the booking.
  const handleConfirmBooking = async (): Promise<Appointment> => {
    const { serviceId, dentistId, date, time, rescheduleAppointmentId } = booking
    if (!serviceId || !dentistId || !date || !time) {
      throw new Error("Please complete every booking step before submitting.")
    }
    const input = { serviceId, dentistId, date, time }
    const saved = rescheduleAppointmentId
      ? await api.rescheduleAppointment(rescheduleAppointmentId, input)
      : await api.createAppointment(input)
    mergeAppointment(saved)
    setLastBookedApt(saved)
    setBooking(EMPTY_BOOKING)
    return saved
  }

  // ── Profiles ──
  const handleUpdatePatientProfile = async (
    data: PatientProfile,
  ): Promise<string | null> => {
    if (!user) return "Please log in again."
    const name = data.name.trim()
    const phone = data.phone.trim()
    try {
      await api.updateMe({ name, phone })
      setUser((current) => (current ? { ...current, name, phone } : current))
    } catch (error) {
      return errorMessage(error)
    }
    const nextPhoto = data.photoDataUrl ?? null
    if ((user.photoDataUrl ?? null) !== nextPhoto) {
      try {
        const result = await api.setMyPhoto(nextPhoto)
        setUser((current) =>
          current ? { ...current, photoDataUrl: result.photoDataUrl } : current,
        )
      } catch (error) {
        return `Your details were saved, but the photo was not: ${errorMessage(error)}`
      }
    }
    loadAppointments(true)
    return null
  }

  const handleUpdateDentist = async (
    updated: Dentist,
  ): Promise<string | null> => {
    if (!user || user.role !== "dentist") return "Please log in again."
    const current = dentists.find((item) => item.id === updated.id)
    try {
      await api.updateDentistProfile(updated.id, {
        name: updated.name,
        title: updated.title,
        specialty: updated.specialty,
        bio: updated.bio,
        experience: updated.experience,
      })
    } catch (error) {
      return errorMessage(error)
    }
    if ((current?.photo ?? "") !== (updated.photo ?? "")) {
      try {
        await api.setMyPhoto(updated.photo ? updated.photo : null)
      } catch (error) {
        await refreshDentistsAndSchedules()
        return `Your profile text was saved, but the photo was not: ${errorMessage(error)}`
      }
    }
    setUser((existing) =>
      existing ? { ...existing, name: updated.name } : existing,
    )
    await refreshDentistsAndSchedules()
    return null
  }

  // Weekly hours are saved with one PUT; blocked dates are added/removed one by one.
  const handleSaveSchedule = async (
    dentistId: string,
    days: AvailabilityDay[],
    nextBlocked: string[],
  ): Promise<string | null> => {
    const currentBlocked = blockedDates[dentistId] ?? []
    try {
      await api.saveSchedule(dentistId, days)
    } catch (error) {
      return errorMessage(error)
    }
    try {
      for (const date of currentBlocked.filter(
        (item) => !nextBlocked.includes(item),
      )) {
        await api.removeBlockedDate(dentistId, date)
      }
      for (const date of nextBlocked.filter(
        (item) => !currentBlocked.includes(item),
      )) {
        await api.addBlockedDate(dentistId, date)
      }
    } catch (error) {
      await refreshDentistsAndSchedules()
      return `Weekly hours were saved, but the blocked dates were not: ${errorMessage(error)}`
    }
    await refreshDentistsAndSchedules()
    return null
  }

  const commonPatientProps = {
    navigate,
    params,
    appointments,
    onCancelAppointment: handleCancelAppointment,
    onRescheduleAppointment: (appointment: Appointment) => {
      setBooking({
        categoryId: null,
        serviceId: appointment.serviceId,
        dentistId: appointment.dentistId,
        date: null,
        time: null,
        rescheduleAppointmentId: appointment.id,
      })
      navigate("book-date")
    },
    onUpdateProfile: handleUpdatePatientProfile,
    profile,
    dentists,
    availability,
    blockedDates,
  }

  // The signed-in dentist always exists for the portal, even if the catalog failed to load.
  const fallbackDentist: Dentist | null =
    user?.role === "dentist" && user.dentistId
      ? {
          id: user.dentistId,
          name: user.name,
          title: "",
          specialty: "",
          experience: 0,
          bio: "",
          availableDays: [],
          hours: "",
          services: [],
          nextAvailable: "",
          photo: user.photoDataUrl ?? "",
        }
      : null
  const adminDentists =
    fallbackDentist && !dentists.some((item) => item.id === fallbackDentist.id)
      ? [fallbackDentist, ...dentists]
      : dentists

  const commonAdminProps = {
    navigate,
    params,
    adminAppointments: appointments,
    onUpdateAdminAppointment: handleUpdateAppointment,
    activeDentistId: activeDentistId ?? "",
    isClinicAdmin: user?.role === "dentist" && user.isClinicAdmin === true,
    availability,
    blockedDates,
    onSaveSchedule: handleSaveSchedule,
    dentists: adminDentists,
    onUpdateDentist: handleUpdateDentist,
  }

  const renderScreen = () => {
    // Wait for the server session check before choosing a screen (prevents a login-page flash).
    if (!authReady) {
      return (
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 p-6">
          <Logo size="lg" />
          <p role="status" className="text-sm text-muted">
            Loading…
          </p>
        </div>
      )
    }

    // ── Public screens ────────────────────────────────────────────────────────
    if (screen === "landing") return <LandingPage navigate={navigate} />
    if (screen === "signup")
      return <SignUpScreen navigate={navigate} onRegister={handleRegister} />
    if (screen === "patient-login")
      return (
        <PatientLoginScreen
          navigate={navigate}
          onLogin={handlePatientLogin}
          notice={sessionNotice}
        />
      )
    if (screen === "admin-login")
      return (
        <AdminLoginScreen
          navigate={navigate}
          onLogin={handleDentistLogin}
          notice={sessionNotice}
        />
      )
    if (screen === "service-detail" && role === "none")
      return (
        <PublicServiceDetailScreen
          navigate={navigate}
          params={params}
          dentists={dentists}
        />
      )
    if (screen === "dentist-profile" && role === "none")
      return (
        <PublicDentistProfileScreen
          navigate={navigate}
          params={params}
          dentists={dentists}
          availability={availability}
          blockedDates={blockedDates}
        />
      )
    if (screen === "forgot-password")
      return (
        <ForgotPasswordScreen
          navigate={navigate}
          audience={params?.audience === "dentist" ? "dentist" : "patient"}
        />
      )
    if (screen === "reset-password")
      return (
        <ResetPasswordScreen navigate={navigate} token={String(params?.token ?? "")} />
      )
    if (screen === "verify-email")
      return (
        <VerifyEmailScreen
          navigate={navigate}
          token={String(params?.token ?? "")}
          signedIn={role === "patient"}
          onVerified={refreshMe}
        />
      )
    if (screen === "about") {
      return <AboutPage navigate={navigate} />
    }

    if (screen === "contact") {
      if (role === "patient") {
        return (
          <PatientLayout
            activeScreen="contact"
            navigate={navigate}
            onLogout={handleLogout}
            profile={profile}
          >
            {user && user.role === "patient" && !user.emailVerified && (
              <VerifyEmailBanner user={user} />
            )}
            {dataError && (
              <div
                role="alert"
                className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
              >
                <span>{dataError}</span>
                <button
                  onClick={() => loadAppointments()}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-100"
                >
                  Retry
                </button>
              </div>
            )}
            <AuthenticatedContactScreen
              navigate={navigate}
              backScreen="settings"
            />
          </PatientLayout>
        )
      }

      if (role === "dentist") {
        return (
          <AdminLayout
            activeScreen="contact"
            navigate={navigate}
            onLogout={handleLogout}
            dentist={
              adminDentists.find((item) => item.id === activeDentistId) ??
              adminDentists[0]
            }
          >
            {dataError && (
              <div
                role="alert"
                className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
              >
                <span>{dataError}</span>
                <button
                  onClick={() => loadAppointments()}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-100"
                >
                  Retry
                </button>
              </div>
            )}
            <AuthenticatedContactScreen
              navigate={navigate}
              backScreen="admin-settings"
            />
          </AdminLayout>
        )
      }

      return <ContactPage navigate={navigate} />
    }

    // ── Services: accessible publicly; with sidebar if logged in as patient ───
    if (screen === "services") {
      if (role === "patient") {
        return (
          <PatientLayout
            activeScreen={screen}
            navigate={navigate}
            onLogout={handleLogout}
            profile={profile}
          >
            <ServicesScreen {...commonPatientProps} />
          </PatientLayout>
        )
      }
      return <PublicServicesPage navigate={navigate} />
    }

    // ── Auth guard: unauthenticated access → access gate ─────────────────────
    if (PATIENT_SCREENS.includes(screen) && role !== "patient") {
      return <AuthGate navigate={navigate} />
    }
    if (ADMIN_SCREENS.includes(screen) && role !== "dentist") {
      return (
        <AdminLoginScreen
          navigate={navigate}
          onLogin={handleDentistLogin}
          notice={sessionNotice}
        />
      )
    }

    // ── Patient screens ───────────────────────────────────────────────────────
    if (PATIENT_SCREENS.includes(screen)) {
      const bookingProps = {
        navigate,
        params,
        booking,
        setBooking,
        onConfirmBooking: handleConfirmBooking,
        appointments,
        availability,
        blockedDates,
        dentists,
        patientName: profile.name,
      }

      const renderContent = () => {
        switch (screen) {
          case "patient-home":
            return <PatientHome {...commonPatientProps} />

          case "service-detail":
            return <ServiceDetailScreen {...commonPatientProps} />
          case "dentists":
            return <DentistsScreen {...commonPatientProps} />
          case "dentist-profile":
            return <DentistProfileScreen {...commonPatientProps} />
          case "my-appointments":
            return <MyAppointmentsScreen {...commonPatientProps} />
          case "appointment-detail":
            return <AppointmentDetailScreen {...commonPatientProps} />
          case "profile":
            return <ProfileScreen {...commonPatientProps} />
          case "edit-profile":
            return <EditProfileScreen {...commonPatientProps} />
          case "settings":
            return (
              <SettingsPage
                navigate={navigate}
                profile={profile}
                onLogout={handleLogout}
              />
            )
          case "book-category":
            return <SelectCategoryScreen {...bookingProps} />
          case "book-service":
            return <SelectServiceScreen {...bookingProps} />
          case "book-dentist":
            return <SelectDentistScreen {...bookingProps} />
          case "book-date":
            return <SelectDateScreen {...bookingProps} />
          case "book-time":
            return <SelectTimeScreen {...bookingProps} />
          case "book-summary":
            return <AppointmentSummaryScreen {...bookingProps} />
          case "book-success":
            return (
              <BookingSuccessScreen
                navigate={navigate}
                booking={booking}
                newAppointment={lastBookedApt}
              />
            )
          default:
            return null
        }
      }

      return (
        <PatientLayout
          activeScreen={screen}
          navigate={navigate}
          onLogout={handleLogout}
          profile={profile}
        >
          {user && user.role === "patient" && !user.emailVerified && (
            <VerifyEmailBanner user={user} />
          )}
          {dataError && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
            >
              <span>{dataError}</span>
              <button
                onClick={() => loadAppointments()}
                className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}
          {renderContent()}
        </PatientLayout>
      )
    }

    // ── Dentist (clinic) screens ──────────────────────────────────────────────
    if (ADMIN_SCREENS.includes(screen)) {
      const renderContent = () => {
        switch (screen) {
          case "admin-dashboard":
            return <AdminDashboard {...commonAdminProps} />
          case "admin-appointments":
            return <ManageAppointmentsScreen {...commonAdminProps} />
          case "admin-appointment-detail":
            return <AdminAppointmentDetailScreen {...commonAdminProps} />
          case "admin-availability":
            return <ManageAvailabilityScreen {...commonAdminProps} />
          case "admin-profile":
            return <DentistPortalProfile {...commonAdminProps} />
          case "admin-settings":
            return (
              <AdminSettingsPage navigate={navigate} onLogout={handleLogout} />
            )
          default:
            return null
        }
      }

      return (
        <AdminLayout
          activeScreen={screen}
          navigate={navigate}
          onLogout={handleLogout}
          dentist={
            adminDentists.find((item) => item.id === activeDentistId) ??
            adminDentists[0]
          }
        >
          {dataError && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
            >
              <span>{dataError}</span>
              <button
                onClick={() => loadAppointments()}
                className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}
          {renderContent()}
        </AdminLayout>
      )
    }

    // Fallback
    return <LandingPage navigate={navigate} />
  }

  return (
    <CatalogProvider
      services={services}
      loading={catalogLoading}
      error={catalogError}
    >
      {renderScreen()}
      {catalogError && (
        <ConnectionBanner message={catalogError} onRetry={loadCatalog} />
      )}
    </CatalogProvider>
  )
}
