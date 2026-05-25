"use client";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import type { Plan } from "@/lib/billing/types";

export function PlanCard({
  plan,
  isCurrent,
  onChoose,
}: {
  plan: Plan;
  isCurrent: boolean;
  onChoose: () => void;
}) {
  const cop = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

  return (
    <article
      className={`rounded-lg border p-6 ${
        isCurrent ? "border-primary bg-accent/30" : "border-border"
      }`}
    >
      <h3 className="text-xl font-bold">{plan.name}</h3>
      <p className="mt-2 text-3xl font-bold">
        {cop.format(plan.price_cop)}
        <span className="text-base font-normal text-muted-foreground">/mes</span>
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-600" aria-hidden />
          Hasta {plan.max_employees ?? "ilimitados"} empleados
        </li>
      </ul>
      {isCurrent ? (
        <Button disabled className="mt-6 w-full">
          Tu plan actual
        </Button>
      ) : plan.contact_sales ? (
        <Button variant="outline" className="mt-6 w-full" asChild>
          <a href="mailto:hola@tushorarios.com?subject=Plan Enterprise">
            Contactar ventas
          </a>
        </Button>
      ) : (
        <Button onClick={onChoose} className="mt-6 w-full">
          Elegir {plan.name}
        </Button>
      )}
    </article>
  );
}
