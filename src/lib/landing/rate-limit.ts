// src/lib/landing/rate-limit.ts
// Rate limit in-memory para form público. 5 requests por IP por hora.
// Suficiente para MVP. Migrar a Redis/Upstash si tráfico crece.

const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

const requests = new Map<string, number[]>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const arr = (requests.get(ip) ?? []).filter((ts) => now - ts < WINDOW_MS);

  if (arr.length >= RATE_LIMIT) {
    const oldest = Math.min(...arr);
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    requests.set(ip, arr);
    return { allowed: false, retryAfterSeconds };
  }

  arr.push(now);
  requests.set(ip, arr);
  return { allowed: true };
}
