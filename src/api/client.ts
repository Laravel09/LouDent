// Supabase-backed client for LouDent.
// Replaces the Express/MariaDB API client. All calls go directly to Supabase.
// Authentication is managed by Supabase Auth (JWT + localStorage session).

import { supabase } from '../lib/supabase'
import type {
  Appointment,
  AppointmentStatus,
  AvailabilityDay,
  Dentist,
  Service,
  ServiceCategory,
} from '../types'

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number
  code?: string
  requestId?: string
  constructor(status: number, message: string, extra: { code?: string; requestId?: string } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = extra.code
    this.requestId = extra.requestId
  }
}

export const NETWORK_ERROR_MESSAGE =
  'Cannot reach the LouDent server. Check your internet connection and try again.'

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// ─── Supabase error helper ───────────────────────────────────────────────────

function handleError(error: any, fallback = 'An unexpected error occurred.'): never {
  const message = error?.message || fallback
  const status = error?.code === 'PGRST301' ? 401 : error?.code === '42501' ? 403 : 400
  if (status === 401) unauthorizedHandler?.()
  throw new ApiError(status, message)
}

// ─── API User type ───────────────────────────────────────────────────────────

export interface ApiUser {
  id: string
  role: 'patient' | 'dentist'
  dentistId: string | null
  emailVerified: boolean
  isClinicAdmin: boolean
  name: string
  email: string
  phone: string
  photoDataUrl: string | null
}

export type MailMode = 'preview' | 'smtp' | 'none'

export interface Slot {
  time: string
  available: boolean
}

