"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ConceptExplanation {
  label: string;
  explain: string;
}

const CONCEPT_EXPLANATIONS: Record<string, ConceptExplanation> = {
  salary: {
    label: "Salario base",
    explain:
      "Es el salario pactado en tu contrato de trabajo. Se calcula sobre 30 días al mes, independientemente de los días del mes calendario.",
  },
  transport: {
    label: "Auxilio de transporte",
    explain:
      "Beneficio legal obligatorio para empleados que ganan hasta 2 SMMLV. Para 2026 es $249.095/mes. No hace parte del salario para efectos de prestaciones.",
  },
  surcharge_night: {
    label: "Recargo nocturno",
    explain:
      "Aplica cuando trabajas entre las 9 PM y las 6 AM. La ley colombiana establece un recargo del 35% sobre el valor de la hora ordinaria.",
  },
  surcharge_sunday: {
    label: "Recargo dominical",
    explain:
      "Trabajar el domingo (o festivo) da derecho a un recargo del 75% sobre el valor de la hora. Si además es nocturno, los recargos se suman.",
  },
  surcharge_holiday: {
    label: "Recargo festivo",
    explain:
      "Los días festivos reconocidos en Colombia tienen el mismo recargo que los domingos: 75% adicional sobre la hora ordinaria.",
  },
  overtime_day: {
    label: "Hora extra diurna",
    explain:
      "Horas trabajadas por encima de tu jornada ordinaria entre las 6 AM y las 9 PM. Se pagan con un recargo del 25% sobre el valor de la hora.",
  },
  overtime_night: {
    label: "Hora extra nocturna",
    explain:
      "Horas adicionales trabajadas entre las 9 PM y las 6 AM. El recargo es del 75% sobre el valor de la hora ordinaria.",
  },
  health_employee: {
    label: "Aporte salud (4%)",
    explain:
      "Tu aporte obligatorio al sistema de salud (EPS). Equivale al 4% de tu salario base. La empresa aporta el 8% adicional por ti.",
  },
  pension_employee: {
    label: "Aporte pensión (4%)",
    explain:
      "Tu cotización obligatoria al fondo de pensiones. Es el 4% de tu salario. La empresa aporta el 12% adicional por ti.",
  },
  solidarity_pension: {
    label: "Fondo de solidaridad pensional",
    explain:
      "Aplica si ganas más de 4 SMMLV. Es un aporte adicional del 1% al 2% que va a un fondo para pensiones de personas de bajos ingresos.",
  },
  income_tax: {
    label: "Retención en la fuente",
    explain:
      "Si tu ingreso mensual supera cierto umbral, la empresa retiene un porcentaje de tu pago como anticipo del impuesto de renta. Lo descuentan directamente de tu nómina.",
  },
  vacation_pay: {
    label: "Pago de vacaciones",
    explain:
      "Cuando tomas vacaciones, recibes el equivalente a 15 días de salario por cada año trabajado. Este pago sustituye tu salario durante ese período.",
  },
  prima: {
    label: "Prima de servicios",
    explain:
      "Prestación social equivalente a 15 días de salario por semestre. Se paga en junio y en diciembre. No corresponde a salario, pero la empresa la provisiona cada mes.",
  },
  cesantias_interest: {
    label: "Intereses sobre cesantías",
    explain:
      "Cada año en febrero, la empresa te debe pagar el 12% anual sobre el saldo de cesantías acumulado. Es un rendimiento mínimo legal sobre tus cesantías.",
  },
  cesantias: {
    label: "Cesantías",
    explain:
      "Un mes de salario por cada año trabajado. La empresa consigna esta plata a tu fondo de cesantías cada 14 de febrero. Podés retirarlas para comprar vivienda o pagar estudios.",
  },
  vacaciones: {
    label: "Provisión de vacaciones",
    explain:
      "La empresa aparta cada mes la parte proporcional de tus vacaciones. Cuando las tomes, ya está separada. Equivale a 15 días de salario por año.",
  },
};

interface Props {
  concept: string;
  children: ReactNode;
}

export function ConceptTooltip({ concept, children }: Props) {
  const info = CONCEPT_EXPLANATIONS[concept];

  if (!info) {
    return <>{children}</>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 text-sm" side="top">
        <p className="font-semibold mb-1">{info.label}</p>
        <p className="text-muted-foreground leading-snug">{info.explain}</p>
        <Link
          href={`/mi-pago/glosario#${concept}`}
          className="mt-2 inline-block text-primary underline underline-offset-2 text-xs"
        >
          Saber mas
        </Link>
      </PopoverContent>
    </Popover>
  );
}
