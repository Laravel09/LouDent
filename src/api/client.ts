// Typed Supabase client adapter for LouDent.
// Preserves the exact `api` interface expected by the approved React screens
// while executing all operations through Supabase Auth, PostgreSQL RLS,
// SECURITY DEFINER RPCs, Storage buckets, and the provision-dentist Edge Function.

import { supabase, siteUrl, supabaseConfigError } from "../lib/supabase"
import { emailLooksValid, passwordProblem, phoneLooksValid } from "./validation"
import type {
  Appointment,
  AppointmentStatus,
  AvailabilityDay,
  Dentist,
  Service,
  ServiceCategory,
} from "../types"

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number
  code?: string
  requestId?: string
  constructor(
    status: number,
    message: string,
    extra: { code?: string; requestId?: string } = {},
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = extra.code
    this.requestId = extra.requestId
  }
}

export const NETWORK_ERROR_MESSAGE =
  "Cannot reach the LouDent Supabase service. Check your internet connection and environment configuration."

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler
}

export function errorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function assertConfigured() {
  if (supabaseConfigError) {
    throw new ApiError(503, supabaseConfigError, { code: "CONFIG_ERROR" })
  }
}

function raiseRpcError(error: any, fallback = "Request could not be completed."): never {
  const hint: string | undefined = typeof error?.hint === "string" ? error.hint : undefined
  const pgCode: string | undefined = typeof error?.code === "string" ? error.code : undefined
  let message = typeof error?.message === "string" && error.message ? error.message : fallback

  if (pgCode === "PGRST205" || pgCode === "PGRST202") {
    throw new ApiError(
      503,
      "Connected to Supabase, but the LouDent database migrations have not been applied yet. Run the 5 migrations in supabase/migrations/ (see docs/DATABASE_MIGRATION.md).",
      { code: pgCode },
    )
  }

  let status = 400
  if (hint === "NOT_AUTHENTICATED" || pgCode === "PGRST301") {
    status = 401
    unauthorizedHandler?.()
  } else if (hint === "FORBIDDEN" || hint === "EMAIL_NOT_VERIFIED" || pgCode === "42501") {
    status = 403
  } else if (hint === "NOT_FOUND") {
    status = 404
  } else if (
    hint === "SLOT_TAKEN" ||
    hint === "OUTSIDE_SCHEDULE" ||
    hint === "DATE_BLOCKED" ||
    hint === "DATE_HAS_APPOINTMENTS" ||
    hint === "SCHEDULE_CONFLICT" ||
    hint === "INVALID_STATE" ||
    hint === "INVALID_TRANSITION" ||
    hint === "FUTURE_APPOINTMENT" ||
    hint === "CONFLICT" ||
    pgCode === "23505" ||
    pgCode === "23P01"
  ) {
    status = 409
  }

  throw new ApiError(status, message, { code: hint || pgCode })
}

// ─── API payload shapes ──────────────────────────────────────────────────────

export interface ApiUser {
  id: string
  role: "patient" | "dentist"
  dentistId: string | null
  emailVerified: boolean
  isClinicAdmin: boolean
  name: string
  email: string
  phone: string
  photoDataUrl: string | null
}

export type MailMode = "preview" | "smtp" | "none"

export interface Slot {
  time: string
  available: boolean
}

export interface Schedule {
  days: AvailabilityDay[]
  blockedDates: string[]
}

// ─── Time & Mappers ──────────────────────────────────────────────────────────

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]

const SERVICE_DISPLAY_ORDER = [
  "checkup",
  "cleaning",
  "filling",
  "extraction",
  "whitening",
  "wisdom",
  "partial-dentures",
  "full-dentures",
  "pediatric",
  "veneers",
  "braces-combo",
  "braces-install",
  "retainer",
]

const CATEGORIES_KNOWN: ServiceCategory[] = ["General Dentistry", "Orthodontics"]

export function prettyTime(timeStr: string): string {
  const amPm = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i)
  if (amPm) {
    return `${Number(amPm[1])}:${amPm[2]} ${amPm[3].toUpperCase()}`
  }
  const parts = timeStr.split(":")
  const h = parseInt(parts[0], 10)
  const m = parts[1] || "00"
  if (Number.isNaN(h)) return timeStr
  const period = h < 12 ? "AM" : "PM"
  const hour = h % 12 || 12
  return `${hour}:${m} ${period}`
}

