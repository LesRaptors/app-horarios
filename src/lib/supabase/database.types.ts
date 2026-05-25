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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "absence_records_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          organization_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          id?: string
          key?: string
          organization_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_providers: {
        Row: {
          config: Json
          configured_at: string | null
          is_active: boolean | null
          organization_id: string
          provider: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          configured_at?: string | null
          is_active?: boolean | null
          organization_id: string
          provider: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          configured_at?: string | null
          is_active?: boolean | null
          organization_id?: string
          provider?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_providers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_rest_rules: {
        Row: {
          contract_type_id: string
          created_at: string
          id: string
          organization_id: string
          params: Json
          rule_type: string
          updated_at: string
        }
        Insert: {
          contract_type_id: string
          created_at?: string
          id?: string
          organization_id: string
          params: Json
          rule_type: string
          updated_at?: string
        }
        Update: {
          contract_type_id?: string
          created_at?: string
          id?: string
          organization_id?: string
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
          {
            foreignKeyName: "contract_rest_rules_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
          target_hours_per_week?: number | null
          target_nights_per_month?: number | null
          target_saturdays_per_month?: number | null
          updated_at?: string
          weekly_hours?: number | null
          weekly_hours_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_types_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_org_id: string | null
          contacted_at: string | null
          created_at: string
          email: string
          empresa: string
          id: string
          ip_address: unknown
          mensaje: string | null
          nombre: string
          notes: string | null
          sector: string
          status: string
          telefono: string
          user_agent: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_org_id?: string | null
          contacted_at?: string | null
          created_at?: string
          email: string
          empresa: string
          id?: string
          ip_address?: unknown
          mensaje?: string | null
          nombre: string
          notes?: string | null
          sector: string
          status?: string
          telefono: string
          user_agent?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_org_id?: string | null
          contacted_at?: string | null
          created_at?: string
          email?: string
          empresa?: string
          id?: string
          ip_address?: unknown
          mensaje?: string | null
          nombre?: string
          notes?: string | null
          sector?: string
          status?: string
          telefono?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_requests_approved_org_id_fkey"
            columns: ["approved_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          location_id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          organization_id?: string
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
          {
            foreignKeyName: "departments_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dian_emit_jobs: {
        Row: {
          attempt_count: number
          created_at: string | null
          id: string
          invoice_id: string
          last_error: string | null
          next_attempt_at: string
          status: string
          updated_at: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string | null
          id?: string
          invoice_id: string
          last_error?: string | null
          next_attempt_at?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          last_error?: string | null
          next_attempt_at?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dian_emit_jobs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
          {
            foreignKeyName: "employee_equity_rollups_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_rest_rules: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          organization_id: string
          params: Json
          rule_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          organization_id: string
          params: Json
          rule_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          organization_id?: string
          params?: Json
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_rest_rules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_rest_rules_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_secondary_positions: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          organization_id: string
          position_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          organization_id: string
          position_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          organization_id?: string
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
            foreignKeyName: "employee_secondary_positions_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          country: string
          created_at: string
          date: string
          id: string
          location_id: string | null
          name: string
          organization_id: string | null
        }
        Insert: {
          country?: string
          created_at?: string
          date: string
          id?: string
          location_id?: string | null
          name: string
          organization_id?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          date?: string
          id?: string
          location_id?: string | null
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cop: number
          created_at: string | null
          dian_invoice_id: string | null
          dian_pdf_url: string | null
          dian_provider: string | null
          dian_status: string | null
          due_date: string
          id: string
          iva_cop: number
          organization_id: string
          paid_at: string | null
          period_end: string
          period_start: string
          plan_id: string
          retry_count: number | null
          status: string
          subscription_id: string
          total_cop: number
        }
        Insert: {
          amount_cop: number
          created_at?: string | null
          dian_invoice_id?: string | null
          dian_pdf_url?: string | null
          dian_provider?: string | null
          dian_status?: string | null
          due_date: string
          id?: string
          iva_cop?: number
          organization_id: string
          paid_at?: string | null
          period_end: string
          period_start: string
          plan_id: string
          retry_count?: number | null
          status: string
          subscription_id: string
          total_cop: number
        }
        Update: {
          amount_cop?: number
          created_at?: string | null
          dian_invoice_id?: string | null
          dian_pdf_url?: string | null
          dian_provider?: string | null
          dian_status?: string | null
          due_date?: string
          id?: string
          iva_cop?: number
          organization_id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          plan_id?: string
          retry_count?: number | null
          status?: string
          subscription_id?: string
          total_cop?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
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
          organization_id: string
          updated_at: string
        }
        Insert: {
          address?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          approved_by: string | null
          approved_from_demo_request_id: string | null
          billing_email: string | null
          billing_exempt: boolean
          country: string
          created_at: string
          current_plan_id: string | null
          id: string
          industry: string | null
          legal_name: string | null
          logo_url: string | null
          logo_url_dark: string | null
          name: string
          nit: string | null
          onboarding_completed_at: string | null
          onboarding_step: string | null
          plan: string
          primary_color: string | null
          slug: string
          status: string
          timezone: string
          trial_ends_at: string | null
          updated_at: string
          welcome_email_sent_at: string | null
        }
        Insert: {
          approved_by?: string | null
          approved_from_demo_request_id?: string | null
          billing_email?: string | null
          billing_exempt?: boolean
          country?: string
          created_at?: string
          current_plan_id?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          logo_url?: string | null
          logo_url_dark?: string | null
          name: string
          nit?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          plan?: string
          primary_color?: string | null
          slug: string
          status?: string
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Update: {
          approved_by?: string | null
          approved_from_demo_request_id?: string | null
          billing_email?: string | null
          billing_exempt?: boolean
          country?: string
          created_at?: string
          current_plan_id?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          logo_url?: string | null
          logo_url_dark?: string | null
          name?: string
          nit?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          plan?: string
          primary_color?: string | null
          slug?: string
          status?: string
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_approved_from_demo_request_id_fkey"
            columns: ["approved_from_demo_request_id"]
            isOneToOne: false
            referencedRelation: "demo_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_current_plan_id_fkey"
            columns: ["current_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          organization_id: string
          provider: string
          provider_payment_source_id: string
        }
        Insert: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          organization_id: string
          provider: string
          provider_payment_source_id: string
        }
        Update: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          organization_id?: string
          provider?: string
          provider_payment_source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cop: number
          attempted_at: string | null
          completed_at: string | null
          failure_reason: string | null
          id: string
          invoice_id: string
          payment_method_id: string | null
          provider: string
          provider_transaction_id: string | null
          status: string
        }
        Insert: {
          amount_cop: number
          attempted_at?: string | null
          completed_at?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id: string
          payment_method_id?: string | null
          provider: string
          provider_transaction_id?: string | null
          status: string
        }
        Update: {
          amount_cop?: number
          attempted_at?: string | null
          completed_at?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          payment_method_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "payroll_employer_cost_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "payroll_entries_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "payroll_periods_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "payroll_provisions_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
          period_end?: string | null
          period_start?: string
          smmlv?: number
          sunday_surcharge_pct?: number
          updated_at?: string
          uvt?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_settings_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          contact_sales: boolean | null
          created_at: string | null
          display_order: number
          features: Json | null
          id: string
          is_active: boolean | null
          max_employees: number | null
          name: string
          price_cop: number
          updated_at: string | null
        }
        Insert: {
          contact_sales?: boolean | null
          created_at?: string | null
          display_order: number
          features?: Json | null
          id: string
          is_active?: boolean | null
          max_employees?: number | null
          name: string
          price_cop: number
          updated_at?: string | null
        }
        Update: {
          contact_sales?: boolean | null
          created_at?: string | null
          display_order?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_employees?: number | null
          name?: string
          price_cop?: number
          updated_at?: string | null
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
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          department_id: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          organization_id?: string
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
          {
            foreignKeyName: "positions_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          phone: string | null
          position_id: string | null
          role: string
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
          organization_id?: string | null
          phone?: string | null
          position_id?: string | null
          role?: string
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
          organization_id?: string | null
          phone?: string | null
          position_id?: string | null
          role?: string
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
            foreignKeyName: "profiles_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
          {
            foreignKeyName: "salary_adjustments_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
          {
            foreignKeyName: "salary_history_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "schedule_entries_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
          {
            foreignKeyName: "schedules_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_reminders: {
        Row: {
          days_offset: number
          id: string
          organization_id: string
          sent_at: string | null
          template: string
        }
        Insert: {
          days_offset: number
          id?: string
          organization_id: string
          sent_at?: string | null
          template: string
        }
        Update: {
          days_offset?: number
          id?: string
          organization_id?: string
          sent_at?: string | null
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "sent_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_swap_requests: {
        Row: {
          created_at: string
          id: string
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
          requester_entry_id?: string
          requester_id?: string
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["swap_status"]
          target_entry_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
          {
            foreignKeyName: "shift_templates_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "staffing_requirements_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string
          current_period_start: string
          id: string
          organization_id: string
          payment_method_id: string | null
          plan_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end: string
          current_period_start: string
          id?: string
          organization_id: string
          payment_method_id?: string | null
          plan_id: string
          status: string
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          organization_id?: string
          payment_method_id?: string | null
          plan_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
          {
            foreignKeyName: "tax_personal_deductions_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "time_off_requests_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      approve_demo_request: {
        Args: {
          p_admin_email: string
          p_admin_first_name: string
          p_admin_last_name: string
          p_approver_id: string
          p_demo_request_id: string
          p_org_name: string
          p_org_slug: string
          p_plan: string
        }
        Returns: Json
      }
      approve_shift_swap: {
        Args: { p_reviewer_id: string; p_swap_id: string }
        Returns: Json
      }
      convert_demo_to_real: {
        Args: { p_demo_id: string; p_real_id: string }
        Returns: Json
      }
      create_notification:
        | {
            Args: {
              p_link?: string
              p_message: string
              p_organization_id: string
              p_title: string
              p_type?: Database["public"]["Enums"]["notification_type"]
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_link?: string
              p_message: string
              p_title: string
              p_type?: Database["public"]["Enums"]["notification_type"]
              p_user_id: string
            }
            Returns: string
          }
      get_org_by_slug: {
        Args: { p_slug: string }
        Returns: {
          id: string
          slug: string
        }[]
      }
      get_user_location_id: { Args: never; Returns: string }
      get_user_org_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
      recompute_equity_rollup: {
        Args: { p_employee_id: string; p_month: number; p_year: number }
        Returns: undefined
      }
      save_staffing_diff: {
        Args: { p_location_id: string; p_rows: Json }
        Returns: Json
      }
      slugify: { Args: { input: string }; Returns: string }
      suggest_unique_slug: { Args: { p_name: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
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
    },
  },
} as const
