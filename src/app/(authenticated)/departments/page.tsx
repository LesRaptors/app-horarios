"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { departmentSchema } from "@/lib/validations";
import type { Department, Location } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Building2,
} from "lucide-react";
import { canManage, canAdmin } from "@/lib/auth/can-manage";

export default function DepartmentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] =
    useState<Department | null>(null);
  const [formName, setFormName] = useState("");
  const [formLocationId, setFormLocationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = canAdmin(profile?.role);
  const isAuthorized = canManage(profile?.role);

  // Fetch departments with location join
  async function fetchDepartments() {
    setLoading(true);
    const { data, error } = await supabase
      .from("departments")
      .select("*, location:locations(id, name)")
      .order("name");

    if (error) {
      toast.error("Error al cargar los departamentos");
    } else {
      setDepartments(data ?? []);
    }
    setLoading(false);
  }

  // Fetch locations for the select dropdown
  async function fetchLocations() {
    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Error al cargar las sedes");
    } else {
      setLocations(data ?? []);
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      fetchDepartments();
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

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">No autorizado</p>
      </div>
    );
  }

  // Filtered departments
  const filteredDepartments = departments.filter((dept) =>
    dept.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Open dialog for create
  function handleCreate() {
    setEditingDepartment(null);
    setFormName("");
    setFormLocationId("");
    setFormErrors({});
    setDialogOpen(true);
  }

  // Open dialog for edit
  function handleEdit(department: Department) {
    setEditingDepartment(department);
    setFormName(department.name);
    setFormLocationId(department.location_id);
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
    const result = departmentSchema.safeParse({
      name: formName,
      location_id: formLocationId,
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

    if (editingDepartment) {
      // Update
      const { error } = await supabase
        .from("departments")
        .update({
          name: result.data.name,
          location_id: result.data.location_id,
        })
        .eq("id", editingDepartment.id);

      if (error) {
        toast.error("Error al actualizar el departamento");
      } else {
        toast.success("Departamento actualizado exitosamente");
        setDialogOpen(false);
        fetchDepartments();
      }
    } else {
      // Create
      const { error } = await supabase.from("departments").insert({
        name: result.data.name,
        location_id: result.data.location_id,
        organization_id: profile?.organization_id ?? "",
      });

      if (error) {
        toast.error("Error al crear el departamento");
      } else {
        toast.success("Departamento creado exitosamente");
        setDialogOpen(false);
        fetchDepartments();
      }
    }

    setSaving(false);
  }

  // Confirm delete
  async function handleDeleteConfirm() {
    if (!deletingId) return;

    setDeleting(true);
    const { error } = await supabase
      .from("departments")
      .delete()
      .eq("id", deletingId);

    if (error) {
      toast.error(
        "Error al eliminar el departamento. Puede tener puestos o empleados asociados."
      );
    } else {
      toast.success("Departamento eliminado");
      fetchDepartments();
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
            <Building2 className="h-8 w-8" />
            Departamentos
          </h1>
          <p className="text-muted-foreground">
            Gestiona los departamentos de la empresa
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo departamento
        </Button>
      </div>

      {/* Search + Table Card */}
      <Card>
        <CardHeader>
          <CardTitle>Listado de departamentos</CardTitle>
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
          ) : filteredDepartments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No se encontraron departamentos con ese nombre"
                  : "No hay departamentos registrados"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead className="w-[100px] text-right">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDepartments.map((department) => (
                    <TableRow key={department.id}>
                      <TableCell className="font-medium">
                        {department.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {department.location?.name ?? "Sin sede"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(department)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(department.id)}
                              title="Eliminar"
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDepartment
                ? "Editar departamento"
                : "Nuevo departamento"}
            </DialogTitle>
            <DialogDescription>
              {editingDepartment
                ? "Modifica los datos del departamento"
                : "Completa los datos para crear un nuevo departamento"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dept-location">Sede</Label>
              <Select
                value={formLocationId}
                onValueChange={setFormLocationId}
              >
                <SelectTrigger id="dept-location">
                  <SelectValue placeholder="Selecciona una sede" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.location_id && (
                <p className="text-sm text-destructive">
                  {formErrors.location_id}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-name">Nombre</Label>
              <Input
                id="dept-name"
                placeholder="Ej: Recursos Humanos"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              {formErrors.name && (
                <p className="text-sm text-destructive">{formErrors.name}</p>
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
              {editingDepartment ? "Guardar cambios" : "Crear departamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar departamento</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acci&oacute;n no se puede deshacer. Se eliminar&aacute; el
              departamento y todos los datos asociados. &iquest;Est&aacute;s
              seguro?
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
