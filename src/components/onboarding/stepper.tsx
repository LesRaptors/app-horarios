"use client";

import { WIZARD_STEPS } from "@/lib/onboarding/wizard-state";
import { Check } from "lucide-react";

const STEP_LABELS: Record<string, string> = {
  empresa: "Empresa",
  sede: "Sede",
  departments: "Departamentos",
  positions: "Posiciones",
  shifts: "Turnos",
  team: "Equipo",
};

interface Props {
  currentStep: string;
}

export function Stepper({ currentStep }: Props) {
  const visibleSteps = WIZARD_STEPS.filter((s) => s !== "done");
  const currentIdx = visibleSteps.indexOf(currentStep as (typeof visibleSteps)[number]);
  const totalSteps = visibleSteps.length;
  const completedSteps = Math.max(0, currentIdx);

  return (
    <nav
      aria-label="Progreso del wizard"
      role="progressbar"
      aria-valuenow={completedSteps + 1}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuetext={`Paso ${currentIdx + 1} de ${totalSteps}: ${STEP_LABELS[currentStep] ?? currentStep}`}
      className="flex items-center justify-center gap-2 py-6 flex-wrap"
    >
      {visibleSteps.map((step, idx) => {
        const status = idx < currentIdx ? "complete" : idx === currentIdx ? "current" : "upcoming";
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              aria-current={status === "current" ? "step" : undefined}
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                status === "complete"
                  ? "bg-blue-600 text-white"
                  : status === "current"
                    ? "bg-blue-600 text-white ring-4 ring-blue-100"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {status === "complete" ? <Check className="h-4 w-4" aria-hidden /> : idx + 1}
            </div>
            <span
              className={`hidden sm:inline text-sm ${
                status === "current" ? "font-semibold text-slate-950" : "text-slate-500"
              }`}
            >
              {STEP_LABELS[step]}
            </span>
            {idx < visibleSteps.length - 1 && (
              <div className="w-8 h-0.5 bg-slate-200" aria-hidden />
            )}
          </div>
        );
      })}
    </nav>
  );
}
