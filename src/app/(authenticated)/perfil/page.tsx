"use client";

import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/shared/page-header";
import { PersonalDataCard } from "@/components/profile/personal-data-card";
import { WorkInfoCard } from "@/components/profile/work-info-card";
import { SecurityCard } from "@/components/profile/security-card";
import { EmailCard } from "@/components/profile/email-card";
import { Loader2 } from "lucide-react";

export default function PerfilPage() {
  const { profile, user, loading, refreshProfile } = useAuth();

  if (loading || !profile || !user) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mi perfil" />
      <div className="grid gap-6 lg:grid-cols-2">
        <PersonalDataCard profile={profile} user={user} onUpdated={refreshProfile} />
        <WorkInfoCard profile={profile} />
        <SecurityCard user={user} />
        <EmailCard user={user} />
      </div>
    </div>
  );
}
