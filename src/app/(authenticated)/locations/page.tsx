"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { locationSchema } from "@/lib/validations";
import type { Location } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search, MapPin } from "lucide-react";

export default function LocationsPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch locations
  async function fetchLocations() {
    setLoading(true);
    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Error al cargar las sedes");
    } else {
      setLocations(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (profile?.role === "admin") {
      fetchLocations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Auth guards
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (profile?.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">No autorizado</p>
      </div>
    );
  }

  // Filtered locations
  const filteredLocations = locations.filter((loc) =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Open dialog for create
  function handleCreate() {
    setEditingLocation(null);
    setFormName("");
    setFormAddress("");
    setFormErrors({});
    setDialogOpen(true);
  }

  // Open dialog for edit
  function handleEdit(location: Location) {
    setEditingLocation(location);
    setFormName(location.name);
    setFormAddress(location.address);
    setFormErrors({});
    setDialogOpen(true);
  }

  // Open delete confirmation
  function handleDeleteClick(id: string) {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  }

  // Submit create/edit
  async function handleSubmit() {
    const result = locationSchema.safeParse({
      name: formName,
      address: formAddress,
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    setFormErrors({});

    if (editingLocation) {
      // Update
      const { error } = await supabase
        .from("locations")
        .update({ name: result.data.name, address: result.data.address })
        .eq("id", editingLocation.id);

      if (error) {
        toast.error("Error al actualizar la sede");
      } else {
        toast.success("Sede actualizada exitosamente");
        setDialogOpen(false);
        fetchLocations();
      }
    } else {
      // Create
      const { error } = await supabase
        .from("locations")
        .insert({ name: result.data.name, address: result.data.address });

      if (error) {
        toast.error("Error al crear la sede");
      } else {
        toast.success("Sede creada exitosamente");
        setDialogOpen(false);
        fetchLocations();
      }
    }

    setSaving(false);
  }

  // Confirm delete
  async function handleDeleteConfirm() {
    if (!deletingId) return;

    setDeleting(true);
    const { error } = await supabase
      .from("locations")
      .delete()
      .eq("id", deletingId);

    if (error) {
      toast.error("Error al eliminar la sede. Puede tener departamentos asociados.");
    } else {
      toast.success("Sede eliminada");
      fetchLocations();
    }

    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeletingId(null);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="h-8 w-8" />
            Sedes
          </h1>
          <p className="text-muted-foreground">
            Gestiona las sedes de la empresa
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva sede
        </Button>
      </div>

      {/* Search + Table Card */}
      <Card>
        <CardHeader>
          <CardTitle>Listado de sedes</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Cargando...</span>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MapPin className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No se encontraron sedes con ese nombre"
                  : "No hay sedes registradas"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Direcci&oacute;n</TableHead>
                    <TableHead className="w-[100px] text-right">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLocations.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">
                        {location.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {location.address}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(location)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(location.id)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? "Editar sede" : "Nueva sede"}
            </DialogTitle>
            <DialogDescription>
              {editingLocation
                ? "Modifica los datos de la sede"
                : "Completa los datos para crear una nueva sede"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="location-name">Nombre</Label>
              <Input
                id="location-name"
                placeholder="Ej: Sede Central"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              {formErrors.name && (
                <p className="text-sm text-destructive">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-address">Direcci&oacute;n</Label>
              <Textarea
                id="location-address"
                placeholder="Ej: Calle Principal 123, Ciudad"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                rows={3}
              />
              {formErrors.address && (
                <p className="text-sm text-destructive">
                  {formErrors.address}
                </p>
              )}
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
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingLocation ? "Guardar cambios" : "Crear sede"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar sede</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acci&oacute;n no se puede deshacer. Se eliminar&aacute; la
              sede y todos los datos asociados. &iquest;Est&aacute;s seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
