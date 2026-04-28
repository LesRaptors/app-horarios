export type UserRole = "admin" | "manager" | "employee";

export type ScheduleStatus = "draft" | "published" | "archived";

export type RequestStatus = "pending" | "approved" | "rejected";

export type SwapStatus = "pending" | "accepted" | "rejected" | "approved";

export type NotificationType =
  | "schedule_published"
  | "shift_change"
  | "request_update"
  | "swap_request"
  | "general";

export interface Location {
  id: string;
  name: string;
  address: string;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  location_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  location?: any;
}

export interface Position {
  id: string;
  department_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  department?: any;
}

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  position_id: string | null;
  location_id: string | null;
  max_hours_per_week: number;
  is_active: boolean;
  is_demo: boolean;
  contract_type_id: string;
  created_at: string;
  updated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  position?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  location?: any;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_night: boolean;
  color: string;
  location_id: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  location?: any;
}

export interface Schedule {
  id: string;
  location_id: string;
  month: number;
  year: number;
  status: ScheduleStatus;
  created_by: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  location?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creator?: any;
}

export interface ScheduleEntry {
  id: string;
  schedule_id: string;
  employee_id: string;
  position_id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_template_id: string | null;
  notes: string | null;
  exceeds_caps: CapExcessKind[];
  overtime_status: OvertimeStatus;
  overtime_reviewed_by: string | null;
  overtime_reviewed_at: string | null;
  overtime_note: string | null;
  created_at: string;
  updated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  position?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shift_template?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schedule?: any;
}

export interface TimeOffRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reviewer?: any;
}

