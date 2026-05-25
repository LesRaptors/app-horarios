import {
  GRACE_DAYS,
  PAST_DUE_REMINDER_DAYS,
  TRIAL_REMINDER_DAYS_BEFORE,
  type Subscription,
} from "./types";

export type DunningAction =
  | { kind: "email"; template: "trial-ending" | "payment-failed" | "pause-warning"; daysOffset: number }
  | { kind: "transition"; to: "past_due" | "paused" }
  | null;

function daysBetween(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function decideDunningAction(sub: Subscription, now: Date): DunningAction {
  const periodEnd = new Date(sub.current_period_end);
  const daysFromEnd = daysBetween(now, periodEnd);

  if (sub.status === "trialing") {
    if (daysFromEnd >= 0) return { kind: "transition", to: "past_due" };
    const daysBefore = -daysFromEnd;
    if (TRIAL_REMINDER_DAYS_BEFORE.includes(daysBefore)) {
      return { kind: "email", template: "trial-ending", daysOffset: -daysBefore };
    }
    return null;
  }

  if (sub.status === "past_due") {
    if (daysFromEnd > GRACE_DAYS) return { kind: "transition", to: "paused" };
    if (PAST_DUE_REMINDER_DAYS.includes(daysFromEnd)) {
      const template = daysFromEnd === 5 ? "pause-warning" : "payment-failed";
      return { kind: "email", template, daysOffset: daysFromEnd };
    }
    return null;
  }

  return null;
}