export function timeToSql(timeStr: string): string {
  const amPm = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i)
  if (amPm) {
    const h = parseInt(amPm[1], 10)
    const m = parseInt(amPm[2], 10)
    if (h < 1 || h > 12 || m > 59) throw new ApiError(400, "Invalid time.")
    const total = (h % 12 + (amPm[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + m
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`
  }
  const sql = timeStr.match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (sql) {
    const h = parseInt(sql[1], 10)
    const m = parseInt(sql[2], 10)
    if (h < 24 && m < 60) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
    }
  }
  throw new ApiError(400, "Invalid time.")
}

async function resolveAvatarUrl(
  role: "patient" | "dentist",
  avatarPath: string | null,
  dentistId: string | null,
): Promise<string | null> {
  if (role === "dentist" && dentistId) {
    const { data: dentist } = await supabase
      .from("dentists")
      .select("photo_url")
      .eq("id", dentistId)
      .maybeSingle()
    if (dentist?.photo_url) return dentist.photo_url
  }
  if (!avatarPath) return null
  if (role === "dentist") {
    const { data } = supabase.storage.from("dentist-photos").getPublicUrl(avatarPath)
    return data.publicUrl || null
  }
  const { data } = await supabase.storage
    .from("avatars")
    .createSignedUrl(avatarPath, 3600)
  return data?.signedUrl ?? null
}

async function loadCurrentUser(): Promise<ApiUser | null> {
  assertConfigured()
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !authUser) return null

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle()
  if (profError || !profile) return null

  const photoDataUrl = await resolveAvatarUrl(
    profile.role,
    profile.avatar_path,
    profile.dentist_id,
  )

  return {
    id: profile.id,
    role: profile.role,
    dentistId: profile.dentist_id,
    emailVerified:
      profile.role === "dentist" || Boolean(authUser.email_confirmed_at),
    isClinicAdmin: profile.role === "dentist" && profile.is_clinic_admin === true,
    name: profile.full_name,
    email: profile.email || authUser.email || "",
    phone: profile.phone || "",
    photoDataUrl,
  }
}

function toService(row: any): Service {
  const category = CATEGORIES_KNOWN.includes(row.category)
    ? (row.category as ServiceCategory)
    : "General Dentistry"
  return {
    id: row.id,
    name: row.name,
    category,
    duration: Number(row.duration_minutes),
    price: Number(row.price),
    icon: row.icon ?? "🦷",
    description: row.description ?? "",
    involves: Array.isArray(row.involves) ? row.involves : [],
    preparation: row.preparation ?? "",
  }
}

export function toAppointment(row: any): Appointment {
  return {
    id: row.id,
    reference: row.reference,
    serviceId: row.service_id ?? row.serviceId,
    serviceName: row.services?.name ?? row.serviceName ?? "",
    dentistId: row.dentist_id ?? row.dentistId,
    dentistName: row.dentists?.name ?? row.dentistName ?? "",
    date: row.appointment_date ?? row.date,
    time: prettyTime(row.start_time ?? row.time),
    duration: Number(row.duration_minutes ?? row.duration),
    price: Number(row.price),
    status: row.status,
    patientName: row.profiles?.full_name ?? row.patientName ?? "",
    patientId: row.patient_id ?? row.patientId,
    createdAt: row.created_at ?? row.createdAt,
    declineReason: (row.decline_reason ?? row.declineReason) || undefined,
  }
}

async function fetchAppointmentById(id: string): Promise<Appointment> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "*, services(name), dentists(name), profiles!appointments_patient_id_fkey(full_name)",
    )
    .eq("id", id)
    .single()
  if (error || !data) {
    raiseRpcError(error, "Appointment could not be loaded.")
  }
  return toAppointment(data)
}

// ─── Client-side resend / recovery throttle (defends Supabase Free email quota) ──

const RESEND_COOLDOWN_MS = 60_000
const lastEmailRequestByKey = new Map<string, number>()

function checkEmailCooldown(key: string) {
  const now = Date.now()
  const prev = lastEmailRequestByKey.get(key)
  if (prev && now - prev < RESEND_COOLDOWN_MS) {
    const secs = Math.ceil((RESEND_COOLDOWN_MS - (now - prev)) / 1000)
    throw new ApiError(
      429,
      `Please wait ${secs} seconds before requesting another email.`,
    )
  }
  lastEmailRequestByKey.set(key, now)
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const api = {
  health: async () => {
    assertConfigured()
    const { error } = await supabase.from("services").select("id").limit(1)
    if (error) raiseRpcError(error, NETWORK_ERROR_MESSAGE)
    return { status: "ok", database: "connected" }
  },

  // ── Authentication ────────────────────────────────────────────────────────
  me: async (): Promise<ApiUser> => {
    const user = await loadCurrentUser()
    if (!user) {
      throw new ApiError(401, "Please log in.", { code: "NOT_AUTHENTICATED" })
    }
    return user
  },

  login: async (email: string, password: string): Promise<ApiUser> => {
    assertConfigured()
    const cleanEmail = email.trim().toLowerCase()
    if (!emailLooksValid(cleanEmail) || !password || password.length > 128) {
      throw new ApiError(400, "Enter a valid email and password.")
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })
    if (error || !data.user) {
      const msg = /invalid login credentials/i.test(error?.message ?? "")
        ? "Incorrect email or password."
        : /email not confirmed/i.test(error?.message ?? "")
          ? "Please verify your email address before logging in. Check your inbox for the verification link."
          : error?.message || "Incorrect email or password."
      throw new ApiError(401, msg)
    }
    const user = await loadCurrentUser()
    if (!user) {
      throw new ApiError(500, "Account profile could not be loaded.")
    }
    return user
  },

  register: async (data: {
    name: string
    email: string
    phone: string
    password: string
    confirmPassword: string
    acceptedTerms: boolean
  }) => {
    assertConfigured()
    const name = data.name.trim()
    const email = data.email.trim().toLowerCase()
    const phone = data.phone.trim()

    if (name.length < 2) throw new ApiError(400, "Enter your full name.")
    if (!emailLooksValid(email)) throw new ApiError(400, "Enter a valid email address.")
    if (!phoneLooksValid(phone)) {
      throw new ApiError(
        400,
        "Enter a valid Philippine phone number, for example 0917 123 4567.",
      )
    }
    const problem = passwordProblem(data.password, email)
    if (problem) throw new ApiError(400, problem)
    if (data.password !== data.confirmPassword) {
      throw new ApiError(400, "Passwords do not match.")
    }
    if (data.acceptedTerms !== true) {
      throw new ApiError(
        400,
        "You must accept the Terms and Privacy Policy to create an account.",
      )
    }

    checkEmailCooldown(`signup:${email}`)

    const { data: res, error } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        data: {
          full_name: name,
          phone,
        },
        emailRedirectTo: `${siteUrl()}/auth/confirm?flow=signup`,
      },
    })

    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        throw new ApiError(
          409,
          "An account with this email address already exists. Try logging in or resetting your password.",
        )
      }
      throw new ApiError(400, error.message)
    }

    // Supabase obfuscated duplicate user detection (identities is empty array)
    if (res.user && Array.isArray(res.user.identities) && res.user.identities.length === 0) {
      throw new ApiError(
        409,
        "An account with this email address already exists. Try logging in or resetting your password.",
      )
    }

    return {
      message:
        "Account created. Please verify your email address to start booking.",
      emailVerificationRequired: true,
      mailMode: "smtp" as MailMode,
    }
  },

  verifyEmail: async (_token: string) => {
    return {
      message: "Your email address is verified. You can now book appointments.",
    }
  },

  resendVerification: async (rawEmail: string) => {
    assertConfigured()
    const email = rawEmail.trim().toLowerCase()
    if (emailLooksValid(email)) {
      checkEmailCooldown(`resend:${email}`)
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${siteUrl()}/auth/confirm?flow=signup`,
        },
      })
      if (error && /rate limit|too many/i.test(error.message)) {
        throw new ApiError(
          429,
          "Too many requests. Please wait a few minutes and try again.",
        )
      }
    }
    return {
      message:
        "If that account exists and still needs verification, we have sent a new verification email. Please check your inbox (and spam folder).",
      mailMode: "smtp" as MailMode,
    }
  },

  forgotPassword: async (rawEmail: string) => {
    assertConfigured()
    const email = rawEmail.trim().toLowerCase()
    if (emailLooksValid(email)) {
      checkEmailCooldown(`reset:${email}`)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl()}/auth/confirm?flow=recovery`,
      })
      if (error && /rate limit|too many/i.test(error.message)) {
        throw new ApiError(
          429,
          "Too many requests. Please wait a few minutes and try again.",
        )
      }
    }
    return {
      message:
        "If that email address is registered, we have sent instructions. Please check your inbox (and spam folder).",
      mailMode: "smtp" as MailMode,
    }
  },

  resetPassword: async (_token: string, newPassword: string) => {
    assertConfigured()
    const problem = passwordProblem(newPassword)
    if (problem) throw new ApiError(400, problem)

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      throw new ApiError(
        400,
        /session|expired|invalid|auth/i.test(error.message)
          ? "This link is invalid, has already been used, or has expired. Please request a new one."
          : error.message,
      )
    }
    await supabase.auth.signOut().catch(() => undefined)
    return {
      message:
        "Your password has been changed. Please log in with your new password.",
    }
  },

  mailMode: async (): Promise<MailMode> => "smtp",
  devMailPreview: async (_to: string) =>
    [] as { subject: string; links: string[]; at: string }[],

  logout: async () => {
    if (!supabaseConfigError) {
      await supabase.auth.signOut()
    }
    return { ok: true }
  },

  // ── Public Catalog ────────────────────────────────────────────────────────
  services: async (): Promise<Service[]> => {
    assertConfigured()
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("is_active", true)
      .order("name")
    if (error) raiseRpcError(error, NETWORK_ERROR_MESSAGE)
    const list = (data ?? []).map(toService)
    const rank = (id: string) => {
      const index = SERVICE_DISPLAY_ORDER.indexOf(id)
      return index === -1 ? SERVICE_DISPLAY_ORDER.length : index
    }
    return list.sort(
      (a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name),
    )
  },

  dentists: async (): Promise<Dentist[]> => {
    assertConfigured()
    const [
      { data: dentistRows, error: dErr },
      { data: links, error: lErr },
      { data: schedules, error: sErr },
    ] = await Promise.all([
      supabase.from("dentists").select("*").eq("is_active", true).order("name"),
      supabase
        .from("dentist_services")
        .select("dentist_id, service_id, services(name)"),
      supabase.from("dentist_schedules").select("*").order("day_of_week"),
    ])
    if (dErr) raiseRpcError(dErr, NETWORK_ERROR_MESSAGE)
    if (lErr) raiseRpcError(lErr, NETWORK_ERROR_MESSAGE)
    if (sErr) raiseRpcError(sErr, NETWORK_ERROR_MESSAGE)

    const order = ["santos", "reyes"]
    const rank = (id: string) => {
      const index = order.indexOf(id)
      return index === -1 ? order.length : index
    }

    return (dentistRows ?? [])
      .map((d): Dentist => {
        const dSchedules = (schedules ?? []).filter((s) => s.dentist_id === d.id)
        const availableDays = dSchedules
          .filter((s) => s.available)
          .map((s) => DAYS[s.day_of_week])
        const dServices = (links ?? [])
          .filter((l: any) => l.dentist_id === d.id)
          .map((l: any) => l.services?.name ?? "")
          .filter(Boolean)
        return {
          id: d.id,
          name: d.name,
          title: d.title,
          specialty: d.specialty,
          experience: Number(d.experience_years),
          bio: d.bio,
          availableDays,
          hours: "See weekly availability",
          services: dServices,
          nextAvailable: "See live availability",
          photo: d.photo_url ?? "",
        }
      })
      .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
  },

  schedule: async (dentistId: string): Promise<Schedule> => {
    assertConfigured()
    const [
      { data: schedRows, error: sErr },
      { data: blockedRows, error: bErr },
    ] = await Promise.all([
      supabase
        .from("dentist_schedules")
        .select("*")
        .eq("dentist_id", dentistId)
        .order("day_of_week"),
      supabase
        .from("blocked_dates")
        .select("block_date")
        .eq("dentist_id", dentistId)
        .order("block_date"),
    ])
    if (sErr) raiseRpcError(sErr)
    if (bErr) raiseRpcError(bErr)

    const days: AvailabilityDay[] = DAYS.map((day, i) => {
      const sched = (schedRows ?? []).find((s) => s.day_of_week === i)
      return {
        day,
        available: sched?.available ?? false,
        start: sched ? prettyTime(sched.start_time) : "9:00 AM",
        end: sched ? prettyTime(sched.end_time) : "5:00 PM",
        breakStart: sched?.break_start ? prettyTime(sched.break_start) : undefined,
        breakEnd: sched?.break_end ? prettyTime(sched.break_end) : undefined,
      }
    })

    return {
      days,
      blockedDates: (blockedRows ?? []).map((r) => r.block_date),
    }
  },

  slots: async (query: {
    dentistId: string
    serviceId: string
    date: string
    excludeAppointmentId?: string | null
  }): Promise<Slot[]> => {
    assertConfigured()
    const { data, error } = await supabase.rpc("get_available_slots", {
      p_dentist_id: query.dentistId,
      p_service_id: query.serviceId,
      p_date: query.date,
      p_exclude_appointment_id: query.excludeAppointmentId ?? null,
    })
    if (error) raiseRpcError(error)
    return (data ?? []).map((row) => ({
      time: prettyTime(row.slot_time),
      available: Boolean(row.available),
    }))
  },

  // ── Appointments ──────────────────────────────────────────────────────────
  appointments: async (): Promise<Appointment[]> => {
    assertConfigured()
    const { data, error } = await supabase
      .from("appointments")
      .select(
        "*, services(name), dentists(name), profiles!appointments_patient_id_fkey(full_name)",
      )
      .order("appointment_date", { ascending: false })
      .order("start_time", { ascending: false })
    if (error) raiseRpcError(error)
    return (data ?? []).map(toAppointment)
  },

  createAppointment: async (input: {
    serviceId: string
    dentistId: string
    date: string
    time: string
  }): Promise<Appointment> => {
    assertConfigured()
    const { data: appointmentId, error } = await supabase.rpc(
      "book_appointment",
      {
        p_service_id: input.serviceId,
        p_dentist_id: input.dentistId,
        p_date: input.date,
        p_time: timeToSql(input.time),
      },
    )
    if (error || !appointmentId) raiseRpcError(error, "Booking failed.")
    return fetchAppointmentById(appointmentId)
  },

  rescheduleAppointment: async (
    id: string,
    input: { serviceId: string; dentistId: string; date: string; time: string },
  ): Promise<Appointment> => {
    assertConfigured()
    const { data: appointmentId, error } = await supabase.rpc(
      "reschedule_appointment",
      {
        p_appointment_id: id,
        p_service_id: input.serviceId,
        p_dentist_id: input.dentistId,
        p_date: input.date,
        p_time: timeToSql(input.time),
      },
    )
    if (error || !appointmentId) raiseRpcError(error, "Rescheduling failed.")
    return fetchAppointmentById(appointmentId)
  },

  cancelAppointment: async (id: string): Promise<Appointment> => {
    assertConfigured()
    const { error } = await supabase.rpc("cancel_appointment", {
      p_appointment_id: id,
    })
    if (error) raiseRpcError(error, "Cancellation failed.")
    return fetchAppointmentById(id)
  },

  setAppointmentStatus: async (
    id: string,
    status: AppointmentStatus,
    declineReason?: string,
  ): Promise<Appointment> => {
    assertConfigured()
    const { error } = await supabase.rpc("set_appointment_status", {
      p_appointment_id: id,
      p_status: status,
      p_decline_reason: declineReason ?? null,
    })
    if (error) raiseRpcError(error, "Status update failed.")
    return fetchAppointmentById(id)
  },

  // ── Dentist Schedule & Blocked Dates ──────────────────────────────────────
  saveSchedule: async (
    dentistId: string,
    days: AvailabilityDay[],
  ): Promise<Schedule> => {
    assertConfigured()
    if (!Array.isArray(days) || days.length !== 7) {
      throw new ApiError(
        400,
        "Provide seven valid working-day schedules and break ranges.",
      )
    }
    const payload = DAYS.map((dayName) => {
      const d = days.find((item) => item.day === dayName)
      if (!d) {
        throw new ApiError(
          400,
          "Provide seven valid working-day schedules and break ranges.",
        )
      }
      return {
        available: Boolean(d.available),
        start: timeToSql(d.start || "9:00 AM"),
        end: timeToSql(d.end || "5:00 PM"),
        breakStart: d.breakStart ? timeToSql(d.breakStart) : null,
        breakEnd: d.breakEnd ? timeToSql(d.breakEnd) : null,
      }
    })
    const { error } = await supabase.rpc("save_dentist_schedule", {
      p_dentist_id: dentistId,
      p_days: payload,
    })
    if (error) raiseRpcError(error, "Could not save schedule.")
    return api.schedule(dentistId)
  },

  addBlockedDate: async (dentistId: string, date: string) => {
    assertConfigured()
    const { error } = await supabase.rpc("add_blocked_date", {
      p_dentist_id: dentistId,
      p_date: date,
    })
    if (error) raiseRpcError(error, "Could not block date.")
    return { ok: true, date }
  },

  removeBlockedDate: async (dentistId: string, date: string) => {
    assertConfigured()
    const { error } = await supabase.rpc("remove_blocked_date", {
      p_dentist_id: dentistId,
      p_date: date,
    })
    if (error) raiseRpcError(error, "Could not remove blocked date.")
    return { ok: true }
  },

  // ── Profiles & Storage ────────────────────────────────────────────────────
  updateMe: async (data: { name: string; phone: string }) => {
    assertConfigured()
    const { data: updated, error } = await supabase.rpc("update_my_profile", {
      p_full_name: data.name,
      p_phone: data.phone,
    })
    if (error || !updated) raiseRpcError(error, "Could not update profile.")
    return {
      ok: true,
      name: updated.full_name,
      phone: updated.phone,
    }
  },

  setMyPhoto: async (dataUrl: string | null) => {
    assertConfigured()
    const user = await loadCurrentUser()
    if (!user) {
      unauthorizedHandler?.()
      throw new ApiError(401, "Please log in.")
    }
    const bucket = user.role === "dentist" ? "dentist-photos" : "avatars"

    if (!dataUrl) {
      const { data: existing } = await supabase.storage
        .from(bucket)
        .list(user.id)
      if (existing && existing.length > 0) {
        await supabase.storage
          .from(bucket)
          .remove(existing.map((f) => `${user.id}/${f.name}`))
      }
      const { error } = await supabase.rpc("set_my_avatar", {
        p_path: null,
        p_public_url: null,
      })
      if (error) raiseRpcError(error)
      return { ok: true, photoDataUrl: null }
    }

    const match = dataUrl.match(
      /^data:(image\/(jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/,
    )
    if (!match || dataUrl.length > 350000) {
      throw new ApiError(400, "Use a JPEG, PNG or WebP photo under 250 KB.")
    }
    const contentType = match[1]
    const ext = match[2] === "jpeg" ? "jpg" : match[2]
    const raw = atob(match[3])
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    if (bytes.length > 256000) {
      throw new ApiError(400, "Photo is too large.")
    }

    const filePath = `${user.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, bytes, { contentType, upsert: true })
    if (uploadError) {
      throw new ApiError(400, uploadError.message)
    }

    let publicUrl: string | null = null
    if (user.role === "dentist") {
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
      publicUrl = data.publicUrl
    }

    const { error: rpcError } = await supabase.rpc("set_my_avatar", {
      p_path: filePath,
      p_public_url: publicUrl,
    })
    if (rpcError) raiseRpcError(rpcError)

    const displayUrl =
      user.role === "dentist"
        ? publicUrl
        : (
            await supabase.storage
              .from("avatars")
              .createSignedUrl(filePath, 3600)
          ).data?.signedUrl ?? dataUrl

    return { ok: true, photoDataUrl: displayUrl }
  },

  updateDentistProfile: async (
    dentistId: string,
    data: {
      name: string
      title: string
      specialty: string
      bio: string
      experience?: number
    },
  ) => {
    assertConfigured()
    const { error } = await supabase.rpc("update_dentist_profile", {
      p_dentist_id: dentistId,
      p_name: data.name,
      p_title: data.title,
      p_specialty: data.specialty,
      p_bio: data.bio,
      p_experience: data.experience ?? null,
    })
    if (error) raiseRpcError(error, "Could not update dentist profile.")
    return { ok: true }
  },

  // ── Privileged Clinic Administrator Operations (Dr. Maria Santos) ─────────
  provisionDentist: async (input: {
    email: string
    dentistId: string
    name: string
    title?: string
    specialty?: string
    isClinicAdmin?: boolean
  }) => {
    assertConfigured()
    const { data, error } = await supabase.functions.invoke(
      "provision-dentist",
      { body: input },
    )
    if (error) {
      throw new ApiError(400, error.message || "Could not provision dentist account.")
    }
    if (data?.error) {
      throw new ApiError(400, String(data.error))
    }
    return data as {
      ok: boolean
      userId: string
      dentistId: string
      message: string
    }
  },
}
