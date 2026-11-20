import { describe, it, expect } from "vitest"
import { supabase, supabaseConfigError } from "../lib/supabase"
import {
  emailLooksValid,
  passwordProblem,
  phoneLooksValid,
} from "../api/validation"
import {
  ApiError,
  errorMessage,
  prettyTime,
  timeToSql,
  toAppointment,
} from "../api/client"

describe("LouDent frontend validation & Supabase client mappers", () => {
  it("validates Philippine mobile and landline numbers", () => {
    expect(phoneLooksValid("0917 123 4567")).toBe(true)
    expect(phoneLooksValid("+63 917 123 4567")).toBe(true)
    expect(phoneLooksValid("032 234 5678")).toBe(true)
    expect(phoneLooksValid("12345")).toBe(false)
    expect(phoneLooksValid("+1 555 123 4567")).toBe(false)
  })

  it("enforces password strength rules and blocks email username reuse", () => {
    expect(passwordProblem("short1")).toMatch(/at least 8/)
    expect(passwordProblem("alllettersonly")).toMatch(/letter and one number/)
    expect(passwordProblem("maria12345", "maria@example.com")).toMatch(
      /email name/,
    )
    expect(passwordProblem("StrongPass99!", "maria@example.com")).toBeNull()
  })

  it("validates email addresses", () => {
    expect(emailLooksValid("patient@loudent.ph")).toBe(true)
    expect(emailLooksValid("not-an-email")).toBe(false)
  })

  it("converts between 12-hour UI slot strings and SQL TIME values", () => {
    expect(timeToSql("9:00 AM")).toBe("09:00:00")
    expect(timeToSql("1:00 PM")).toBe("13:00:00")
    expect(timeToSql("16:00:00")).toBe("16:00:00")
    expect(prettyTime("09:00:00")).toBe("9:00 AM")
    expect(prettyTime("13:00:00")).toBe("1:00 PM")
    expect(prettyTime("4:00 PM")).toBe("4:00 PM")
  })

  it("maps PostgreSQL appointment rows with joined service/dentist/profile into UI Appointment", () => {
    const mapped = toAppointment({
      id: "11111111-2222-3333-4444-555555555555",
      reference: "LD-TEST-0001",
      patient_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      dentist_id: "santos",
      service_id: "checkup",
      appointment_date: "2026-12-01",
      start_time: "14:00:00",
      duration_minutes: 30,
      price: "500.00",
      status: "Confirmed",
      decline_reason: null,
      created_at: "2026-11-20T00:00:00Z",
      services: { name: "Dental Check-up" },
      dentists: { name: "Dr. Maria Santos" },
      profiles: { full_name: "Juan Dela Cruz" },
    })
    expect(mapped).toEqual({
      id: "11111111-2222-3333-4444-555555555555",
      reference: "LD-TEST-0001",
      serviceId: "checkup",
      serviceName: "Dental Check-up",
      dentistId: "santos",
      dentistName: "Dr. Maria Santos",
      date: "2026-12-01",
      time: "2:00 PM",
      duration: 30,
      price: 500,
      status: "Confirmed",
      patientName: "Juan Dela Cruz",
      patientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      createdAt: "2026-11-20T00:00:00Z",
      declineReason: undefined,
    })
  })

  it("formats ApiError messages cleanly", () => {
    const err = new ApiError(403, "Verify your email", {
      code: "EMAIL_NOT_VERIFIED",
    })
    expect(errorMessage(err)).toBe("Verify your email")
    expect(err.code).toBe("EMAIL_NOT_VERIFIED")
  })

  it("initializes the Supabase client cleanly with configured publishable credentials", () => {
    expect(supabaseConfigError).toBeNull()
    expect(supabase).toBeDefined()
    expect(typeof supabase.auth.getSession).toBe("function")
  })
})
