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

interface LocationItem {
  id: string;
  name: string;
}

interface DepartmentItem {
  id: string;
  name: string;
  location_id: string;
}

interface PositionItem {
  id: string;
  name: string;
  color: string;
  department_id: string;
  department: {
    id: string;
    name: string;
    location: {
      id: string;
      name: string;
    };
  } | null;
}

export default function PositionsPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PositionItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState<string>(COLOR_PALETTE[0].value);

  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";

  async function fetchData() {
    setLoading(true);
    const [posRes, locRes, depRes] = await Promise.all([
      supabase
        .from("positions")
        .select(
          "*, department:departments(id, name, location:locations(id, name))"
        )
        .order("name"),
      supabase.from("locations").select("id, name").order("name"),
      supabase
        .from("departments")
        .select("id, name, location_id")
        .order("name"),
    ]);

    if (posRes.error) {
      toast.error(translateDbError(posRes.error.message, "Error al cargar posiciones"));
    } else {
      setPositions(posRes.data ?? []);
    }

    if (locRes.data) setLocations(locRes.data);
    if (depRes.data) setDepartments(depRes.data);

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
    setSelectedLocationId("");
    setFormDepartmentId("");
    setFormName("");
    setFormColor(COLOR_PALETTE[0].value);
    setDialogOpen(true);
  }

  function openEditDialog(item: PositionItem) {
    setEditingItem(item);
    const locId = item.department?.location?.id ?? "";
    setSelectedLocationId(locId);
    setFormDepartmentId(item.department_id);
    setFormName(item.name);
    setFormColor(item.color || COLOR_PALETTE[0].value);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!formDepartmentId) {
      toast.error("Debes seleccionar un departamento");
      return;
    }

    setSaving(true);

    const payload = {
      name: formName.trim(),
      department_id: formDepartmentId,
      color: formColor,
    };

    if (editingItem) {
      const { error } = await supabase
        .from("positions")
        .update(payload)
        .eq("id", editingItem.id);

      if (error) {
        toast.error(translateDbError(error.message, "Error al actualizar la posición"));
      } else {
        toast.success("Posición actualizada correctamente");
        setDialogOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase.from("positions").insert(payload);

      if (error) {
        toast.error(translateDbError(error.message, "Error al crear la posición"));
      } else {
        toast.success("Posición creada correctamente");
        setDialogOpen(false);
        fetchData();
      }
    }

    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteId) return;

    const { error } = await supabase
      .from("positions")
      .delete()
      .eq("id", deleteId);

    if (error) {
      toast.error(translateDbError(error.message, "Error al eliminar la posición"));
    } else {
      toast.success("Posición eliminada correctamente");
      fetchData();
    }

    setDeleteId(null);
  }

  const filteredDepartments = departments.filter(
    (d) => d.location_id === selectedLocationId
  );

  const filteredPositions = positions.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-3xl font-bold">Posiciones</h1>
          <p className="text-muted-foreground">
            Gestiona las posiciones de trabajo
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva posición
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
          ) : filteredPositions.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">
                {search
                  ? "No se encontraron posiciones con ese nombre."
                  : "No hay posiciones creadas aun."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Color</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.map((position) => (
                  <TableRow key={position.id}>
                    <TableCell>
                      <div
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: position.color }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {position.name}
                    </TableCell>
                    <TableCell>
                      {position.department?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {position.department?.location?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(position)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(position.id)}
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
              {editingItem ? "Editar posición" : "Nueva posición"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Modifica los datos de la posición."
                : "Completa los datos para crear una nueva posición."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Sede (Location) */}
            <div className="space-y-2">
              <Label>Sede</Label>
              <Select
                value={selectedLocationId}
                onValueChange={(val) => {
                  setSelectedLocationId(val);
                  setFormDepartmentId("");
                }}
              >
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

            {/* Departamento */}
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Select
                value={formDepartmentId}
                onValueChange={setFormDepartmentId}
                disabled={!selectedLocationId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedLocationId
                        ? "Seleccionar departamento"
                        : "Primero selecciona una sede"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredDepartments.map((dep) => (
                    <SelectItem key={dep.id} value={dep.id}>
                      {dep.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nombre */}
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                placeholder="Ej: Cajero, Supervisor..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
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
              {editingItem ? "Guardar cambios" : "Crear posición"}
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
            <AlertDialogTitle>Eliminar posición</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la posición de forma
              permanente.
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
