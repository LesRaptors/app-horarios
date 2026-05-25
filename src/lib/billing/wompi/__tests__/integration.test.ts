import { describe, it, expect } from "vitest";
import { getAcceptanceTokens } from "../client";

/**
 * Tests de integración contra el SANDBOX real de Wompi.
 *
 * Se ejecutan SOLO si WOMPI_PRIVATE_KEY (prefijo prv_test_) y
 * NEXT_PUBLIC_WOMPI_PUBLIC_KEY (prefijo pub_test_) están presentes en el entorno.
 * En CI/local normal vitest NO carga .env → estos tests se skipean.
 *
 * Para correrlos manualmente con las llaves sandbox:
 *   NEXT_PUBLIC_WOMPI_PUBLIC_KEY=pub_test_... WOMPI_PRIVATE_KEY=prv_test_... npm run test -- integration
 *
 * Hacen llamadas de red reales a https://sandbox.wompi.co/v1.
 */

const SANDBOX_AVAILABLE =
  !!process.env.WOMPI_PRIVATE_KEY &&
  process.env.WOMPI_PRIVATE_KEY.startsWith("prv_test_") &&
  !!process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY &&
  process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY.startsWith("pub_test_");

describe.skipIf(!SANDBOX_AVAILABLE)("Wompi sandbox integration", () => {
  it("getAcceptanceTokens devuelve los 2 tokens de aceptación + URLs", async () => {
    const tokens = await getAcceptanceTokens();
    expect(tokens.acceptance_token).toBeTruthy();
    expect(tokens.accept_personal_auth).toBeTruthy();
    expect(tokens.terms_url).toMatch(/^https?:\/\//);
    expect(tokens.privacy_url).toMatch(/^https?:\/\//);
  });
});
