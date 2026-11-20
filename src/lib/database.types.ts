// TypeScript types for the LouDent Supabase schema (supabase/migrations).
// Compatible with @supabase/supabase-js v2.49+ GenericSchema constraints.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AppointmentStatusDb =
  | "Pending"
  | "Confirmed"
  | "Completed"
  | "Cancelled"
  | "Declined"

export type ProfileRow = {
  id: string
  role: "patient" | "dentist"
  dentist_id: string | null
  full_name: string
  email: string
  phone: string
  is_clinic_admin: boolean
  avatar_path: string | null
  created_at: string
  updated_at: string
}

export type DentistRow = {
  id: string
  name: string
  title: string
  specialty: string
  experience_years: number
  bio: string
  photo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ServiceRow = {
  id: string
  name: string
  category: "General Dentistry" | "Orthodontics"
  duration_minutes: number
  price: number
  icon: string | null
  description: string
  preparation: string
  involves: Json
  is_active: boolean
  created_at: string
  updated_at: string
}

export type DentistServiceRow = {
  dentist_id: string
  service_id: string
}

export type ScheduleRow = {
  dentist_id: string
  day_of_week: number
  available: boolean
  start_time: string
  end_time: string
  break_start: string | null
  break_end: string | null
}

export type BlockedDateRow = {
  dentist_id: string
  block_date: string
  created_at: string
}

export type AppointmentRow = {
  id: string
  reference: string
  patient_id: string
  dentist_id: string
  service_id: string
  appointment_date: string
  start_time: string
  duration_minutes: number
  price: number
  status: AppointmentStatusDb
  decline_reason: string | null
  slot: string
  created_at: string
  updated_at: string
}

export type HistoryRow = {
  id: number
  appointment_id: string
  action: string
  old_status: string | null
  new_status: string | null
  actor_id: string | null
  details: Json
  created_at: string
}

export type AuditRow = {
  id: number
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: Json
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Partial<ProfileRow> & { id: string }
        Update: Partial<ProfileRow>
        Relationships: []
      }
      dentists: {
        Row: DentistRow
        Insert: Partial<DentistRow> & { id: string; name: string }
        Update: Partial<DentistRow>
        Relationships: []
      }
      services: {
        Row: ServiceRow
        Insert: Omit<ServiceRow, "created_at" | "updated_at" | "is_active"> & {
          is_active?: boolean
        }
        Update: Partial<Omit<ServiceRow, "id" | "created_at" | "updated_at">>
        Relationships: []
      }
      dentist_services: {
        Row: DentistServiceRow
        Insert: DentistServiceRow
        Update: Partial<DentistServiceRow>
        Relationships: []
      }
      dentist_schedules: {
        Row: ScheduleRow
        Insert: Partial<ScheduleRow> & { dentist_id: string; day_of_week: number }
        Update: Partial<ScheduleRow>
        Relationships: []
      }
      blocked_dates: {
        Row: BlockedDateRow
        Insert: { dentist_id: string; block_date: string; created_at?: string }
        Update: Partial<BlockedDateRow>
        Relationships: []
      }
      appointments: {
        Row: AppointmentRow
        Insert: Partial<AppointmentRow> & {
          reference: string
          patient_id: string
          dentist_id: string
          service_id: string
          appointment_date: string
          start_time: string
          duration_minutes: number
          price: number
        }
        Update: Partial<AppointmentRow>
        Relationships: []
      }
      appointment_history: {
        Row: HistoryRow
        Insert: Partial<HistoryRow> & { appointment_id: string; action: string }
        Update: Partial<HistoryRow>
        Relationships: []
      }
      audit_logs: {
        Row: AuditRow
        Insert: Partial<AuditRow> & { action: string; entity_type: string }
        Update: Partial<AuditRow>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_appointment: {
        Args: {
          p_service_id: string
          p_dentist_id: string
          p_date: string
          p_time: string
        }
        Returns: string
      }
      reschedule_appointment: {
        Args: {
          p_appointment_id: string
          p_service_id: string
          p_dentist_id: string
          p_date: string
          p_time: string
        }
        Returns: string
      }
      cancel_appointment: {
        Args: { p_appointment_id: string }
        Returns: string
      }
      set_appointment_status: {
        Args: {
          p_appointment_id: string
          p_status: string
          p_decline_reason?: string | null
        }
        Returns: string
      }
      get_available_slots: {
        Args: {
          p_dentist_id: string
          p_service_id: string
          p_date: string
          p_exclude_appointment_id?: string | null
        }
        Returns: { slot_time: string; available: boolean }[]
      }
      save_dentist_schedule: {
        Args: { p_dentist_id: string; p_days: Json }
        Returns: undefined
      }
      add_blocked_date: {
        Args: { p_dentist_id: string; p_date: string }
        Returns: undefined
      }
      remove_blocked_date: {
        Args: { p_dentist_id: string; p_date: string }
        Returns: undefined
      }
      update_my_profile: {
        Args: { p_full_name: string; p_phone: string }
        Returns: ProfileRow
      }
      set_my_avatar: {
        Args: { p_path: string | null; p_public_url?: string | null }
        Returns: string | null
      }
      update_dentist_profile: {
        Args: {
          p_dentist_id: string
          p_name: string
          p_title: string
          p_specialty: string
          p_bio: string
          p_experience?: number | null
        }
        Returns: undefined
      }
      set_clinic_admin: {
        Args: { p_user_id: string; p_is_admin: boolean }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
