"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportSchedulePdf } from "@/lib/export-pdf";
import { exportScheduleExcel } from "@/lib/export-excel";
import type { Profile, ScheduleEntry } from "@/lib/types";

interface ExportDropdownProps {
  entries: ScheduleEntry[];
  employees: Profile[];
  month: number;
  year: number;
  locationName: string;
}

export function ExportDropdown({
  entries,
  employees,
  month,
  year,
  locationName,
}: ExportDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            exportSchedulePdf(entries, employees, month, year, locationName)
          }
        >
          <FileText className="mr-2 h-4 w-4" />
          Exportar PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            exportScheduleExcel(entries, employees, month, year, locationName)
          }
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
