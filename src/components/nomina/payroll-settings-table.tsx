"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/payroll-helpers";
import { PayrollSettingForm } from "./payroll-setting-form";
import type { PayrollSettings } from "@/lib/types";

interface Props {
  rows: PayrollSettings[];
  onChanged: () => void;
}

export function PayrollSettingsTable({ rows, onChanged }: Props) {
  const supabase = createClient();
  const [editing, setEditing] = useState<PayrollSettings | null>(null);
  const [open, setOpen] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este período de configuración?")) return;
    const { error } = await supabase.from("payroll_settings").delete().eq("id", id);
    if (error) {
      toast.error(`No se pudo eliminar: ${error.message}`);
      return;
    }
    toast.success("Período eliminado");
    onChanged();
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inicio</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead>SMMLV</TableHead>
              <TableHead>Aux. transporte</TableHead>
              <TableHead>Divisor</TableHead>
              <TableHead>Hora noct.</TableHead>
              <TableHead>Dom %</TableHead>
              <TableHead>Fest %</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Sin períodos configurados.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.period_start}</TableCell>
                  <TableCell>{r.period_end ?? "vigente"}</TableCell>
                  <TableCell>{formatCOP(r.smmlv)}</TableCell>
                  <TableCell>{formatCOP(r.aux_transport)}</TableCell>
                  <TableCell>{r.hourly_divisor}</TableCell>
                  <TableCell>{r.night_start_hour}:00</TableCell>
                  <TableCell>{(r.sunday_surcharge_pct * 100).toFixed(0)}%</TableCell>
                  <TableCell>{(r.holiday_surcharge_pct * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(r);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <PayrollSettingForm
        initial={editing}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={onChanged}
      />
    </Card>
  );
}
