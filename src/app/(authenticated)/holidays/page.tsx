"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { translateDbError } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { HolidayDate, Location } from "@/lib/types";
import { canManage, canAdmin } from "@/lib/auth/can-manage";

export default function HolidaysPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const [nacionales, setNacionales] = useState<HolidayDate[]>([]);
  const [sedes, setSedes] = useState<Location[]>([]);
  const [localHolidays, setLocalHolidays] = useState<HolidayDate[]>([]);
  const [selectedSede, setSelectedSede] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [formIsNational, setFormIsNational] = useState(true);
  const [formSede, setFormSede] = useState<string>("");
  const [formDate, setFormDate] = useState("");
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = canAdmin(profile?.role);
  const isManagerOrAdmin = canManage(profile?.role);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: nat } = await supabase
      .from("holidays").select("*").is("location_id", null).order("date");
    setNacionales((nat ?? []) as HolidayDate[]);
    const { data: locs } = await supabase.from("locations").select("*").order("name");
    setSedes((locs ?? []) as Location[]);
    if (selectedSede) {
      const { data: local } = await supabase
        .from("holidays").select("*").eq("location_id", selectedSede).order("date");
      setLocalHolidays((local ?? []) as HolidayDate[]);
    } else {
      setLocalHolidays([]);
    }
    setLoading(false);
  }, [supabase, selectedSede]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSave() {
    if (!formDate || !formName) return;
    setSaving(true);
    const payload = {
      date: formDate,
      name: formName,
      location_id: formIsNational ? null : (formSede || null),
      organization_id: formIsNational ? null : (profile?.organization_id ?? null),
    };
    const { error } = await supabase.from("holidays").insert(payload);
    if (error) toast.error(translateDbError(error.message, "Error al crear festivo"));
    else {
      toast.success("Festivo creado");
      setFormOpen(false);
      setFormDate(""); setFormName(""); setFormSede("");
      fetchAll();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) toast.error(translateDbError(error.message, "Error al eliminar"));
    else { toast.success("Festivo eliminado"); fetchAll(); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Festivos"
        description="Festivos nacionales de Colombia y por sede"
        action={
          isManagerOrAdmin
            ? {
                label: "Nuevo festivo",
                onClick: () => {
                  setFormIsNational(isAdmin);
                  setFormSede(selectedSede);
                  setFormDate("");
                  setFormName("");
                  setFormOpen(true);
                },
              }
            : undefined
        }
      />

      <Tabs defaultValue="nacionales">
        <TabsList>
          <TabsTrigger value="nacionales">Nacionales</TabsTrigger>
          <TabsTrigger value="por-sede">Por sede</TabsTrigger>
        </TabsList>

        <TabsContent value="nacionales" className="mt-4">
          <DataTable<HolidayDate>
            data={nacionales}
            loading={loading}
            keyAccessor={(r) => r.id}
            columns={[
              { header: "Fecha",  cell: (r) => r.date },
              { header: "Nombre", cell: (r) => r.name },
              ...(isAdmin ? [{
                header: "Acciones",
                cell: (r: HolidayDate) => (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ),
              }] : []),
            ]}
          />
        </TabsContent>

        <TabsContent value="por-sede" className="mt-4 space-y-2">
          <Select value={selectedSede} onValueChange={setSelectedSede}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Elige una sede" />
            </SelectTrigger>
            <SelectContent>
              {sedes.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedSede && (
            <DataTable<HolidayDate>
              data={localHolidays}
              loading={loading}
              keyAccessor={(r) => r.id}
              columns={[
                { header: "Fecha",  cell: (r) => r.date },
                { header: "Nombre", cell: (r) => r.name },
                {
                  header: "Acciones",
                  cell: (r) => (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nuevo festivo</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {isAdmin && (
              <FormField label="Alcance">
                <Select
                  value={formIsNational ? "nacional" : "sede"}
                  onValueChange={(v) => setFormIsNational(v === "nacional")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nacional">Nacional</SelectItem>
                    <SelectItem value="sede">Por sede</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
            {!formIsNational && (
              <FormField label="Sede" required>
                <Select value={formSede} onValueChange={setFormSede}>
                  <SelectTrigger><SelectValue placeholder="Elige sede" /></SelectTrigger>
                  <SelectContent>
                    {sedes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
            <FormField label="Fecha" required>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </FormField>
            <FormField label="Nombre" required>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formDate || !formName || (!formIsNational && !formSede)}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
