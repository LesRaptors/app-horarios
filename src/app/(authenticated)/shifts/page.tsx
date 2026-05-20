"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { COLOR_PALETTE } from "@/lib/constants";
import { translateDbError } from "@/lib/utils";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";

function formatTime(time: string): string {
  return time?.slice(0, 5) || "";
}

function calculateDuration(
  start: string,
  end: string,
  breakMin: number
): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let totalMin = eh * 60 + em - (sh * 60 + sm);
  if (totalMin < 0) totalMin += 24 * 60;
  const effectiveMin = totalMin - breakMin;
  const hours = Math.floor(effectiveMin / 60);
  const mins = effectiveMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface LocationItem {
  id: string;
  name: string;
}

interface ShiftTemplateItem {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  location_id: string;
  location: {
    id: string;
    name: string;
  } | null;
}

export default function ShiftsPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [shifts, setShifts] = useState<ShiftTemplateItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShiftTemplateItem | null>(
    null
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formLocationId, setFormLocationId] = useState("");
  const [formName, setFormName] = useState("");
  const [formStartTime, setFormStartTime] = useState("06:00");
  const [formEndTime, setFormEndTime] = useState("14:00");
  const [formBreakMinutes, setFormBreakMinutes] = useState(30);
  const [formColor, setFormColor] = useState<string>(COLOR_PALETTE[0].value);

  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";

  async function fetchData() {
    setLoading(true);
    const [shiftRes, locRes] = await Promise.all([
      supabase
        .from("shift_templates")
        .select("*, location:locations(id, name)")
        .order("name"),
      supabase.from("locations").select("id, name").order("name"),
    ]);

    if (shiftRes.error) {
      toast.error(
        "Error al cargar plantillas de turno: " + shiftRes.error.message
      );
    } else {
      setShifts(shiftRes.data ?? []);
    }

    if (locRes.data) setLocations(locRes.data);

    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && (isAdmin || isManager)) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  function openCreateDialog() {
    setEditingItem(null);
    setFormLocationId("");
    setFormName("");
    setFormStartTime("06:00");
    setFormEndTime("14:00");
    setFormBreakMinutes(30);
    setFormColor(COLOR_PALETTE[0].value);
    setDialogOpen(true);
  }

  function openEditDialog(item: ShiftTemplateItem) {
    setEditingItem(item);
    setFormLocationId(item.location_id);
    setFormName(item.name);
    setFormStartTime(formatTime(item.start_time));
    setFormEndTime(formatTime(item.end_time));
    setFormBreakMinutes(item.break_minutes);
    setFormColor(item.color || COLOR_PALETTE[0].value);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!formLocationId) {
      toast.error("Debes seleccionar una sede");
      return;
    }
    if (!formStartTime || !formEndTime) {
      toast.error("Las horas de inicio y fin son obligatorias");
      return;
    }

    setSaving(true);

    const payload = {
      name: formName.trim(),
      location_id: formLocationId,
      start_time: formStartTime,
      end_time: formEndTime,
      break_minutes: formBreakMinutes,
      color: formColor,
    };

    if (editingItem) {
      const { error } = await supabase
        .from("shift_templates")
        .update(payload)
        .eq("id", editingItem.id);

      if (error) {
        toast.error(translateDbError(error.message, "Error al actualizar el turno"));
      } else {
        toast.success("Plantilla de turno actualizada correctamente");
        setDialogOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase.from("shift_templates").insert({
        ...payload,
        organization_id: profile?.organization_id ?? "",
      });

      if (error) {
        toast.error(translateDbError(error.message, "Error al crear el turno"));
      } else {
        toast.success("Plantilla de turno creada correctamente");
        setDialogOpen(false);
        fetchData();
      }
    }

    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteId) return;

    const { error } = await supabase
      .from("shift_templates")
      .delete()
      .eq("id", deleteId);

    if (error) {
      toast.error(translateDbError(error.message, "Error al eliminar el turno"));
    } else {
      toast.success("Plantilla de turno eliminada correctamente");
      fetchData();
    }

    setDeleteId(null);
  }

  const filteredShifts = shifts.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin && !isManager) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">
          No tienes permisos para acceder a esta pagina.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plantillas de turno</h1>
          <p className="text-muted-foreground">
            Gestiona las plantillas de horarios de turno
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva plantilla
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">
                {search
                  ? "No se encontraron plantillas con ese nombre."
                  : "No hay plantillas de turno creadas aun."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Color</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Descanso</TableHead>
                  <TableHead>Duracion</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell>
                      <div
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: shift.color }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{shift.name}</TableCell>
                    <TableCell>
                      {formatTime(shift.start_time)} -{" "}
                      {formatTime(shift.end_time)}
                    </TableCell>
                    <TableCell>{shift.break_minutes} min</TableCell>
                    <TableCell>
                      {calculateDuration(
                        shift.start_time,
                        shift.end_time,
                        shift.break_minutes
                      )}
                    </TableCell>
                    <TableCell>{shift.location?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(shift)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(shift.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? "Editar plantilla de turno"
                : "Nueva plantilla de turno"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Modifica los datos de la plantilla de turno."
                : "Completa los datos para crear una nueva plantilla de turno."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Sede */}
            <div className="space-y-2">
              <Label>Sede</Label>
              <Select value={formLocationId} onValueChange={setFormLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sede" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nombre */}
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                placeholder="Ej: Turno manana, Turno noche..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Hora inicio y fin */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora de inicio</Label>
                <Input
                  type="time"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora de fin</Label>
                <Input
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Minutos de descanso */}
            <div className="space-y-2">
              <Label>Minutos de descanso</Label>
              <Input
                type="number"
                min={0}
                value={formBreakMinutes}
                onChange={(e) =>
                  setFormBreakMinutes(parseInt(e.target.value) || 0)
                }
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    className={`h-8 w-8 rounded-full cursor-pointer transition-all ${
                      formColor === c.value
                        ? "ring-2 ring-offset-2 ring-primary"
                        : ""
                    }`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setFormColor(c.value)}
                  />
                ))}
              </div>
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
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? "Guardar cambios" : "Crear plantilla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar plantilla de turno</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. Se eliminara la plantilla de
              turno de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