export interface Schedule {
  days: AvailabilityDay[]
  blockedDates: string[]
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const SERVICE_DISPLAY_ORDER = [
  'checkup', 'cleaning', 'filling', 'extraction', 'whitening', 'wisdom',
  'partial-dentures', 'full-dentures', 'pediatric', 'veneers',
  'braces-combo', 'braces-install', 'retainer',
]

const CATEGORIES_KNOWN: ServiceCategory[] = ['General Dentistry', 'Orthodontics']

function prettyTime(timeStr: string): string {
  // Convert HH:MM:SS or HH:MM to 12h format
  const parts = timeStr.split(':')
  const h = parseInt(parts[0], 10)
  const m = parts[1] || '00'
  const period = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 || 12
  return `${hour}:${m} ${period}`
}

function timeToMinutes(timeStr: string): number {
  // Handle "HH:MM:SS" or "HH:MM" or "H:MM AM/PM"
  const amPm = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i)
  if (amPm) {
    const h = parseInt(amPm[1], 10)
    const m = parseInt(amPm[2], 10)
    return (h % 12 + (amPm[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + m
  }
  const parts = timeStr.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

async function profileToApiUser(): Promise<ApiUser | null> {
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!profile) return null

  return {
    id: profile.id,
    role: profile.role as 'patient' | 'dentist',
    dentistId: profile.dentist_id,
    emailVerified: !!authUser.email_confirmed_at,
    isClinicAdmin: profile.is_clinic_admin,
    name: profile.full_name,
    email: profile.email,
    phone: profile.phone || '',
    photoDataUrl: profile.avatar_url,
  }
}

function toService(row: any): Service {
  const category = CATEGORIES_KNOWN.includes(row.category) ? row.category : 'General Dentistry'
  return {
    id: row.id,
    name: row.name,
    category,
    duration: row.duration_minutes,
    price: Number(row.price),
    icon: row.icon || '🦷',
    description: row.description || '',
    involves: Array.isArray(row.involves) ? row.involves : [],
    preparation: row.preparation || '',
  }
}

function toAppointment(row: any): Appointment {
  return {
    id: row.id,
    reference: row.reference,
    serviceId: row.service_id,
    serviceName: row.services?.name || '',
    dentistId: row.dentist_id,
    dentistName: row.dentists?.name || '',
    date: row.appointment_date,
    time: prettyTime(row.start_time),
    duration: row.duration_minutes,
    price: Number(row.price),
    status: row.status,
    patientName: row.profiles?.full_name || '',
    patientId: row.patient_id,
    createdAt: row.created_at,
    declineReason: row.decline_reason || undefined,
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const api = {
  health: async () => ({ status: 'ok', database: 'supabase' }),

  // ── Auth ─────────────────────────────────────────────────────────────────
  me: async (): Promise<ApiUser> => {
    const user = await profileToApiUser()
    if (!user) throw new ApiError(401, 'Not authenticated', { code: 'NOT_AUTHENTICATED' })
    return user
  },

  login: async (email: string, password: string): Promise<ApiUser> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw new ApiError(401, error.message === 'Invalid login credentials'
      ? 'Incorrect email or password.' : error.message)
    if (!data.user) throw new ApiError(401, 'Login failed.')

    const user = await profileToApiUser()
    if (!user) throw new ApiError(500, 'Profile not found after login.')
    return user
  },

  register: async (input: {
    name: string
    email: string
    phone: string
    password: string
    confirmPassword: string
    acceptedTerms: boolean
  }) => {
    if (!input.acceptedTerms) {
      throw new ApiError(400, 'You must accept the Terms and Privacy Policy to create an account.')
    }
    if (input.password !== input.confirmPassword) {
      throw new ApiError(400, 'Passwords do not match.')
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        data: {
          full_name: input.name.trim(),
          phone: input.phone.trim(),
          role: 'patient',
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      if (error.message.includes('already registered')) {
        throw new ApiError(409, 'An account with this email address already exists. Try logging in or resetting your password.')
      }
      throw new ApiError(400, error.message)
    }

    return {
      message: 'Account created. Please verify your email address to start booking.',
      emailVerificationRequired: true,
      mailMode: 'smtp' as MailMode,
    }
  },

  // Supabase Auth handles verification internally via email links
  verifyEmail: async (_token: string) => {
    return { message: 'Your email address is verified. You can now book appointments.' }
  },

  resendVerification: async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw new ApiError(400, error.message)
    return {
      message: 'If that account exists and still needs verification, we have sent a new verification email.',
      mailMode: 'smtp' as MailMode,
    }
  },

  forgotPassword: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/callback?type=recovery` }
    )
    if (error) throw new ApiError(400, error.message)
    return {
      message: 'If that email address is registered, we have sent instructions. Please check your inbox (and spam folder).',
      mailMode: 'smtp' as MailMode,
    }
  },

  resetPassword: async (_token: string, password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new ApiError(400, error.message)
    return { message: 'Your password has been changed. Please log in with your new password.' }
  },

  mailMode: async () => 'smtp' as MailMode,
  devMailPreview: async (_to: string) => [] as any[],

  logout: async () => {
    await supabase.auth.signOut()
    return { ok: true }
  },

  // ── Public Catalog ───────────────────────────────────────────────────────
  services: async (): Promise<Service[]> => {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name')
    if (error) handleError(error)
    const list = (data || []).map(toService)
    const rank = (id: string) => {
      const index = SERVICE_DISPLAY_ORDER.indexOf(id)
      return index === -1 ? SERVICE_DISPLAY_ORDER.length : index
    }
    return list.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
  },

  dentists: async (): Promise<Dentist[]> => {
    const { data: dentistRows, error: dErr } = await supabase
      .from('dentists')
      .select('*')
      .order('name')
    if (dErr) handleError(dErr)

    const { data: links } = await supabase
      .from('dentist_services')
      .select('dentist_id, service_id, services(name)')

    const { data: schedules } = await supabase
      .from('dentist_schedules')
      .select('*')
      .order('day_of_week')

    const order = ['santos', 'reyes']
    const rank = (id: string) => { const i = order.indexOf(id); return i === -1 ? order.length : i }

    return (dentistRows || []).map(d => {
      const dSchedules = (schedules || []).filter(s => s.dentist_id === d.id)
      const availableDays = dSchedules.filter(s => s.available).map(s => DAYS[s.day_of_week])
      const dServices = (links || [])
        .filter((l: any) => l.dentist_id === d.id)
        .map((l: any) => l.services?.name || '')
        .filter(Boolean)

      return {
        id: d.id,
        name: d.name,
        title: d.title,
        specialty: d.specialty,
        experience: d.experience_years,
        bio: d.bio,
        availableDays,
        hours: 'See weekly availability',
        services: dServices,
        nextAvailable: 'See live availability',
        photo: d.photo_url || '',
      } as Dentist
    }).sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
  },

  schedule: async (dentistId: string): Promise<Schedule> => {
    const { data: schedRows } = await supabase
      .from('dentist_schedules')
      .select('*')
      .eq('dentist_id', dentistId)
      .order('day_of_week')

    const { data: blockedRows } = await supabase
      .from('blocked_dates')
      .select('block_date')
      .eq('dentist_id', dentistId)
      .order('block_date')

    const days: AvailabilityDay[] = DAYS.map((day, i) => {
      const sched = (schedRows || []).find(s => s.day_of_week === i)
      return {
        day,
        available: sched?.available ?? false,
        start: sched ? prettyTime(sched.start_time) : '9:00 AM',
        end: sched ? prettyTime(sched.end_time) : '5:00 PM',
        breakStart: sched?.break_start ? prettyTime(sched.break_start) : undefined,
        breakEnd: sched?.break_end ? prettyTime(sched.break_end) : undefined,
      }
    })

    return {
      days,
      blockedDates: (blockedRows || []).map(r => r.block_date),
    }
  },

  slots: async (query: {
    dentistId: string
    serviceId: string
    date: string
    excludeAppointmentId?: string | null
  }): Promise<Slot[]> => {
    const { data, error } = await supabase.rpc('get_available_slots', {
      p_dentist_id: query.dentistId,
      p_service_id: query.serviceId,
      p_date: query.date,
      p_exclude_appointment_id: query.excludeAppointmentId || null,
    })
    if (error) handleError(error)
    return (data || []).map((row: any) => ({
      time: prettyTime(row.slot_time),
      available: row.available,
    }))
  },

  // ── Appointments ─────────────────────────────────────────────────────────
  appointments: async (): Promise<Appointment[]> => {
    const user = await profileToApiUser()
    if (!user) throw new ApiError(401, 'Not authenticated')

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        services(name),
        dentists(name),
        profiles!appointments_patient_id_fkey(full_name)
      `)
      .order('appointment_date', { ascending: false })
      .order('start_time', { ascending: false })

    if (error) handleError(error)
    return (data || []).map((row: any) => ({
      id: row.id,
      reference: row.reference,
      serviceId: row.service_id,
      serviceName: row.services?.name || '',
      dentistId: row.dentist_id,
      dentistName: row.dentists?.name || '',
      date: row.appointment_date,
      time: prettyTime(row.start_time),
      duration: row.duration_minutes,
      price: Number(row.price),
      status: row.status,
      patientName: row.profiles?.full_name || '',
      patientId: row.patient_id,
      createdAt: row.created_at,
      declineReason: row.decline_reason || undefined,
    }))
  },

  createAppointment: async (input: {
    serviceId: string
    dentistId: string
    date: string
    time: string
  }): Promise<Appointment> => {
    const timeDb = minutesToTime(timeToMinutes(input.time))
    const { data: appointmentId, error } = await supabase.rpc('book_appointment', {
      p_service_id: input.serviceId,
      p_dentist_id: input.dentistId,
      p_date: input.date,
      p_time: timeDb,
    })
    if (error) {
      const msg = error.message || 'Booking failed'
      if (msg.includes('verify your email')) {
        const e = new ApiError(403, msg)
        e.code = 'EMAIL_NOT_VERIFIED'
        throw e
      }
      throw new ApiError(409, msg)
    }

    // Fetch the created appointment
    const { data: row } = await supabase
      .from('appointments')
      .select('*, services(name), dentists(name), profiles!appointments_patient_id_fkey(full_name)')
      .eq('id', appointmentId)
      .single()

    if (!row) throw new ApiError(500, 'Appointment created but could not be loaded')
    return toAppointment(row)
  },

  rescheduleAppointment: async (
    id: string,
    input: { serviceId: string; dentistId: string; date: string; time: string }
  ): Promise<Appointment> => {
    const timeDb = minutesToTime(timeToMinutes(input.time))
    const { error } = await supabase.rpc('reschedule_appointment', {
      p_appointment_id: id,
      p_service_id: input.serviceId,
      p_dentist_id: input.dentistId,
      p_date: input.date,
      p_time: timeDb,
    })
    if (error) throw new ApiError(409, error.message || 'Rescheduling failed')

    const { data: row } = await supabase
      .from('appointments')
      .select('*, services(name), dentists(name), profiles!appointments_patient_id_fkey(full_name)')
      .eq('id', id)
      .single()

    if (!row) throw new ApiError(500, 'Appointment rescheduled but could not be loaded')
    return toAppointment(row)
  },

  cancelAppointment: async (id: string): Promise<Appointment> => {
    const { error } = await supabase.rpc('cancel_appointment', {
      p_appointment_id: id,
    })
    if (error) throw new ApiError(409, error.message || 'Cancellation failed')

    const { data: row } = await supabase
      .from('appointments')
      .select('*, services(name), dentists(name), profiles!appointments_patient_id_fkey(full_name)')
      .eq('id', id)
      .single()

    if (!row) throw new ApiError(500, 'Appointment cancelled but could not be loaded')
    return toAppointment(row)
  },

  setAppointmentStatus: async (
    id: string,
    status: AppointmentStatus,
    declineReason?: string
  ): Promise<Appointment> => {
    const { error } = await supabase.rpc('update_appointment_status', {
      p_appointment_id: id,
      p_new_status: status,
      p_decline_reason: declineReason || null,
    })
    if (error) throw new ApiError(409, error.message || 'Status update failed')

    const { data: row } = await supabase
      .from('appointments')
      .select('*, services(name), dentists(name), profiles!appointments_patient_id_fkey(full_name)')
      .eq('id', id)
      .single()

    if (!row) throw new ApiError(500, 'Status updated but appointment could not be loaded')
    return toAppointment(row)
  },

  // ── Dentist Schedule ─────────────────────────────────────────────────────
  saveSchedule: async (dentistId: string, days: AvailabilityDay[]): Promise<Schedule> => {
    // Convert to the format the RPC expects
    const daysJson = DAYS.map((dayName, i) => {
      const d = days.find(x => x.day === dayName)
      return {
        available: d?.available ?? false,
        start: d?.start ? minutesToTime(timeToMinutes(d.start)) : '09:00:00',
        end: d?.end ? minutesToTime(timeToMinutes(d.end)) : '17:00:00',
        breakStart: d?.breakStart ? minutesToTime(timeToMinutes(d.breakStart)) : null,
        breakEnd: d?.breakEnd ? minutesToTime(timeToMinutes(d.breakEnd)) : null,
      }
    })

    const { error } = await supabase.rpc('save_dentist_schedule', {
      p_dentist_id: dentistId,
      p_days: daysJson,
    })
    if (error) throw new ApiError(409, error.message || 'Schedule save failed')
    return api.schedule(dentistId)
  },

  addBlockedDate: async (dentistId: string, date: string) => {
    // Check for active appointments first
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('dentist_id', dentistId)
      .eq('appointment_date', date)
      .in('status', ['Pending', 'Confirmed'])

    if (existing && existing.length > 0) {
      throw new ApiError(409, 'This date has active appointments. Resolve them first.')
    }

    const { error } = await supabase
      .from('blocked_dates')
      .upsert({ dentist_id: dentistId, block_date: date }, { onConflict: 'dentist_id,block_date' })
    if (error) throw new ApiError(400, error.message)

    // Audit log
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'blocked_date_added',
        resource_type: 'dentist',
        resource_id: dentistId,
        metadata: { date },
      })
    }

