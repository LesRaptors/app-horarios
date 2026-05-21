import type { UserRole } from "@/lib/types";

/** Roles autorizados para gestión (configuración + write). Incluye super_admin. */
export function canManage(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin" || role === "manager";
}

/** Roles autorizados para acciones admin-only (settings, contract-types). */
export function canAdmin(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

/** True solo para super_admin (acceso cross-org). */
export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === "super_admin";
}
