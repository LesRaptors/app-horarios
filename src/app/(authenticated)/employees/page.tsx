"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
import { Plus, Pencil, Loader2, Search, UserPlus, Repeat } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";
import type {
  Profile,
  Location,
  Department,
  Position,
  UserRole,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Types for fetched profiles with joins
// ---------------------------------------------------------------------------
interface ProfileWithJoins extends Omit<Profile, "position" | "location"> {
  position: {
    id: string;
    name: string;
    department: {
      id: string;
      name: string;
      location_id: string;
    };
  } | null;
  location: {
    id: string;
    name: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Invite form state
// ---------------------------------------------------------------------------
interface InviteForm {
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  phone: string;
  location_id: string;
  department_id: string;
  position_id: string;
  max_hours_per_week: number;
}

const emptyInviteForm: InviteForm = {
  email: "",
  first_name: "",
  last_name: "",
  role: "employee",
  phone: "",
  location_id: "",
  department_id: "",
  position_id: "",
  max_hours_per_week: 40,
};

// ---------------------------------------------------------------------------
// Edit form state
// ---------------------------------------------------------------------------
interface EditForm {
  id: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  phone: string;
  location_id: string;
  department_id: string;
  position_id: string;
  max_hours_per_week: number;
  is_active: boolean;
  secondary_position_ids: string[];
}

// ---------------------------------------------------------------------------
// Role badge helper
// ---------------------------------------------------------------------------
function RoleBadge({ role }: { role: string }) {
  if (role === "admin") {
    return <Badge variant="default">{ROLE_LABELS[role]}</Badge>;
  }
  if (role === "manager") {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        {ROLE_LABELS[role]}
      </Badge>
    );
  }
  return <Badge variant="secondary">{ROLE_LABELS[role] ?? role}</Badge>;
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------
function StatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
        Activo
      </Badge>
    );
  }
  return (
    <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
      Inactivo
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Demo badge helper
// ---------------------------------------------------------------------------
function DemoBadge() {
  return (
    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
      Demo
    </Badge>
  );
}

// ===========================================================================
// PAGE COMPONENT
// ===========================================================================
export default function EmployeesPage() {
  const { profile: currentProfile, loading: authLoading } = useAuth();
  const supabase = createClient();

  // ---- Data state ----------------------------------------------------------
  const [employees, setEmployees] = useState<ProfileWithJoins[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ---- Search --------------------------------------------------------------
  const [search, setSearch] = useState("");

  // ---- Invite dialog -------------------------------------------------------
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm);
  const [inviteLoading, setInviteLoading] = useState(false);

  // ---- Edit dialog ---------------------------------------------------------
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // ---- Demo filter -----------------------------------------------------------
  const [demoFilter, setDemoFilter] = useState<"all" | "real" | "demo">("all");

  // ---- Demo create dialog ----------------------------------------------------
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoForm, setDemoForm] = useState({
    first_name: "",
    last_name: "",
    role: "employee" as UserRole,
    location_id: "",
    department_id: "",
    position_id: "",
    max_hours_per_week: 40,
  });
  const [demoLoading, setDemoLoading] = useState(false);

  // ---- Convert dialog --------------------------------------------------------
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertDemoId, setConvertDemoId] = useState("");
  const [convertEmail, setConvertEmail] = useState("");
  const [convertLoading, setConvertLoading] = useState(false);

  // ---- Transfer dialog -------------------------------------------------------
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDemoId, setTransferDemoId] = useState("");
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  // --------------------------------------------------------------------------
  // Fetch all data
  // --------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [profilesRes, locationsRes, departmentsRes, positionsRes] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(
              "*, position:positions(id, name, department:departments(id, name, location_id)), location:locations(id, name)"
            )
            .order("last_name"),
          supabase.from("locations").select("*").order("name"),
          supabase.from("departments").select("*").order("name"),
          supabase.from("positions").select("*").order("name"),
        ]);

      if (profilesRes.data) setEmployees(profilesRes.data as ProfileWithJoins[]);
      if (locationsRes.data) setLocations(locationsRes.data as Location[]);
      if (departmentsRes.data) setDepartments(departmentsRes.data as Department[]);
      if (positionsRes.data) setPositions(positionsRes.data as Position[]);
    } catch {
      toast.error("Error al cargar los datos");
    } finally {
      setLoadingData(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!authLoading && currentProfile) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentProfile]);

  // --------------------------------------------------------------------------
  // Filtered employees (client-side search)
  // --------------------------------------------------------------------------
  const filteredEmployees = useMemo(() => {
    let result = employees;

    // Demo filter
    if (demoFilter === "real") {
      result = result.filter((e) => !e.is_demo);
    } else if (demoFilter === "demo") {
      result = result.filter((e) => e.is_demo);
    }

    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter((e) => {
      const fullName = `${e.first_name} ${e.last_name}`.toLowerCase();
      const email = e.email?.toLowerCase() ?? "";
      return fullName.includes(q) || email.includes(q);
    });
  }, [employees, search, demoFilter]);

  // --------------------------------------------------------------------------
  // Cascading position filter helpers
  // --------------------------------------------------------------------------
  const filteredDepartments = useCallback(
    (locationId: string) =>
      departments.filter((d) => d.location_id === locationId),
    [departments]
  );

  const filteredPositionsByDept = useCallback(
    (departmentId: string) =>
      positions.filter((p) => p.department_id === departmentId),
    [positions]
  );

  // --------------------------------------------------------------------------
  // INVITE: handlers
  // --------------------------------------------------------------------------
  function openInviteDialog() {
    setInviteForm(emptyInviteForm);
    setInviteOpen(true);
  }

  async function handleInvite() {
    if (!inviteForm.email || !inviteForm.first_name || !inviteForm.last_name) {
      toast.error("Por favor completa los campos obligatorios");
      return;
    }

    setInviteLoading(true);
    try {
      const res = await fetch("/api/employees/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteForm.email,
          first_name: inviteForm.first_name,
          last_name: inviteForm.last_name,
          role: inviteForm.role,
          phone: inviteForm.phone || undefined,
          position_id: inviteForm.position_id || undefined,
          location_id: inviteForm.location_id || undefined,
          max_hours_per_week: inviteForm.max_hours_per_week,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Error al invitar empleado");
        return;
      }

      toast.success("Invitacion enviada exitosamente");
      setInviteOpen(false);
      fetchData();
    } catch {
      toast.error("Error al invitar empleado");
    } finally {
      setInviteLoading(false);
    }
  }

  // --------------------------------------------------------------------------
  // EDIT: handlers
  // --------------------------------------------------------------------------
  async function openEditDialog(emp: ProfileWithJoins) {
    const locationId =
      emp.location_id ??
      emp.location?.id ??
      emp.position?.department?.location_id ??
      "";
    const departmentId = emp.position?.department?.id ?? "";

    // Fetch secondary positions for this employee
    const { data: secondaryData } = await supabase
      .from("employee_secondary_positions")
      .select("position_id")
      .eq("employee_id", emp.id);

    setEditForm({
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      role: emp.role,
      phone: emp.phone ?? "",
      location_id: locationId,
      department_id: departmentId,
      position_id: emp.position_id ?? "",
      max_hours_per_week: emp.max_hours_per_week,
      is_active: emp.is_active,
      secondary_position_ids: secondaryData?.map((s) => s.position_id) ?? [],
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editForm) return;

    if (!editForm.first_name || !editForm.last_name) {
      toast.error("Nombre y apellido son obligatorios");
      return;
    }

    setEditLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          role: editForm.role,
          phone: editForm.phone || null,
          position_id: editForm.position_id || null,
          location_id: editForm.location_id || null,
          max_hours_per_week: editForm.max_hours_per_week,
          is_active: editForm.is_active,
        })
        .eq("id", editForm.id);

      if (error) {
        toast.error(translateDbError(error.message, "Error al guardar el empleado"));
        return;
      }

      // Sync secondary positions: delete all then insert new
      await supabase
        .from("employee_secondary_positions")
        .delete()
        .eq("employee_id", editForm.id);

      if (editForm.secondary_position_ids.length > 0) {
        const { error: secError } = await supabase
          .from("employee_secondary_positions")
          .insert(
            editForm.secondary_position_ids.map((posId) => ({
              employee_id: editForm.id,
              position_id: posId,
            }))
          );

        if (secError) {
          toast.error(translateDbError(secError.message, "Error al guardar posiciones secundarias"));
          return;
        }
      }

      toast.success("Empleado actualizado exitosamente");
      setEditOpen(false);
      fetchData();
    } catch {
      toast.error("Error al actualizar empleado");
    } finally {
      setEditLoading(false);
    }
  }

  // --------------------------------------------------------------------------
  // DEMO: handlers
  // --------------------------------------------------------------------------
  async function handleDemoCreate() {
    if (!demoForm.first_name || !demoForm.last_name) {
      toast.error("Por favor completa nombre y apellido");
      return;
    }

    setDemoLoading(true);
    try {
      const res = await fetch("/api/employees/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: demoForm.first_name,
          last_name: demoForm.last_name,
          role: demoForm.role,
          location_id: demoForm.location_id || undefined,
          department_id: demoForm.department_id || undefined,
          position_id: demoForm.position_id || undefined,
          max_hours_per_week: demoForm.max_hours_per_week,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Error al crear empleado demo");
        return;
      }

      toast.success("Empleado demo creado exitosamente");
      setDemoOpen(false);
      setDemoForm({
        first_name: "",
        last_name: "",
        role: "employee",
        location_id: "",
        department_id: "",
        position_id: "",
        max_hours_per_week: 40,
      });
      fetchData();
    } catch {
      toast.error("Error al crear empleado demo");
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleConvert() {
    if (!convertEmail) {
      toast.error("Por favor ingresa un email");
      return;
    }

    setConvertLoading(true);
    try {
      const res = await fetch("/api/employees/demo/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo_id: convertDemoId,
          email: convertEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Error al convertir empleado demo");
        return;
      }

      toast.success(
        `Empleado convertido exitosamente. ${data.entries_migrated ?? 0} entradas migradas.`
      );
      setConvertOpen(false);
      setConvertDemoId("");
      setConvertEmail("");
      fetchData();
    } catch {
      toast.error("Error al convertir empleado demo");
    } finally {
      setConvertLoading(false);
    }
  }

  async function handleTransfer() {
    if (!transferTargetId) {
      toast.error("Por favor selecciona un empleado destino");
      return;
    }

    setTransferLoading(true);
    try {
      const res = await fetch("/api/employees/demo/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo_id: transferDemoId,
          target_employee_id: transferTargetId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Error al transferir turnos");
        return;
      }

      toast.success(
        `Turnos transferidos exitosamente. ${data.entries_transferred ?? 0} entradas transferidas.`
      );
      setTransferOpen(false);
      setTransferDemoId("");
      setTransferTargetId("");
      fetchData();
    } catch {
      toast.error("Error al transferir turnos");
    } finally {
      setTransferLoading(false);
    }
  }

  // --------------------------------------------------------------------------
  // AUTH GUARD
  // --------------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (
    !currentProfile ||
    !["admin", "manager"].includes(currentProfile.role)
  ) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">
          No tienes permisos para ver esta pagina.
        </p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Empleados</h1>
          <p className="text-muted-foreground">
            Gestiona los empleados de tu organizacion
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDemoForm({
                first_name: "",
                last_name: "",
                role: "employee",
                location_id: "",
                department_id: "",
                position_id: "",
                max_hours_per_week: 40,
              });
              setDemoOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear demo
          </Button>
          <Button onClick={openInviteDialog}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invitar empleado
          </Button>
        </div>
      </div>

      {/* Search + Demo filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={demoFilter}
          onValueChange={(val) =>
            setDemoFilter(val as "all" | "real" | "demo")
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="real">Solo reales</SelectItem>
            <SelectItem value="demo">Solo demos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loadingData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">
                {search.trim()
                  ? "No se encontraron empleados con esa busqueda."
                  : "No hay empleados registrados aun."}
              </p>
              {!search.trim() && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={openInviteDialog}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Invitar primer empleado
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Posicion</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {emp.first_name} {emp.last_name}
                        {emp.is_demo && <DemoBadge />}
                      </span>
                    </TableCell>
                    <TableCell>{emp.email}</TableCell>
                    <TableCell>
                      <RoleBadge role={emp.role} />
                    </TableCell>
                    <TableCell>
                      {emp.position?.name ?? <span className="text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell>
                      {emp.location?.name ?? <span className="text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge isActive={emp.is_active} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {emp.is_demo && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Convertir a empleado real"
                              onClick={() => {
                                setConvertDemoId(emp.id);
                                setConvertEmail("");
                                setConvertOpen(true);
                              }}
                            >
                              <UserPlus className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Transferir turnos"
                              onClick={() => {
                                setTransferDemoId(emp.id);
                                setTransferTargetId("");
                                setTransferOpen(true);
                              }}
                            >
                              <Repeat className="h-4 w-4 text-blue-600" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(emp)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* INVITE DIALOG                                                      */}
      {/* ================================================================== */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invitar empleado</DialogTitle>
            <DialogDescription>
              Se enviara un correo de invitacion al empleado para que establezca
              su contrasena e inicie sesion.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Email */}
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="empleado@empresa.com"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>

            {/* First & last name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="invite-first-name">Nombre *</Label>
                <Input
                  id="invite-first-name"
                  placeholder="Nombre"
                  value={inviteForm.first_name}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      first_name: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invite-last-name">Apellido *</Label>
                <Input
                  id="invite-last-name"
                  placeholder="Apellido"
                  value={inviteForm.last_name}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      last_name: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Role */}
            <div className="grid gap-2">
              <Label>Rol *</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(val) =>
                  setInviteForm((f) => ({ ...f, role: val as UserRole }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="employee">Empleado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Location (Sede) */}
            <div className="grid gap-2">
              <Label>Sede</Label>
              <Select
                value={inviteForm.location_id}
                onValueChange={(val) =>
                  setInviteForm((f) => ({
                    ...f,
                    location_id: val,
                    department_id: "",
                    position_id: "",
                  }))
                }
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

            {/* Department (filtered by location) */}
            <div className="grid gap-2">
              <Label>Departamento</Label>
              <Select
                value={inviteForm.department_id}
                onValueChange={(val) =>
                  setInviteForm((f) => ({
                    ...f,
                    department_id: val,
                    position_id: "",
                  }))
                }
                disabled={!inviteForm.location_id}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      inviteForm.location_id
                        ? "Seleccionar departamento"
                        : "Primero selecciona una sede"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {inviteForm.location_id &&
                    filteredDepartments(inviteForm.location_id).map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Position (filtered by department) */}
            <div className="grid gap-2">
              <Label>Posicion</Label>
              <Select
                value={inviteForm.position_id}
                onValueChange={(val) =>
                  setInviteForm((f) => ({ ...f, position_id: val }))
                }
                disabled={!inviteForm.department_id}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      inviteForm.department_id
                        ? "Seleccionar posicion"
                        : "Primero selecciona un departamento"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {inviteForm.department_id &&
                    filteredPositionsByDept(inviteForm.department_id).map((pos) => (
                      <SelectItem key={pos.id} value={pos.id}>
                        {pos.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Phone */}
            <div className="grid gap-2">
              <Label htmlFor="invite-phone">Telefono</Label>
              <Input
                id="invite-phone"
                placeholder="+34 600 000 000"
                value={inviteForm.phone}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>

            {/* Max hours */}
            <div className="grid gap-2">
              <Label htmlFor="invite-hours">Horas maximas/semana</Label>
              <Input
                id="invite-hours"
                type="number"
                min={1}
                max={168}
                value={inviteForm.max_hours_per_week}
                onChange={(e) =>
                  setInviteForm((f) => ({
                    ...f,
                    max_hours_per_week: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={inviteLoading}
            >
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={inviteLoading}>
              {inviteLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Enviar invitacion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* EDIT DIALOG                                                        */}
      {/* ================================================================== */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar empleado</DialogTitle>
            <DialogDescription>
              Modifica los datos del empleado seleccionado.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="grid gap-4 py-4">
              {/* First & last name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-first-name">Nombre *</Label>
                  <Input
                    id="edit-first-name"
                    value={editForm.first_name}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, first_name: e.target.value } : f
                      )
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-last-name">Apellido *</Label>
                  <Input
                    id="edit-last-name"
                    value={editForm.last_name}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, last_name: e.target.value } : f
                      )
                    }
                  />
                </div>
              </div>

              {/* Role */}
              <div className="grid gap-2">
                <Label>Rol</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(val) =>
                    setEditForm((f) =>
                      f ? { ...f, role: val as UserRole } : f
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="employee">Empleado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Location (Sede) */}
              <div className="grid gap-2">
                <Label>Sede</Label>
                <Select
                  value={editForm.location_id}
                  onValueChange={(val) =>
                    setEditForm((f) =>
                      f ? { ...f, location_id: val, department_id: "", position_id: "" } : f
                    )
                  }
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

              {/* Department (filtered by location) */}
              <div className="grid gap-2">
                <Label>Departamento</Label>
                <Select
                  value={editForm.department_id}
                  onValueChange={(val) =>
                    setEditForm((f) =>
                      f ? { ...f, department_id: val, position_id: "" } : f
                    )
                  }
                  disabled={!editForm.location_id}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        editForm.location_id
                          ? "Seleccionar departamento"
                          : "Primero selecciona una sede"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {editForm.location_id &&
                      filteredDepartments(editForm.location_id).map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Position (filtered by department) */}
              <div className="grid gap-2">
                <Label>Posicion</Label>
                <Select
                  value={editForm.position_id}
                  onValueChange={(val) =>
                    setEditForm((f) => (f ? { ...f, position_id: val } : f))
                  }
                  disabled={!editForm.department_id}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        editForm.department_id
                          ? "Seleccionar posicion"
                          : "Primero selecciona un departamento"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {editForm.department_id &&
                      filteredPositionsByDept(editForm.department_id).map((pos) => (
                        <SelectItem key={pos.id} value={pos.id}>
                          {pos.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Secondary positions */}
              <div className="grid gap-2">
                <Label>Posiciones secundarias</Label>
                <p className="text-xs text-muted-foreground">
                  Posiciones adicionales que este empleado puede cubrir
                </p>
                <div className="max-h-32 overflow-y-auto rounded border p-2 space-y-1">
                  {positions
                    .filter((p) => p.id !== editForm.position_id)
                    .map((pos) => (
                      <label
                        key={pos.id}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editForm.secondary_position_ids.includes(pos.id)}
                          onChange={(e) => {
                            setEditForm((f) => {
                              if (!f) return f;
                              const ids = e.target.checked
                                ? [...f.secondary_position_ids, pos.id]
                                : f.secondary_position_ids.filter((id) => id !== pos.id);
                              return { ...f, secondary_position_ids: ids };
                            });
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: pos.color }}
                        />
                        {pos.name}
                      </label>
                    ))}
                  {positions.filter((p) => p.id !== editForm.position_id).length === 0 && (
                    <p className="text-xs text-muted-foreground">No hay otras posiciones disponibles</p>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Telefono</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((f) =>
                      f ? { ...f, phone: e.target.value } : f
                    )
                  }
                />
              </div>

              {/* Max hours */}
              <div className="grid gap-2">
                <Label htmlFor="edit-hours">Horas maximas/semana</Label>
                <Input
                  id="edit-hours"
                  type="number"
                  min={1}
                  max={168}
                  value={editForm.max_hours_per_week}
                  onChange={(e) =>
                    setEditForm((f) =>
                      f
                        ? {
                            ...f,
                            max_hours_per_week: Number(e.target.value),
                          }
                        : f
                    )
                  }
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <input
                  id="edit-active"
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) =>
                    setEditForm((f) =>
                      f ? { ...f, is_active: e.target.checked } : f
                    )
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-active">Estado activo</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={editLoading}
            >
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* DEMO CREATE DIALOG                                                 */}
      {/* ================================================================== */}
      <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear empleado demo</DialogTitle>
            <DialogDescription>
              Crea un empleado ficticio para pruebas. No se enviara ninguna
              invitacion.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* First & last name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="demo-first-name">Nombre *</Label>
                <Input
                  id="demo-first-name"
                  placeholder="Nombre"
                  value={demoForm.first_name}
                  onChange={(e) =>
                    setDemoForm((f) => ({
                      ...f,
                      first_name: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="demo-last-name">Apellido *</Label>
                <Input
                  id="demo-last-name"
                  placeholder="Apellido"
                  value={demoForm.last_name}
                  onChange={(e) =>
                    setDemoForm((f) => ({
                      ...f,
                      last_name: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Role */}
            <div className="grid gap-2">
              <Label>Rol *</Label>
              <Select
                value={demoForm.role}
                onValueChange={(val) =>
                  setDemoForm((f) => ({ ...f, role: val as UserRole }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="employee">Empleado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Location (Sede) */}
            <div className="grid gap-2">
              <Label>Sede</Label>
              <Select
                value={demoForm.location_id}
                onValueChange={(val) =>
                  setDemoForm((f) => ({
                    ...f,
                    location_id: val,
                    department_id: "",
                    position_id: "",
                  }))
                }
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

            {/* Department (filtered by location) */}
            <div className="grid gap-2">
              <Label>Departamento</Label>
              <Select
                value={demoForm.department_id}
                onValueChange={(val) =>
                  setDemoForm((f) => ({
                    ...f,
                    department_id: val,
                    position_id: "",
                  }))
                }
                disabled={!demoForm.location_id}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      demoForm.location_id
                        ? "Seleccionar departamento"
                        : "Primero selecciona una sede"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {demoForm.location_id &&
                    filteredDepartments(demoForm.location_id).map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Position (filtered by department) */}
            <div className="grid gap-2">
              <Label>Posicion</Label>
              <Select
                value={demoForm.position_id}
                onValueChange={(val) =>
                  setDemoForm((f) => ({ ...f, position_id: val }))
                }
                disabled={!demoForm.department_id}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      demoForm.department_id
                        ? "Seleccionar posicion"
                        : "Primero selecciona un departamento"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {demoForm.department_id &&
                    filteredPositionsByDept(demoForm.department_id).map(
                      (pos) => (
                        <SelectItem key={pos.id} value={pos.id}>
                          {pos.name}
                        </SelectItem>
                      )
                    )}
                </SelectContent>
              </Select>
            </div>

            {/* Max hours */}
            <div className="grid gap-2">
              <Label htmlFor="demo-hours">Horas maximas/semana</Label>
              <Input
                id="demo-hours"
                type="number"
                min={1}
                max={168}
                value={demoForm.max_hours_per_week}
                onChange={(e) =>
                  setDemoForm((f) => ({
                    ...f,
                    max_hours_per_week: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDemoOpen(false)}
              disabled={demoLoading}
            >
              Cancelar
            </Button>
            <Button onClick={handleDemoCreate} disabled={demoLoading}>
              {demoLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear empleado demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* CONVERT DIALOG                                                     */}
      {/* ================================================================== */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir empleado demo</DialogTitle>
            <DialogDescription>
              Convierte este empleado demo en un empleado real. Se enviara una
              invitacion al email proporcionado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="convert-email">Email *</Label>
              <Input
                id="convert-email"
                type="email"
                placeholder="empleado@empresa.com"
                value={convertEmail}
                onChange={(e) => setConvertEmail(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConvertOpen(false)}
              disabled={convertLoading}
            >
              Cancelar
            </Button>
            <Button onClick={handleConvert} disabled={convertLoading}>
              {convertLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Convertir e invitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* TRANSFER DIALOG                                                    */}
      {/* ================================================================== */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir turnos</DialogTitle>
            <DialogDescription>
              Transfiere todos los turnos de este empleado demo a un empleado
              real.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Empleado destino *</Label>
              <Select
                value={transferTargetId}
                onValueChange={setTransferTargetId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empleado" />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((e) => !e.is_demo && e.is_active)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.first_name} {e.last_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransferOpen(false)}
              disabled={transferLoading}
            >
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={transferLoading}>
              {transferLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Transferir turnos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
