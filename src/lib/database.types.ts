// Auto-generated TypeScript types for LouDent Supabase schema.
// Reflects the tables, views, functions, and enums defined in the SQL migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: 'patient' | 'dentist'
          dentist_id: string | null
          full_name: string
          email: string
          phone: string
          is_clinic_admin: boolean
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: 'patient' | 'dentist'
          dentist_id?: string | null
          full_name: string
          email: string
          phone?: string
          is_clinic_admin?: boolean
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: 'patient' | 'dentist'
          dentist_id?: string | null
          full_name?: string
          email?: string
          phone?: string
          is_clinic_admin?: boolean
          avatar_url?: string | null
          updated_at?: string
        }
      }
      dentists: {
        Row: {
          id: string
          name: string
          title: string
          specialty: string
          experience_years: number
          bio: string
          photo_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          name: string
          title?: string
          specialty?: string
          experience_years?: number
          bio?: string
          photo_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          title?: string
          specialty?: string
          experience_years?: number
          bio?: string
          photo_url?: string | null
        }
      }
      services: {
        Row: {
          id: string
          name: string
          category: 'General Dentistry' | 'Orthodontics'
          duration_minutes: number
          price: number
          icon: string
          description: string
          preparation: string
          involves: Json
        }
        Insert: {
          id: string
          name: string
          category: 'General Dentistry' | 'Orthodontics'
          duration_minutes: number
          price: number
          icon?: string
          description?: string
          preparation?: string
          involves?: Json
        }
        Update: {
          name?: string
          category?: 'General Dentistry' | 'Orthodontics'
          duration_minutes?: number
          price?: number
          icon?: string
          description?: string
          preparation?: string
          involves?: Json
        }
      }
      dentist_services: {
        Row: {
          dentist_id: string
          service_id: string
        }
        Insert: {
          dentist_id: string
          service_id: string
        }
        Update: {
          dentist_id?: string
          service_id?: string
        }
      }
      dentist_schedules: {
        Row: {
          dentist_id: string
          day_of_week: number
          available: boolean
          start_time: string
          end_time: string
          break_start: string | null
          break_end: string | null
        }
        Insert: {
          dentist_id: string
          day_of_week: number
          available?: boolean
          start_time?: string
          end_time?: string
          break_start?: string | null
          break_end?: string | null
        }
        Update: {
          available?: boolean
          start_time?: string
          end_time?: string
          break_start?: string | null
          break_end?: string | null
        }
      }
      blocked_dates: {
        Row: {
          dentist_id: string
          block_date: string
        }
        Insert: {
          dentist_id: string
          block_date: string
        }
        Update: {
          dentist_id?: string
          block_date?: string
        }
      }
      appointments: {
        Row: {
          id: string
          reference: string
          patient_id: string
          dentist_id: string
          service_id: string
          appointment_date: string
          start_time: string
          duration_minutes: number
          price: number
          status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Declined'
          decline_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reference: string
          patient_id: string
          dentist_id: string
          service_id: string
          appointment_date: string
          start_time: string
          duration_minutes: number
          price: number
          status?: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Declined'
          decline_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          reference?: string
          dentist_id?: string
          service_id?: string
          appointment_date?: string
          start_time?: string
          duration_minutes?: number
          price?: number
          status?: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Declined'
          decline_reason?: string | null
        }
      }
      appointment_history: {
        Row: {
          id: string
          appointment_id: string
          action: string
          old_status: string | null
          new_status: string | null
          actor_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          appointment_id: string
          action: string
          old_status?: string | null
          new_status?: string | null
          actor_id?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: never
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          resource_type: string
          resource_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          resource_type: string
          resource_id?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: never
      }
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
        Returns: undefined
      }
      update_appointment_status: {
        Args: {
          p_appointment_id: string
          p_new_status: string
          p_decline_reason?: string
        }
        Returns: undefined
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
        Args: {
          p_dentist_id: string
          p_days: Json
        }
        Returns: undefined
      }
      get_user_role: {
        Args: Record<string, never>
        Returns: string
      }
      get_user_dentist_id: {
        Args: Record<string, never>
        Returns: string
      }
      is_clinic_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: Record<string, never>
  }
}
