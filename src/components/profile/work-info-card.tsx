"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { resolveAvailability } from "@/lib/profile-helpers";
import { formatDate } from "@/lib/utils";
import type { Profile } from "@/lib/types";

function YesNo({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? "default" : "secondary"}>
      {value ? "Sí" : "No"}
    </Badge>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-right">{children}</dd>
    </div>
  );
}

export function WorkInfoCard({ profile }: { profile: Profile }) {
  const contract = profile.contract_type;
  const worksOnSundays = resolveAvailability(
    profile.available_sundays,
    contract?.available_sundays ?? true
  );
  const worksOnHolidays = resolveAvailability(
    profile.available_holidays,
    contract?.available_holidays ?? true
  );
  const worksAtNight = resolveAvailability(
    profile.available_nights,
    contract?.available_nights ?? true
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Información laboral</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label="Rol">{ROLE_LABELS[profile.role] ?? profile.role}</Row>
          <Row label="Sede">{profile.location?.name ?? "—"}</Row>
          <Row label="Posición">{profile.position?.name ?? "—"}</Row>
          <Row label="Tipo de contrato">{contract?.name ?? "—"}</Row>
          <Row label="Fecha de ingreso">
            {profile.hire_date ? formatDate(profile.hire_date) : "—"}
          </Row>
          <Row label="Trabaja domingos">
            <YesNo value={worksOnSundays} />
          </Row>
          <Row label="Trabaja festivos">
            <YesNo value={worksOnHolidays} />
          </Row>
          <Row label="Trabaja noches">
            <YesNo value={worksAtNight} />
          </Row>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Estos datos los gestiona tu administrador.
        </p>
      </CardContent>
    </Card>
  );
}
