// src/lib/profile-helpers.test.ts
import { describe, it, expect } from "vitest";
import {
  getInitials,
  validatePhone,
  validateEmail,
  validatePasswordChange,
  validateAvatarFile,
  resolveAvailability,
  AVATAR_MAX_BYTES,
} from "./profile-helpers";

describe("getInitials", () => {
  it("toma la primera letra de nombre y apellido en mayúscula", () => {
    expect(getInitials("simón", "urrego")).toBe("SU");
  });
  it("tolera apellido vacío", () => {
    expect(getInitials("Ana", "")).toBe("A");
  });
});

describe("validatePhone", () => {
  it("acepta un celular colombiano", () => {
    expect(validatePhone("+57 300 123 4567")).toBeNull();
  });
  it("acepta vacío (opcional)", () => {
    expect(validatePhone("")).toBeNull();
  });
  it("rechaza con letras", () => {
    expect(validatePhone("abc123")).not.toBeNull();
  });
  it("rechaza demasiado corto", () => {
    expect(validatePhone("123")).not.toBeNull();
  });
});

describe("validateEmail", () => {
  it("acepta un email válido", () => {
    expect(validateEmail("a@b.co")).toBeNull();
  });
  it("rechaza sin arroba", () => {
    expect(validateEmail("ab.co")).not.toBeNull();
  });
});

describe("validatePasswordChange", () => {
  it("acepta cambio válido", () => {
    expect(validatePasswordChange("vieja123", "nuevaClave8", "nuevaClave8")).toBeNull();
  });
  it("rechaza si la nueva es menor a 8", () => {
    expect(validatePasswordChange("vieja123", "corta", "corta")).not.toBeNull();
  });
  it("rechaza si no coinciden", () => {
    expect(validatePasswordChange("vieja123", "nuevaClave8", "otra12345")).not.toBeNull();
  });
  it("rechaza si la actual está vacía", () => {
    expect(validatePasswordChange("", "nuevaClave8", "nuevaClave8")).not.toBeNull();
  });
});

describe("validateAvatarFile", () => {
  it("acepta png dentro del límite", () => {
    expect(validateAvatarFile({ type: "image/png", size: 1000 })).toBeNull();
  });
  it("rechaza tipo no permitido", () => {
    expect(validateAvatarFile({ type: "application/pdf", size: 1000 })).not.toBeNull();
  });
  it("rechaza si excede el tamaño", () => {
    expect(validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 })).not.toBeNull();
  });
});

describe("resolveAvailability", () => {
  it("usa el override del empleado cuando existe", () => {
    expect(resolveAvailability(false, true)).toBe(false);
  });
  it("cae al default del contrato cuando el override es null", () => {
    expect(resolveAvailability(null, true)).toBe(true);
  });
});
