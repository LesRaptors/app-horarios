"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Calendar, Users, Clock, FileText, Loader2 } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";
import { formatTime, formatDate } from "@/lib/utils";

interface UpcomingShift {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  position: { name: string; color: string } | null;
}

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [myShiftsCount, setMyShiftsCount] = useState(0);
  const [weeklyHours, setWeeklyHours] = useState(0);
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [upcomingShifts, setUpcomingShifts] = useState<UpcomingShift[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";
  const canManage = isAdmin || isManager;

  useEffect(() => {
    if (authLoading || !user) return;
    const userId = user.id;

    async function fetchStats() {
      setStatsLoading(true);
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // Get start of current week (Monday)
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const weekStartStr = weekStart.toISOString().split("T")[0];
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      try {
        // 1. My shifts this month (from published schedules)
        const { count: shiftsCount } = await supabase
          .from("schedule_entries")
          .select("id, schedule:schedules!inner(status, month, year)", { count: "exact", head: true })
          .eq("employee_id", userId)
          .eq("schedule.status", "published")
          .eq("schedule.month", currentMonth)
          .eq("schedule.year", currentYear);
        setMyShiftsCount(shiftsCount || 0);

        // 2. Hours this week
        const { data: weekEntries } = await supabase
          .from("schedule_entries")
          .select("start_time, end_time, schedule:schedules!inner(status)")
          .eq("employee_id", userId)
          .eq("schedule.status", "published")
          .gte("date", weekStartStr)
          .lte("date", weekEndStr);

        let totalHours = 0;
        for (const entry of weekEntries || []) {
          const [sh, sm] = entry.start_time.split(":").map(Number);
          const [eh, em] = entry.end_time.split(":").map(Number);
          let mins = eh * 60 + em - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          totalHours += mins / 60;
        }
        setWeeklyHours(Math.round(totalHours * 10) / 10);

        // 3. Active employees (admin/manager only)
        if (canManage) {
          const { count: empCount } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true);
          setActiveEmployees(empCount || 0);

          // 4. Pending requests
          const { count: reqCount } = await supabase
            .from("time_off_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending");
          setPendingRequests(reqCount || 0);
        }

        // 5. Upcoming shifts (next 5)
        const { data: upcoming } = await supabase
          .from("schedule_entries")
          .select("id, date, start_time, end_time, position:positions(name, color), schedule:schedules!inner(status)")
          .eq("employee_id", userId)
          .eq("schedule.status", "published")
          .gte("date", today)
          .order("date")
          .limit(5);
        setUpcomingShifts(upcoming || []);
      } catch {
        // Silently handle errors — dashboard is non-critical
      }

      setStatsLoading(false);
    }

    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold">
          Hola, {profile?.first_name} {profile?.last_name}
        </h1>
        <p className="text-muted-foreground">
          {profile && ROLE_LABELS[profile.role]} — Panel de control
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Mis turnos este mes
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : myShiftsCount}
            </div>
            <p className="text-xs text-muted-foreground">turnos asignados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Horas esta semana
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : weeklyHours}
            </div>
            <p className="text-xs text-muted-foreground">
              de {profile?.max_hours_per_week ?? 40}h máximo
            </p>
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Empleados activos
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : activeEmployees}
              </div>
              <p className="text-xs text-muted-foreground">en el sistema</p>
            </CardContent>
          </Card>
        )}

        {canManage && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Solicitudes pendientes
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : pendingRequests}
              </div>
              <p className="text-xs text-muted-foreground">por revisar</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Upcoming shifts */}
      <Card>
        <CardHeader>
          <CardTitle>Próximos turnos</CardTitle>
          <CardDescription>
            Tus turnos programados para los próximos días
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : upcomingShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay turnos programados próximamente.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingShifts.map((shift) => {
                const date = new Date(shift.date + "T00:00:00");
                const dayName = date.toLocaleDateString("es-ES", { weekday: "short" });

                return (
                  <div
                    key={shift.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {shift.position && (
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: shift.position.color }}
                        />
                      )}
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {dayName} {formatDate(shift.date)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {shift.position?.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm font-medium">
                      {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
