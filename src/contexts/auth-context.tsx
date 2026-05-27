"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { computeEffectiveOrgId } from "@/lib/auth/effective-org";

type OrgRow = Database["public"]["Tables"]["organizations"]["Row"];

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  activeOrgId: string | null;
  activeOrg: OrgRow | null;
  effectiveOrgId: string | null;
  setActiveOrg: (orgId: string | null) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrg, setActiveOrgState] = useState<OrgRow | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*, position:positions(*), location:locations(*)")
          .eq("id", user.id)
          .single();
        setProfile(profileData as unknown as Profile);

        const isSA = (profileData as unknown as Profile)?.role === "super_admin";
        if (isSA) {
          const { data: saao } = await supabase
            .from("super_admin_active_org")
            .select("active_org_id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (saao?.active_org_id) {
            const { data: orgData } = await supabase
              .from("organizations")
              .select("*")
              .eq("id", saao.active_org_id)
              .single();
            setActiveOrgState((orgData as OrgRow) ?? null);
          } else {
            setActiveOrgState(null);
          }
        }
      }

      setLoading(false);
    }

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setActiveOrgState(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setActiveOrg = useCallback(async (orgId: string | null) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_active_org", {
      p_org_id: orgId as string,
    });
    if (error) throw error;
    if (orgId === null) {
      setActiveOrgState(null);
    } else {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();
      setActiveOrgState((data as OrgRow) ?? null);
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const isSuperAdmin = profile?.role === "super_admin";
  const activeOrgId = activeOrg?.id ?? null;
  const effectiveOrgId = computeEffectiveOrgId(
    profile?.organization_id ?? null,
    activeOrgId
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isSuperAdmin,
        activeOrgId,
        activeOrg,
        effectiveOrgId,
        setActiveOrg,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
