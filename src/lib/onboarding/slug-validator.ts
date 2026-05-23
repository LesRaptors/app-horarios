import { isReservedSlug } from "@/lib/tenant-resolver";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 50) return false;
  return SLUG_REGEX.test(slug);
}

export type SlugRejection = "invalid_format" | "reserved";

// Composición de validaciones: formato + no-reservado. Usar en cualquier
// punto donde se valide un slug propuesto por el usuario (live check UI,
// API endpoints, etc.).
export function checkSlugAllowed(slug: string): SlugRejection | null {
  if (!isValidSlug(slug)) return "invalid_format";
  if (isReservedSlug(slug)) return "reserved";
  return null;
}

export function sanitizeSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