export interface ShiftSwapRequest {
  id: string;
  requester_id: string;
  target_id: string;
  requester_entry_id: string;
  target_entry_id: string;
  status: SwapStatus;
  reviewed_by: string | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requester?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requester_entry?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target_entry?: any;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

export interface EmployeeSecondaryPosition {
  id: string;
  employee_id: string;
  position_id: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  position?: any;
}

export interface StaffingRequirement {
  id: string;
  location_id: string;
  position_id: string;
  shift_template_id: string;
  day_of_week: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  required_count: number;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  position?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shift_template?: any;
}

// Profile extended with secondary positions for schedule generation
export interface ProfileWithPositions extends Profile {
  secondary_positions: EmployeeSecondaryPosition[];
}

export interface LaborConstraints {
  maxHoursPerWeek: number;
  maxHoursPerDay: number;
  minRestHoursBetweenShifts: number;
  maxConsecutiveDays: number;
}

// Contract types (per-type caps for the equity model)
export interface ContractType {
  id: string;
  name: string;
  description: string | null;
  max_sundays_per_quarter: number;
  max_holidays_per_quarter: number;
  target_saturdays_per_month: number | null;
  target_nights_per_month: number | null;
  target_hours_per_week: number | null;
  max_hours_per_day: number | null;
  max_hours_per_week: number | null;
  weekly_hours_mode: "full" | "partial";
  weekly_hours: number | null;
  is_healthcare: boolean;
  available_sundays: boolean;
  available_holidays: boolean;
  available_nights: boolean;
  created_at: string;
  updated_at: string;
}

// Holidays (Colombia nacional + per-sede overrides)
export interface HolidayDate {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  location_id: string | null;
  created_at: string;
}

// Materialized rollup per employee per month
export interface EmployeeEquityRollup {
  employee_id: string;
  year: number;
  month: number; // 1-12
  sundays_worked: number;
  saturdays_worked: number;
  nights_worked: number;
  holidays_worked: number;
  total_hours: number;
  updated_at: string;
}

// Scoring weights (stored as JSONB in app_settings)
export interface ScoringWeights {
  sunday_penalty: number;
  saturday_penalty: number;
  night_penalty: number;
  holiday_penalty: number;
  block_continuation_bonus: number;
  fragmentation_penalty: number;
  clean_restart_bonus: number;
  position_primary_bonus: number;
  position_secondary_bonus: number;
  hour_deficit_multiplier: number;
  shift_deficit_multiplier: number;
}

// Overtime workflow state on schedule_entries
export type OvertimeStatus = "none" | "pending" | "approved" | "rejected";

export type CapExcessKind =
  | "weekly_hours"
  | "consecutive_days"
  | "sundays_quarter"
  | "holidays_quarter"
  | "night_limit";

// Auto-gen warnings are structured so the UI can group them by cause.
export type AutoGenWarning =
  | { kind: "no_employees_in_position";  positionId: string; date: string; shiftTemplateId: string }
  | { kind: "no_safe_candidate";          positionId: string; date: string; shiftTemplateId: string }
  | { kind: "overtime_assigned";          positionId: string; date: string; shiftTemplateId: string; employeeId: string; caps: CapExcessKind[] }
  | { kind: "coverage_gap";               positionId: string; date: string; shiftTemplateId: string; reason: "all_at_cap" | "no_eligible" }
  | { kind: "no_templates_selected" }
  | { kind: "no_employees_selected" };

// Schedule helpers
export type EntryMap = Record<string, ScheduleEntry>;

export interface SchedulePeriod {
  month: number; // 0-11
  year: number;
}

// Auto-generation
export interface AutoGenConfig {
  scheduleId: string;
  locationId: string;
  month: number; // 0-11
  year: number;
  shiftTemplateIds: string[];
  positionIds: string[];
  excludeDates: string[];
  employeeIds: string[];
  useDemandRequirements: boolean;
}

export interface AutoGenResult {
  entries: Omit<ScheduleEntry, "id" | "created_at" | "updated_at" | "employee" | "position" | "shift_template">[];
  warnings: AutoGenWarning[];
  stats: Record<string, { shifts: number; hours: number }>;
}

// ----------------------------------------------------------------------------
// Payroll (sub-spec 1)
// ----------------------------------------------------------------------------

export interface SalaryHistory {
  id: string;
  employee_id: string;
  monthly_salary: number;
  is_integral_salary: boolean;
  transport_aux_override: boolean | null;
  change_reason: string | null;
  effective_from: string; // YYYY-MM-DD
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SalaryAdjustment {
  id: string;
  employee_id: string;
  payment_date: string; // YYYY-MM-DD
  concept_label: string;
  amount: number;
  is_salary_component: boolean;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PayrollSettings {
  id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string | null;
  smmlv: number;
  aux_transport: number;
  hourly_divisor: number;
  night_start_hour: number;
  sunday_surcharge_pct: number;
  holiday_surcharge_pct: number;
  uvt: number;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Payroll engine (sub-spec 2)
// ----------------------------------------------------------------------------

export type PaymentFrequency = "mensual" | "quincenal";
export type PaymentMode = "independent" | "advance_settlement";
export type PayrollPeriodStatus = "draft" | "approved" | "paid";

export type PayrollConceptType =
  | "salary" | "transport"
  | "surcharge_night" | "surcharge_sunday" | "surcharge_holiday"
  | "overtime_day" | "overtime_night"
  | "bonus_salary" | "bonus_non_salary"
  | "vacation_pay" | "prima" | "cesantias_interest"
  | "health_employee" | "pension_employee" | "solidarity_pension"
  | "income_tax" | "embargo" | "libranza"
  | "voluntary_pension" | "afc" | "union_fee" | "other_deduction";

export type ProvisionConcept = "cesantias" | "cesantias_interest" | "prima" | "vacaciones";

export type AbsenceType =
  | "sick_eps" | "sick_arl" | "maternity" | "paternity"
  | "vacation" | "paid_leave" | "unpaid_leave" | "suspension";

export type AbsencePayer = "employer" | "eps" | "arl" | "none";

export interface PayrollPeriod {
  id: string;
  period_start: string;
  period_end: string;
  frequency: PaymentFrequency;
  status: PayrollPeriodStatus;
  is_advance: boolean;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
}

export interface PayrollEntry {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  concept_type: PayrollConceptType;
  is_income: boolean;
  base: number | null;
  rate: number | null;
  amount: number;
  description: string | null;
  is_manual_override: boolean;
  created_at: string;
}

export interface PayrollProvision {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  concept: ProvisionConcept;
  base: number;
  rate: number;
  amount: number;
  accumulated_ytd: number;
  created_at: string;
}

export interface PayrollEmployerCost {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  health_employer: number;
  pension_employer: number;
  arl_employer: number;
  parafiscales_caja: number;
  parafiscales_sena: number;
  parafiscales_icbf: number;
  total: number;
  created_at: string;
}

export interface AbsenceRecord {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  type: AbsenceType;
  paid_pct: number;
  payer: AbsencePayer;
  notes: string | null;
  source_request_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TaxPersonalDeduction {
  id: string;
  employee_id: string;
  dependents_count: number;
  mortgage_interest_monthly: number;
  prepaid_health_monthly: number;
  voluntary_pension_monthly: number;
  afc_monthly: number;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}
