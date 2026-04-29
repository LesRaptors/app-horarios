export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      absence_records: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string
          id: string
          notes: string | null
          paid_pct: number
          payer: string
          source_request_id: string | null
          start_date: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date: string
          id?: string
          notes?: string | null
          paid_pct: number
          payer: string
          source_request_id?: string | null
          start_date: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          notes?: string | null
          paid_pct?: number
          payer?: string
          source_request_id?: string | null
          start_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_records_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "time_off_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      contract_rest_rules: {
        Row: {
          contract_type_id: string
          created_at: string
          id: string
          params: Json
          rule_type: string
          updated_at: string
        }
        Insert: {
          contract_type_id: string
          created_at?: string
          id?: string
          params: Json
          rule_type: string
          updated_at?: string
        }
        Update: {
          contract_type_id?: string
          created_at?: string
          id?: string
          params?: Json
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_rest_rules_contract_type_id_fkey"
            columns: ["contract_type_id"]
            isOneToOne: false
            referencedRelation: "contract_types"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_types: {
        Row: {
          available_holidays: boolean
          available_nights: boolean
          available_sundays: boolean
          created_at: string
          description: string | null
          id: string
          is_healthcare: boolean
          max_holidays_per_quarter: number
          max_hours_per_day: number | null
          max_hours_per_week: number | null
          max_sundays_per_quarter: number
          name: string
          target_hours_per_week: number | null
          target_nights_per_month: number | null
          target_saturdays_per_month: number | null
          updated_at: string
          weekly_hours: number | null
          weekly_hours_mode: string
        }
        Insert: {
          available_holidays?: boolean
          available_nights?: boolean
          available_sundays?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_healthcare?: boolean
          max_holidays_per_quarter?: number
          max_hours_per_day?: number | null
          max_hours_per_week?: number | null
          max_sundays_per_quarter?: number
          name: string
          target_hours_per_week?: number | null
          target_nights_per_month?: number | null
          target_saturdays_per_month?: number | null
          updated_at?: string
          weekly_hours?: number | null
          weekly_hours_mode?: string
        }
        Update: {
          available_holidays?: boolean
          available_nights?: boolean
          available_sundays?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_healthcare?: boolean
          max_holidays_per_quarter?: number
          max_hours_per_day?: number | null
          max_hours_per_week?: number | null
          max_sundays_per_quarter?: number
          name?: string
          target_hours_per_week?: number | null
          target_nights_per_month?: number | null
          target_saturdays_per_month?: number | null
          updated_at?: string
          weekly_hours?: number | null
          weekly_hours_mode?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          id: string
          location_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_equity_rollups: {
        Row: {
          employee_id: string
          holidays_worked: number
          month: number
          nights_worked: number
          saturdays_worked: number
          sundays_worked: number
          total_hours: number
          updated_at: string
          year: number
        }
        Insert: {
          employee_id: string
          holidays_worked?: number
          month: number
          nights_worked?: number
          saturdays_worked?: number
          sundays_worked?: number
          total_hours?: number
          updated_at?: string
          year: number
        }
        Update: {
          employee_id?: string
          holidays_worked?: number
          month?: number
          nights_worked?: number
          saturdays_worked?: number
          sundays_worked?: number
          total_hours?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_equity_rollups_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_secondary_positions: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          position_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          position_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_secondary_positions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_secondary_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          location_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          location_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          location_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_employer_cost: {
        Row: {
          arl_employer: number
          created_at: string
          employee_id: string
          health_employer: number
          id: string
          parafiscales_caja: number
          parafiscales_icbf: number
          parafiscales_sena: number
          payroll_period_id: string
          pension_employer: number
          total: number | null
        }
        Insert: {
          arl_employer?: number
          created_at?: string
          employee_id: string
          health_employer?: number
          id?: string
          parafiscales_caja?: number
          parafiscales_icbf?: number
          parafiscales_sena?: number
          payroll_period_id: string
          pension_employer?: number
          total?: number | null
        }
        Update: {
          arl_employer?: number
          created_at?: string
          employee_id?: string
          health_employer?: number
          id?: string
          parafiscales_caja?: number
          parafiscales_icbf?: number
          parafiscales_sena?: number
          payroll_period_id?: string
          pension_employer?: number
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_employer_cost_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_employer_cost_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          amount: number
          base: number | null
          concept_type: string
          created_at: string
          description: string | null
          employee_id: string
          id: string
          is_income: boolean
          is_manual_override: boolean
          payroll_period_id: string
          rate: number | null
        }
        Insert: {
          amount: number
          base?: number | null
          concept_type: string
          created_at?: string
          description?: string | null
          employee_id: string
          id?: string
          is_income: boolean
          is_manual_override?: boolean
          payroll_period_id: string
          rate?: number | null
        }
        Update: {
          amount?: number
          base?: number | null
          concept_type?: string
          created_at?: string
          description?: string | null
          employee_id?: string
          id?: string
          is_income?: boolean
          is_manual_override?: boolean
          payroll_period_id?: string
          rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          frequency: string
          id: string
          is_advance: boolean
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          frequency: string
          id?: string
          is_advance?: boolean
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          frequency?: string
          id?: string
          is_advance?: boolean
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_provisions: {
        Row: {
          accumulated_ytd: number
          amount: number
          base: number
          concept: string
          created_at: string
          employee_id: string
          id: string
          payroll_period_id: string
          rate: number
        }
        Insert: {
          accumulated_ytd: number
          amount: number
          base: number
          concept: string
          created_at?: string
          employee_id: string
          id?: string
          payroll_period_id: string
          rate: number
        }
        Update: {
          accumulated_ytd?: number
          amount?: number
          base?: number
          concept?: string
          created_at?: string
          employee_id?: string
          id?: string
          payroll_period_id?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_provisions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_provisions_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_settings: {
        Row: {
          aux_transport: number
          holiday_surcharge_pct: number
          hourly_divisor: number
          id: string
          night_start_hour: number
          period_end: string | null
          period_start: string
          smmlv: number
          sunday_surcharge_pct: number
          updated_at: string
          uvt: number
        }
        Insert: {
          aux_transport: number
          holiday_surcharge_pct: number
          hourly_divisor: number
          id?: string
          night_start_hour: number
          period_end?: string | null
          period_start: string
          smmlv: number
          sunday_surcharge_pct: number
          updated_at?: string
          uvt?: number
        }
        Update: {
          aux_transport?: number
          holiday_surcharge_pct?: number
          hourly_divisor?: number
          id?: string
          night_start_hour?: number
          period_end?: string | null
          period_start?: string
          smmlv?: number
          sunday_surcharge_pct?: number
          updated_at?: string
          uvt?: number
        }
        Relationships: []
      }
      positions: {
        Row: {
          color: string
          created_at: string
          department_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          department_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          arl_risk_class: number | null
          contract_type_id: string
          created_at: string
          email: string
          first_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          is_floater: boolean
          is_terminated: boolean
          last_name: string
          location_id: string | null
          max_hours_per_week: number
          phone: string | null
          position_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          termination_date: string | null
          updated_at: string
        }
        Insert: {
          arl_risk_class?: number | null
          contract_type_id?: string
          created_at?: string
          email: string
          first_name: string
          hire_date?: string | null
          id: string
          is_active?: boolean
          is_demo?: boolean
          is_floater?: boolean
          is_terminated?: boolean
          last_name: string
          location_id?: string | null
          max_hours_per_week?: number
          phone?: string | null
          position_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          termination_date?: string | null
          updated_at?: string
        }
        Update: {
          arl_risk_class?: number | null
          contract_type_id?: string
          created_at?: string
          email?: string
          first_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          is_floater?: boolean
          is_terminated?: boolean
          last_name?: string
          location_id?: string | null
          max_hours_per_week?: number
          phone?: string | null
          position_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          termination_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_contract_type_id_fkey"
            columns: ["contract_type_id"]
            isOneToOne: false
            referencedRelation: "contract_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_adjustments: {
        Row: {
          amount: number
          concept_label: string
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          id: string
          is_salary_component: boolean
          payment_date: string
        }
        Insert: {
          amount: number
          concept_label: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          id?: string
          is_salary_component: boolean
          payment_date: string
        }
        Update: {
          amount?: number
          concept_label?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          is_salary_component?: boolean
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_history: {
        Row: {
          change_reason: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          is_integral_salary: boolean
          monthly_salary: number
          transport_aux_override: boolean | null
        }
        Insert: {
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          is_integral_salary?: boolean
          monthly_salary: number
          transport_aux_override?: boolean | null
        }
        Update: {
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          is_integral_salary?: boolean
          monthly_salary?: number
          transport_aux_override?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_entries: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          end_time: string
          exceeds_caps: string[]
          id: string
          notes: string | null
          overtime_note: string | null
          overtime_reviewed_at: string | null
          overtime_reviewed_by: string | null
          overtime_status: string
          position_id: string
          schedule_id: string
          shift_template_id: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          end_time: string
          exceeds_caps?: string[]
          id?: string
          notes?: string | null
          overtime_note?: string | null
          overtime_reviewed_at?: string | null
          overtime_reviewed_by?: string | null
          overtime_status?: string
          position_id: string
          schedule_id: string
          shift_template_id?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string
          end_time?: string
          exceeds_caps?: string[]
          id?: string
          notes?: string | null
          overtime_note?: string | null
          overtime_reviewed_at?: string | null
          overtime_reviewed_by?: string | null
          overtime_status?: string
          position_id?: string
          schedule_id?: string
          shift_template_id?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_overtime_reviewed_by_fkey"
            columns: ["overtime_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_shift_template_id_fkey"
            columns: ["shift_template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          created_by: string
          id: string
          location_id: string
          month: number
          published_at: string | null
          status: Database["public"]["Enums"]["schedule_status"]
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          location_id: string
          month: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          location_id?: string
          month?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_swap_requests: {
        Row: {
          created_at: string
          id: string
          requester_entry_id: string
          requester_id: string
          reviewed_by: string | null
          status: Database["public"]["Enums"]["swap_status"]
          target_entry_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_entry_id: string
          requester_id: string
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["swap_status"]
          target_entry_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_entry_id?: string
          requester_id?: string
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["swap_status"]
          target_entry_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_requester_entry_id_fkey"
            columns: ["requester_entry_id"]
            isOneToOne: false
            referencedRelation: "schedule_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_target_entry_id_fkey"
            columns: ["target_entry_id"]
            isOneToOne: false
            referencedRelation: "schedule_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          break_minutes: number
          color: string
          created_at: string
          end_time: string
          id: string
          is_night: boolean
          location_id: string
          name: string
          start_time: string
        }
        Insert: {
          break_minutes?: number
          color?: string
          created_at?: string
          end_time: string
          id?: string
          is_night?: boolean
          location_id: string
          name: string
          start_time: string
        }
        Update: {
          break_minutes?: number
          color?: string
          created_at?: string
          end_time?: string
          id?: string
          is_night?: boolean
          location_id?: string
          name?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_requirements: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          location_id: string
          position_id: string
          required_count: number
          shift_template_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          location_id: string
          position_id: string
          required_count?: number
          shift_template_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          location_id?: string
          position_id?: string
          required_count?: number
          shift_template_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staffing_requirements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requirements_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requirements_shift_template_id_fkey"
            columns: ["shift_template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_requirements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_personal_deductions: {
        Row: {
          afc_monthly: number
          created_at: string
          created_by: string | null
          dependents_count: number
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          mortgage_interest_monthly: number
          prepaid_health_monthly: number
          voluntary_pension_monthly: number
        }
        Insert: {
          afc_monthly?: number
          created_at?: string
          created_by?: string | null
          dependents_count?: number
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          mortgage_interest_monthly?: number
          prepaid_health_monthly?: number
          voluntary_pension_monthly?: number
        }
        Update: {
          afc_monthly?: number
          created_at?: string
          created_by?: string | null
          dependents_count?: number
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          mortgage_interest_monthly?: number
          prepaid_health_monthly?: number
          voluntary_pension_monthly?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_personal_deductions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_personal_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_requests: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_shift_swap: {
        Args: { p_reviewer_id: string; p_swap_id: string }
        Returns: Json
      }
      convert_demo_to_real: {
        Args: { p_demo_id: string; p_real_id: string }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_link?: string
          p_message: string
          p_title: string
          p_type?: Database["public"]["Enums"]["notification_type"]
          p_user_id: string
        }
        Returns: string
      }
      get_user_location_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      recompute_equity_rollup: {
        Args: { p_employee_id: string; p_month: number; p_year: number }
        Returns: undefined
      }
      save_staffing_diff: {
        Args: { p_location_id: string; p_rows: Json }
        Returns: Json
      }
    }
    Enums: {
      notification_type:
        | "schedule_published"
        | "shift_change"
        | "request_update"
        | "swap_request"
        | "general"
      request_status: "pending" | "approved" | "rejected"
      schedule_status: "draft" | "published" | "archived"
      swap_status: "pending" | "accepted" | "rejected" | "approved"
      user_role: "admin" | "manager" | "employee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      notification_type: [
        "schedule_published",
        "shift_change",
        "request_update",
        "swap_request",
        "general",
      ],
      request_status: ["pending", "approved", "rejected"],
      schedule_status: ["draft", "published", "archived"],
      swap_status: ["pending", "accepted", "rejected", "approved"],
      user_role: ["admin", "manager", "employee"],
    },
  },
} as const
