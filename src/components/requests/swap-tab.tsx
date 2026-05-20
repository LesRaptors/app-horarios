"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatDate, formatTime, translateDbError } from "@/lib/utils";
import type { ShiftSwapRequest, ScheduleEntry, Profile } from "@/lib/types";

interface SwapWithDetails extends ShiftSwapRequest {
  requester?: Profile;
  target?: Profile;
  requester_entry?: ScheduleEntry & { position?: { name: string } };
  target_entry?: ScheduleEntry & { position?: { name: string } };
}

export function SwapTab() {
  const { user, profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [swaps, setSwaps] = useState<SwapWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state for new swap
  const [myEntries, setMyEntries] = useState<ScheduleEntry[]>([]);
  const [targetEmployees, setTargetEmployees] = useState<Profile[]>([]);
  const [targetEntries, setTargetEntries] = useState<ScheduleEntry[]>([]);
  const [selectedMyEntry, setSelectedMyEntry] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedTargetEntry, setSelectedTargetEntry] = useState("");

  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";
  const canManage = isAdmin || isManager;

  async function fetchSwaps() {
    setLoading(true);
    let query = supabase
      .from("shift_swap_requests")
      .select(`
        *,
        requester:profiles!shift_swap_requests_requester_id_fkey(id, first_name, last_name),
        target:profiles!shift_swap_requests_target_id_fkey(id, first_name, last_name),
        requester_entry:schedule_entries!shift_swap_requests_requester_entry_id_fkey(id, date, start_time, end_time, position:positions(name)),
        target_entry:schedule_entries!shift_swap_requests_target_entry_id_fkey(id, date, start_time, end_time, position:positions(name))
      `)
      .order("created_at", { ascending: false });

    if (!canManage) {
      query = query.or(`requester_id.eq.${user?.id},target_id.eq.${user?.id}`);
    }

    const { data, error } = await query;
    if (error) {
      toast.error(translateDbError(error.message, "Error al cargar intercambios"));
    } else {
      setSwaps((data as unknown as SwapWithDetails[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && user) {
      fetchSwaps();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  async function openCreateDialog() {
    setSelectedMyEntry("");
    setSelectedTargetId("");
    setSelectedTargetEntry("");
    setDialogOpen(true);

    // Fetch my upcoming schedule entries from published schedules
    const { data: myData } = await supabase
      .from("schedule_entries")
      .select("*, schedule:schedules!inner(status), position:positions(name)")
      .eq("employee_id", user!.id)
      .eq("schedule.status", "published")
      .gte("date", new Date().toISOString().split("T")[0])
      .order("date");
    setMyEntries((myData as ScheduleEntry[]) || []);

    // Fetch other employees from same location
    const { data: empData } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("location_id", profile!.location_id!)
      .eq("is_active", true)
      .neq("id", user!.id)
      .order("last_name");
    setTargetEmployees((empData as Profile[]) || []);
  }

  // When target employee changes, fetch their entries
  useEffect(() => {
    if (!selectedTargetId) {
      setTargetEntries([]);
      return;
    }

    async function fetchTargetEntries() {
      const { data } = await supabase
        .from("schedule_entries")
        .select("*, schedule:schedules!inner(status), position:positions(name)")
        .eq("employee_id", selectedTargetId)
        .eq("schedule.status", "published")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date");
      setTargetEntries((data as ScheduleEntry[]) || []);
    }

    fetchTargetEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTargetId]);

  async function handleCreate() {
    if (!selectedMyEntry || !selectedTargetId || !selectedTargetEntry) {
      toast.error("Selecciona todos los campos");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("shift_swap_requests").insert({
      requester_id: user!.id,
      target_id: selectedTargetId,
      requester_entry_id: selectedMyEntry,
      target_entry_id: selectedTargetEntry,
      status: "pending" as const,
      organization_id: profile?.organization_id ?? "",
    });

    if (error) {
      toast.error(translateDbError(error.message, "Error al crear solicitud de intercambio"));
    } else {
      toast.success("Solicitud de intercambio enviada");
      setDialogOpen(false);
      fetchSwaps();
    }
    setSaving(false);
  }

  async function handleAccept(swapId: string) {
    setSaving(true);
    const { error } = await supabase
      .from("shift_swap_requests")
      .update({ status: "accepted" })
      .eq("id", swapId);

    if (error) {
      toast.error(translateDbError(error.message, "Error al aceptar intercambio"));
    } else {
      toast.success("Intercambio aceptado. Pendiente de aprobación del manager.");
      fetchSwaps();
    }
    setSaving(false);
  }

  async function handleReject(swapId: string) {
    setSaving(true);
    const { error } = await supabase
      .from("shift_swap_requests")
      .update({ status: "rejected" })
      .eq("id", swapId);

    if (error) {
      toast.error(translateDbError(error.message, "Error al rechazar intercambio"));
    } else {
      toast.success("Intercambio rechazado");
      fetchSwaps();
    }
    setSaving(false);
  }

  async function handleApprove(swapId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/swaps/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swap_id: swapId, reviewer_id: user?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al aprobar intercambio");
      } else {
        toast.success("Intercambio aprobado y turnos intercambiados");
        fetchSwaps();
      }
    } catch {
      toast.error("Error de conexión");
    }
    setSaving(false);
  }

  function formatEntryLabel(entry: ScheduleEntry & { position?: { name: string } }) {
    return `${formatDate(entry.date)} | ${formatTime(entry.start_time)}-${formatTime(entry.end_time)}${entry.position ? ` (${entry.position.name})` : ""}`;
  }

  function getSwapActions(swap: SwapWithDetails) {
    // Target can accept/reject when pending
    if (swap.status === "pending" && swap.target_id === user?.id) {
      return (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-green-600"
            onClick={() => handleAccept(swap.id)}
            disabled={saving}
            title="Aceptar"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-600"
            onClick={() => handleReject(swap.id)}
            disabled={saving}
            title="Rechazar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    // Manager can approve when accepted
    if (swap.status === "accepted" && canManage) {
      return (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-green-600"
            onClick={() => handleApprove(swap.id)}
            disabled={saving}
            title="Aprobar"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-600"
            onClick={() => handleReject(swap.id)}
            disabled={saving}
            title="Rechazar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {canManage
            ? "Todos los intercambios de turnos"
            : "Tus solicitudes de intercambio"}
        </p>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo intercambio
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : swaps.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No hay intercambios.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Su turno</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Turno destino</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {swaps.map((swap) => (
                  <TableRow key={swap.id}>
                    <TableCell className="font-medium">
                      {swap.requester
                        ? `${swap.requester.first_name} ${swap.requester.last_name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {swap.requester_entry
                        ? `${formatDate(swap.requester_entry.date)} ${formatTime(swap.requester_entry.start_time)}-${formatTime(swap.requester_entry.end_time)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {swap.target
                        ? `${swap.target.first_name} ${swap.target.last_name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {swap.target_entry
                        ? `${formatDate(swap.target_entry.date)} ${formatTime(swap.target_entry.start_time)}-${formatTime(swap.target_entry.end_time)}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={swap.status} type="swap" />
                    </TableCell>
                    <TableCell>{getSwapActions(swap)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create swap dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo intercambio de turno</DialogTitle>
            <DialogDescription>
              Selecciona tu turno y el turno del compañero con el que quieres intercambiar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* My entry */}
            <div className="space-y-2">
              <Label>Tu turno</Label>
              <Select value={selectedMyEntry} onValueChange={setSelectedMyEntry}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tu turno" />
                </SelectTrigger>
                <SelectContent>
                  {myEntries.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {formatEntryLabel(e as ScheduleEntry & { position?: { name: string } })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {myEntries.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No tienes turnos publicados próximos.
                </p>
              )}
            </div>

            {/* Target employee */}
            <div className="space-y-2">
              <Label>Compañero</Label>
              <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un compañero" />
                </SelectTrigger>
                <SelectContent>
                  {targetEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target entry */}
            {selectedTargetId && (
              <div className="space-y-2">
                <Label>Turno del compañero</Label>
                <Select
                  value={selectedTargetEntry}
                  onValueChange={setSelectedTargetEntry}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona el turno" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetEntries.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {formatEntryLabel(e as ScheduleEntry & { position?: { name: string } })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {targetEntries.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Este compañero no tiene turnos publicados próximos.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !selectedMyEntry || !selectedTargetId || !selectedTargetEntry}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
