export const WIZARD_STEPS = [
  "empresa",
  "sede",
  "departments",
  "positions",
  "shifts",
  "team",
  "done",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export function isValidStep(step: string): step is WizardStep {
  return (WIZARD_STEPS as readonly string[]).includes(step);
}

export function nextStep(current: WizardStep): WizardStep {
  const idx = WIZARD_STEPS.indexOf(current);
  if (idx === -1 || idx === WIZARD_STEPS.length - 1) return "done";
  return WIZARD_STEPS[idx + 1];
}

export function prevStep(current: WizardStep): WizardStep {
  const idx = WIZARD_STEPS.indexOf(current);
  if (idx <= 0) return "empresa";
  return WIZARD_STEPS[idx - 1];
}
