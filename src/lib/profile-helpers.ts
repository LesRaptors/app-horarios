// src/lib/profile-helpers.ts
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function getInitials(firstName: string, lastName: string): string {
  const a = (firstName ?? "").trim().charAt(0);
  const b = (lastName ?? "").trim().charAt(0);
  return `${a}${b}`.toUpperCase();
}

export function validatePhone(phone: string): string | null {
  const trimmed = (phone ?? "").trim();
  if (trimmed === "") return null; // opcional
  if (!/^[+\d][\d\s-]*$/.test(trimmed)) {
    return "El teléfono solo puede tener dígitos, espacios, + y -.";
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return "El teléfono debe tener entre 7 y 15 dígitos.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = (email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Ingresa un correo válido.";
  }
  return null;
}

export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string
): string | null {
  if (!current) return "Ingresa tu contraseña actual.";
  if (next.length < 8) return "La nueva contraseña debe tener al menos 8 caracteres.";
  if (next !== confirm) return "Las contraseñas no coinciden.";
  return null;
}

export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return "La foto debe ser JPG, PNG o WEBP.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "La foto no puede superar 2 MB.";
  }
  return null;
}

export function resolveAvailability(
  override: boolean | null | undefined,
  contractDefault: boolean
): boolean {
  return override === null || override === undefined ? contractDefault : override;
}
