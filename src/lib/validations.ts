import { z } from "zod";

export const locationSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  address: z.string().min(1, "La dirección es obligatoria"),
});

export const departmentSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  location_id: z.string().uuid("Selecciona una sede"),
});

export const positionSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  department_id: z.string().uuid("Selecciona un departamento"),
  color: z.string().min(1, "Selecciona un color"),
});

export const shiftTemplateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  start_time: z.string().min(1, "La hora de inicio es obligatoria"),
  end_time: z.string().min(1, "La hora de fin es obligatoria"),
  break_minutes: z.coerce.number().min(0, "Los minutos de descanso no pueden ser negativos"),
  color: z.string().min(1, "Selecciona un color"),
  location_id: z.string().uuid("Selecciona una sede"),
});

export const inviteEmployeeSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  first_name: z.string().min(1, "El nombre es obligatorio"),
  last_name: z.string().min(1, "El apellido es obligatorio"),
  role: z.enum(["admin", "manager", "employee"]),
  phone: z.string().optional(),
  position_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  max_hours_per_week: z.coerce.number().min(1).max(168).default(40),
});

export const editEmployeeSchema = z.object({
  first_name: z.string().min(1, "El nombre es obligatorio"),
  last_name: z.string().min(1, "El apellido es obligatorio"),
  role: z.enum(["admin", "manager", "employee"]),
  phone: z.string().optional().nullable(),
  position_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  max_hours_per_week: z.coerce.number().min(1).max(168),
  is_active: z.boolean(),
});

export const scheduleEntrySchema = z.object({
  schedule_id: z.string().uuid(),
  employee_id: z.string().uuid("Selecciona un empleado"),
  position_id: z.string().uuid("Selecciona una posición"),
  date: z.string().min(1, "La fecha es obligatoria"),
  start_time: z.string().min(1, "La hora de inicio es obligatoria"),
  end_time: z.string().min(1, "La hora de fin es obligatoria"),
  shift_template_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type LocationFormData = z.infer<typeof locationSchema>;
export type DepartmentFormData = z.infer<typeof departmentSchema>;
export type PositionFormData = z.infer<typeof positionSchema>;
export type ShiftTemplateFormData = z.infer<typeof shiftTemplateSchema>;
export type InviteEmployeeFormData = z.infer<typeof inviteEmployeeSchema>;
export type EditEmployeeFormData = z.infer<typeof editEmployeeSchema>;
export const timeOffRequestSchema = z
  .object({
    start_date: z.string().min(1, "La fecha de inicio es obligatoria"),
    end_date: z.string().min(1, "La fecha de fin es obligatoria"),
    reason: z.string().min(1, "El motivo es obligatorio"),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: "La fecha de fin debe ser igual o posterior a la de inicio",
    path: ["end_date"],
  });

export const shiftSwapRequestSchema = z.object({
  target_id: z.string().uuid("Selecciona un empleado"),
  requester_entry_id: z.string().uuid("Selecciona tu turno"),
  target_entry_id: z.string().uuid("Selecciona el turno del otro empleado"),
});

export const staffingRequirementSchema = z.object({
  location_id: z.string().uuid("Selecciona una sede"),
  position_id: z.string().uuid("Selecciona una posición"),
  shift_template_id: z.string().uuid("Selecciona una plantilla de turno"),
  day_of_week: z.coerce.number().min(0).max(6),
  required_count: z.coerce.number().min(0, "La cantidad no puede ser negativa"),
});

export type ScheduleEntryFormData = z.infer<typeof scheduleEntrySchema>;
export type TimeOffRequestFormData = z.infer<typeof timeOffRequestSchema>;
export type ShiftSwapRequestFormData = z.infer<typeof shiftSwapRequestSchema>;
export type StaffingRequirementFormData = z.infer<typeof staffingRequirementSchema>;
