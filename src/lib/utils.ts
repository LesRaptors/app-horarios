import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(time: string): string {
  return time?.slice(0, 5) || "";
}

export function calculateDuration(
  start: string,
  end: string,
  breakMin: number
): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let totalMin = eh * 60 + em - (sh * 60 + sm);
  if (totalMin < 0) totalMin += 24 * 60;
  const effectiveMin = totalMin - breakMin;
  const hours = Math.floor(effectiveMin / 60);
  const mins = effectiveMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatDate(date: string): string {
  // Append T00:00:00 to bare YYYY-MM-DD so JS parses it as local time, not UTC.
  // Otherwise users in negative TZs (e.g. Colombia UTC-5) see the previous day.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Schedule date utilities

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getMonthDates(year: number, month: number): Date[] {
  const days = getDaysInMonth(year, month);
  return Array.from({ length: days }, (_, i) => new Date(year, month, i + 1));
}

const DAY_ABBR = ["D", "L", "M", "X", "J", "V", "S"];

export function getDayAbbreviation(date: Date): string {
  return DAY_ABBR[date.getDay()];
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function entryMapKey(employeeId: string, date: string): string {
  return `${employeeId}_${date}`;
}

export function buildEntryMap<T extends { employee_id: string; date: string }>(
  entries: T[]
): Record<string, T> {
  const map: Record<string, T> = {};
  for (const entry of entries) {
    map[entryMapKey(entry.employee_id, entry.date)] = entry;
  }
  return map;
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Translates raw Supabase/PostgreSQL error messages into user-friendly Spanish messages.
 */
export function translateDbError(rawMessage: string, context?: string): string {
  // Foreign key violation on delete
  if (rawMessage.includes("violates foreign key constraint")) {
    // Extract the referencing table from the constraint name
    const match = rawMessage.match(/on table "(\w+)"/g);
    const referencingTable = match && match.length > 1
      ? match[1].replace(/on table "|"/g, "")
      : match?.[0]?.replace(/on table "|"/g, "");

    const tableMessages: Record<string, string> = {
      schedule_entries: "No se puede eliminar porque está siendo utilizado en horarios programados. Primero elimina o reasigna las entradas de horario asociadas.",
      profiles: "No se puede eliminar porque hay empleados asociados. Primero reasigna o elimina los empleados vinculados.",
      departments: "No se puede eliminar porque hay departamentos asociados. Primero elimina los departamentos vinculados.",
      positions: "No se puede eliminar porque hay posiciones asociadas. Primero elimina las posiciones vinculadas.",
      schedules: "No se puede eliminar porque hay horarios asociados. Primero elimina los horarios vinculados.",
      shift_templates: "No se puede eliminar porque hay turnos asociados. Primero elimina los turnos vinculados.",
      time_off_requests: "No se puede eliminar porque hay solicitudes de ausencia asociadas.",
      swap_requests: "No se puede eliminar porque hay solicitudes de intercambio asociadas.",
    };

    if (referencingTable && tableMessages[referencingTable]) {
      return tableMessages[referencingTable];
    }

    return "No se puede eliminar porque tiene registros asociados. Primero elimina o reasigna los elementos vinculados.";
  }

  // Unique constraint violation
  if (rawMessage.includes("duplicate key") || rawMessage.includes("unique constraint")) {
    return "Ya existe un registro con esos datos. Verifica que no esté duplicado.";
  }

  // Not null violation
  if (rawMessage.includes("not-null constraint") || rawMessage.includes("null value in column")) {
    return "Faltan campos obligatorios. Por favor completa todos los campos requeridos.";
  }

  // RLS policy violation
  if (rawMessage.includes("row-level security") || rawMessage.includes("new row violates")) {
    return "No tienes permisos para realizar esta acción.";
  }

  // Network / connection errors
  if (rawMessage.includes("Failed to fetch") || rawMessage.includes("NetworkError")) {
    return "Error de conexión. Verifica tu conexión a internet e intenta de nuevo.";
  }

  // Auth: email already registered
  if (rawMessage.includes("already been registered") || rawMessage.includes("already registered")) {
    return "Ya existe una cuenta registrada con ese correo.";
  }

  // Auth: new password must differ from current
  if (rawMessage.includes("New password should be different")) {
    return "La nueva contraseña debe ser diferente a la actual.";
  }

  // Auth: password too short
  if (rawMessage.includes("Password should be at least") || rawMessage.includes("password is too short")) {
    return "La contraseña es demasiado corta.";
  }

  // Storage: file too large
  if (
    rawMessage.includes("Payload too large") ||
    rawMessage.includes("exceeded the maximum allowed size") ||
    rawMessage.includes("maximum allowed size")
  ) {
    return "El archivo es demasiado grande.";
  }

  // Storage: mime type not allowed
  if (rawMessage.includes("mime type") || rawMessage.includes("not allowed")) {
    return "Ese tipo de archivo no está permitido.";
  }

  // Fallback: return context + generic message
  return context
    ? `${context}. Por favor intenta de nuevo o contacta al administrador.`
    : "Ocurrió un error inesperado. Por favor intenta de nuevo.";
}

export function relativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  return formatDate(dateString);
}
