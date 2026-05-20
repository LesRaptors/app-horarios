"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, Check, X } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { formatDate, translateDbError } from "@/lib/utils";
import type { TimeOffRequest } from "@/lib/types";

export function TimeOffTab() {
  const { user, profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";
  const canManage = isAdmin || isManager;

  async function fetchRequests() {
    setLoading(true);
    let query = supabase
      .from("time_off_requests")
      .select("*, employee:profiles!time_off_requests_employee_id_fkey(id, first_name, last_name, email), reviewer:profiles!time_off_requests_reviewed_by_fkey(id, first_name, last_name)")
      .order("created_at", { ascending: false });

    // Employees only see their own
    if (!canManage) {
      query = query.eq("employee_id", user!.id);
    }

    const { data, error } = await query;
    if (error) {
      toast.error(translateDbError(error.message, "Error al cargar solicitudes"));
    } else {
      setRequests((data as TimeOffRequest[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && user) {
      fetchRequests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  function openCreateDialog() {
    setStartDate("");
    setEndDate("");
    setReason("");
    setDialogOpen(true);
  }

  async function handleCreate() {
    if (!startDate || !endDate || !reason.trim()) {
      toast.error("Completa todos los campos");
      return;
    }
    if (endDate < startDate) {
      toast.error("La fecha de fin debe ser igual o posterior a la de inicio");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("time_off_requests").insert({
      employee_id: user!.id,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
      status: "pending" as const,
      organization_id: profile?.organization_id ?? "",
    });

    if (error) {
      toast.error(translateDbError(error.message, "Error al crear solicitud"));
    } else {
      toast.success("Solicitud creada correctamente");
      setDialogOpen(false);
      fetchRequests();
    }
    setSaving(false);
  }

  async function handleReview(requestId: string, status: "approved" | "rejected") {
    setSaving(true);
    const { error } = await supabase
      .from("time_off_requests")
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      toast.error(translateDbError(error.message, "Error al actualizar solicitud"));
    } else {
      toast.success(status === "approved" ? "Solicitud aprobada" : "Solicitud rechazada");
      fetchRequests();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {canManage
            ? "Todas las solicitudes de días libres"
            : "Tus solicitudes de días libres"}
        </p>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva solicitud
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No hay solicitudes.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && <TableHead>Empleado</TableHead>}
                  <TableHead>Fecha inicio</TableHead>
                  <TableHead>Fecha fin</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Estado</TableHead>
                  {canManage && <TableHead className="w-24">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    {canManage && (
                      <TableCell className="font-medium">
                        {req.employee
                          ? `${req.employee.first_name} ${req.employee.last_name}`
                          : "—"}
                      </TableCell>
                    )}
                    <TableCell>{formatDate(req.start_date)}</TableCell>
                    <TableCell>{formatDate(req.end_date)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {req.reason}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={req.status} type="request" />
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {req.status === "pending" && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-700"
                              onClick={() => handleReview(req.id, "approved")}
                              disabled={saving}
                              title="Aprobar"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                              onClick={() => handleReview(req.id, "rejected")}
                              disabled={saving}
                              title="Rechazar"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva solicitud de días libres</DialogTitle>
            <DialogDescription>
              Solicita días libres indicando el rango de fechas y el motivo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha inicio</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha fin</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                placeholder="Describe el motivo de tu solicitud..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
