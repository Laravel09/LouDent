export type Screen = "landing" | "signup" | "patient-login" | "admin-login" | "about" | "contact" | "patient-home" | "services" | "service-detail" | "dentists" | "dentist-profile" | "my-appointments" | "appointment-detail" | "profile" | "edit-profile" | "settings" | "admin-settings" | "book-category" | "book-service" | "book-dentist" | "book-date" | "book-time" | "book-summary" | "book-success" | "admin-dashboard" | "admin-appointments" | "admin-appointment-detail" | "admin-availability" | "admin-profile" | "forgot-password" | "reset-password" | "verify-email"

export type AppointmentStatus = "Pending" | "Confirmed" | "Completed" | "Cancelled" | "Declined"

export interface Service {
  id: string
  name: string
  category: ServiceCategory
  duration: number
  price: number
  icon: string
  description: string
  involves: string[]
  preparation: string
}

export interface Dentist {
  id: string
  name: string
  title: string
  specialty: string
  experience: number
  bio: string
  availableDays: string[]
  hours: string
  services: string[]
  nextAvailable: string
  photo: string
}

export interface Appointment {
  id: string
  reference: string
  serviceId: string
  serviceName: string
  dentistId: string
  dentistName: string
  date: string
  time: string
  duration: number
  price: number
  status: AppointmentStatus
  patientName: string
  patientId?: string
  createdAt?: string
  declineReason?: string
}

export interface BookingState {
  categoryId: string | null
  serviceId: string | null
  dentistId: string | null
  date: string | null
  time: string | null
  rescheduleAppointmentId?: string | null
}

export interface PatientProfile {
  name: string
  email: string
  phone: string
  photoDataUrl?: string
}

export type ServiceCategory = "General Dentistry" | "Orthodontics"

export const CATEGORIES: {
  id: ServiceCategory
  icon: string
  description: string
}[] = [
  {
    id: "General Dentistry",
    icon: "🦷",
    description:
      "Check-ups, cleanings, fillings, extractions, whitening, dentures, pediatric care, and more.",
  },
  {
    id: "Orthodontics",
    icon: "😁",
    description:
      "Braces consultation, installation, adjustments, and retainers for tooth alignment.",
  },
]

export interface AvailabilityDay {
  day: string
  available: boolean
  start: string
  end: string
  breakStart?: string
  breakEnd?: string
}
// Services, dentists, schedules and appointments are NOT defined here any more:
// they are loaded from the database-backed API (see src/api/client.ts).

/** Editing template only (used when a dentist has no schedule rows yet). Not a data source. */
export const WEEKLY_AVAILABILITY: AvailabilityDay[] = [
  { day: "Monday", available: true, start: "9:00 AM", end: "5:00 PM" },
  { day: "Tuesday", available: true, start: "9:00 AM", end: "5:00 PM" },
  { day: "Wednesday", available: false, start: "9:00 AM", end: "5:00 PM" },
  { day: "Thursday", available: true, start: "9:00 AM", end: "5:00 PM" },
  { day: "Friday", available: true, start: "9:00 AM", end: "3:00 PM" },
  { day: "Saturday", available: false, start: "9:00 AM", end: "5:00 PM" },
  { day: "Sunday", available: false, start: "9:00 AM", end: "5:00 PM" },
]