    return { ok: true, date }
  },

  removeBlockedDate: async (dentistId: string, date: string) => {
    const { error } = await supabase
      .from('blocked_dates')
      .delete()
      .eq('dentist_id', dentistId)
      .eq('block_date', date)
    if (error) throw new ApiError(400, error.message)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'blocked_date_removed',
        resource_type: 'dentist',
        resource_id: dentistId,
        metadata: { date },
      })
    }

    return { ok: true }
  },

  // ── Profiles ─────────────────────────────────────────────────────────────
  updateMe: async (data: { name: string; phone: string }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new ApiError(401, 'Not authenticated')

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: data.name, phone: data.phone })
      .eq('id', user.id)
    if (error) throw new ApiError(400, error.message)

    return { ok: true, name: data.name, phone: data.phone }
  },

  setMyPhoto: async (dataUrl: string | null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new ApiError(401, 'Not authenticated')

    let avatarUrl: string | null = null

    if (dataUrl) {
      // Upload to Supabase Storage
      const base64Data = dataUrl.split(',')[1]
      if (!base64Data) throw new ApiError(400, 'Invalid image data')

      const mimeMatch = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,/)
      if (!mimeMatch) throw new ApiError(400, 'Use a JPEG, PNG or WebP photo.')

      const extension = mimeMatch[2] === 'jpeg' ? 'jpg' : mimeMatch[2]
      const filePath = `${user.id}/avatar.${extension}`

      // Convert base64 to Uint8Array
      const byteCharacters = atob(base64Data)
      const byteArray = new Uint8Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i)
      }

      if (byteArray.length > 256000) throw new ApiError(400, 'Photo is too large.')

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, byteArray, {
          contentType: mimeMatch[1],
          upsert: true,
        })

      if (uploadError) throw new ApiError(400, uploadError.message)

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
      avatarUrl = urlData.publicUrl + '?v=' + Date.now() // cache bust
    }

    // Update profile
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id)
    if (error) throw new ApiError(400, error.message)

    // If dentist, also update dentist photo
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, dentist_id')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'dentist' && profile.dentist_id) {
      await supabase
        .from('dentists')
        .update({ photo_url: avatarUrl })
        .eq('id', profile.dentist_id)
    }

    return { ok: true, photoDataUrl: avatarUrl }
  },

  updateDentistProfile: async (
    dentistId: string,
    data: {
      name: string
      title: string
      specialty: string
      bio: string
      experience?: number
    }
  ) => {
    const updateData: any = {
      name: data.name,
      specialty: data.specialty,
      bio: data.bio,
      title: data.title,
    }
    if (data.experience !== undefined) {
      updateData.experience_years = data.experience
    }

    const { error } = await supabase
      .from('dentists')
      .update(updateData)
      .eq('id', dentistId)
    if (error) throw new ApiError(400, error.message)

    // Also update user profile name
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ full_name: data.name })
        .eq('id', user.id)
    }

    return { ok: true }
  },
}

// Re-export toAppointment for compatibility
export { toAppointment }
