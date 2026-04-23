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
  | { kind: "no_available_employee";      positionId: string; date: string; shiftTemplateId: string }
  | { kind: "no_safe_candidate";          positionId: string; date: string; shiftTemplateId: string }
  | { kind: "overtime_assigned";          positionId: string; date: string; shiftTemplateId: string; employeeId: string; caps: CapExcessKind[] }
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
