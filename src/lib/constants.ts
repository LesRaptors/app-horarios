export const APP_NAME = "Horarios";

export const DEFAULT_LABOR_CONSTRAINTS = {
  maxHoursPerWeek: 40,
  maxHoursPerDay: 10,
  minRestHoursBetweenShifts: 12,
  maxConsecutiveDays: 6,
} as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Manager",
  employee: "Empleado",
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

export const SWAP_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  approved: "Aprobada por manager",
};

export const DAYS_OF_WEEK = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export const REQUEST_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

export const SWAP_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  accepted: "bg-blue-100 text-blue-800 border-blue-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  approved: "bg-green-100 text-green-800 border-green-200",
};

export const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-800",
};

// Notification type → icon name mapping (used in notifications page)
export const NOTIFICATION_ICON_MAP: Record<string, string> = {
  schedule_published: "calendar",
  shift_change: "clock",
  request_update: "file-text",
  swap_request: "repeat",
  general: "bell",
};

// Day of week labels — JS Date.getDay() convention: 0=Sunday
export const DAY_OF_WEEK_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const DAY_OF_WEEK_SHORT = [
  "Dom",
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
] as const;

// Monday-first order for UI display (maps to getDay() indices)
export const WEEKDAYS_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const COLOR_PALETTE = [
  { name: "Rojo", value: "#ef4444" },
  { name: "Naranja", value: "#f97316" },
  { name: "Amarillo", value: "#f59e0b" },
  { name: "Verde", value: "#22c55e" },
  { name: "Esmeralda", value: "#10b981" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Índigo", value: "#6366f1" },
  { name: "Violeta", value: "#8b5cf6" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Gris", value: "#6b7280" },
] as const;
