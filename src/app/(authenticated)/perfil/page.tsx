"use client";

import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/shared/page-header";
import { WorkInfoCard } from "@/components/profile/work-info-card";
import { Loader2 } from "lucide-react";

export default function PerfilPage() {
  const { profile, user, loading, refreshProfile: _refreshProfile } = useAuth();

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
        <WorkInfoCard profile={profile} />
        {/*
          Tarjeta de datos personales — Task 5
          <PersonalInfoCard profile={profile} user={user} onUpdated={_refreshProfile} />

          Tarjeta de cambio de contraseña — Task 6
          <PasswordCard profile={profile} user={user} onUpdated={_refreshProfile} />

          Tarjeta de foto de perfil — Task 7
          <AvatarCard profile={profile} user={user} onUpdated={_refreshProfile} />
        */}
      </div>
    </div>
  );
}
