"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { translateDbError } from "@/lib/utils";
import { Check, X, ChevronDown, ChevronRight } from "lucide-react";
import type { ScheduleEntry, Profile, ShiftTemplate } from "@/lib/types";

type OvertimeRow = ScheduleEntry & {
  employee: Profile;
  template: ShiftTemplate | null;
};

export function OvertimeRequestsTab() {
  const supabase = createClient();
  const { profile } = useAuth();
  const [rows, setRows] = useState<OvertimeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("schedule_entries")
      .select("*, employee:profiles(*), template:shift_templates(*)")
      .eq("overtime_status", "pending")
      .order("date");
    setRows((data ?? []) as unknown as OvertimeRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  async function approve(ids: string[]) {
    const { error } = await supabase
      .from("schedule_entries")
      .update({
        overtime_status: "approved",
        overtime_reviewed_by: profile?.id ?? null,
        overtime_reviewed_at: new Date().toISOString(),
        overtime_note: note || null,
      })
      .in("id", ids);
    if (error) toast.error(translateDbError(error.message, "Error aprobando"));
    else {
      toast.success(`${ids.length} aprobado(s)`);
      setSelected(new Set());
      setNote("");
      fetchPending();
    }
  }

  async function reject(ids: string[]) {
    // Rejection deletes the entry so the slot becomes uncovered again.
    const { error } = await supabase.from("schedule_entries").delete().in("id", ids);
    if (error) toast.error(translateDbError(error.message, "Error rechazando"));
    else {
      toast.success(`${ids.length} rechazado(s)`);
      setSelected(new Set());
      setNote("");
      fetchPending();
    }
  }

  function toggleSel(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function toggleExp(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="rounded border p-3 flex items-center gap-2 bg-muted/40">
          <span className="text-sm">{selected.size} seleccionado(s)</span>
          <Input
            placeholder="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" onClick={() => approve(Array.from(selected))}>
            <Check className="h-4 w-4 mr-1" /> Aprobar
          </Button>
          <Button size="sm" variant="outline" onClick={() => reject(Array.from(selected))}>
            <X className="h-4 w-4 mr-1" /> Rechazar
          </Button>
        </div>
      )}

      <div className="rounded border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-xs">
              <th className="p-2 text-left w-8">
                <Checkbox
                  checked={rows.length > 0 && selected.size === rows.length}
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="p-2 text-left">Empleado</th>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Turno</th>
              <th className="p-2 text-left">Caps excedidos</th>
              <th className="p-2 text-left w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Cargando…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No hay solicitudes pendientes</td></tr>
            )}
            {rows.map((r) => {
              const isExp = expanded.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleSel(r.id)}
                      />
                    </td>
                    <td className="p-2">
                      {r.employee?.first_name} {r.employee?.last_name}
                    </td>
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">
                      {r.template?.name ?? `${r.start_time}-${r.end_time}`}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {r.exceeds_caps.map((c) => (
                          <span
                            key={c}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2">
                      <button onClick={() => toggleExp(r.id)} aria-label="Expand">
                        {isExp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                  {isExp && (
                    <tr className="bg-muted/20 border-b">
                      <td colSpan={6} className="p-3 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>Rango: {r.start_time} – {r.end_time}</div>
                          <div>Plantilla: {r.template?.name ?? "—"}</div>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => approve([r.id])}>Aprobar</Button>
                          <Button size="sm" variant="outline" onClick={() => reject([r.id])}>Rechazar</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
