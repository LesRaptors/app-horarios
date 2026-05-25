"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type BillingStatus = {
  subscription: { status: string; current_period_end: string; cancel_at_period_end: boolean | null } | null;
  trialDaysLeft: number | null;
  isPaused: boolean;
  isPastDue: boolean;
  isTrialingNearEnd: boolean;
};

const POLL_MS = 60_000;

export function useBillingStatus(enabled: boolean): BillingStatus {
  const [state, setState] = useState<BillingStatus>({
    subscription: null,
    trialDaysLeft: null,
    isPaused: false,
    isPastDue: false,
    isTrialingNearEnd: false,
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let cancelled = false;

    const fetchOnce = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.organization_id) return;
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status, current_period_end, cancel_at_period_end")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (cancelled) return;
      if (!sub) {
        setState({
          subscription: null,
          trialDaysLeft: null,
          isPaused: false,
          isPastDue: false,
          isTrialingNearEnd: false,
        });
        return;
      }
      const daysLeft = Math.floor(
        (new Date(sub.current_period_end).getTime() - Date.now()) /
          (24 * 60 * 60 * 1000)
      );
      setState({
        subscription: sub,
        trialDaysLeft: sub.status === "trialing" ? daysLeft : null,
        isPaused: sub.status === "paused",
        isPastDue: sub.status === "past_due",
        isTrialingNearEnd: sub.status === "trialing" && daysLeft <= 7,
      });
    };

    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    const onFocus = () => fetchOnce();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);

  return state;
}
