import { type ReactNode, type ReactElement, isValidElement, cloneElement, useId } from "react";
import { Label } from "@/components/ui/label";

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, error, required, children }: FormFieldProps) {
  const generatedId = useId();
  const child = isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
  const explicitId = child?.props?.id as string | undefined;
  const controlId = explicitId ?? generatedId;
  const errorId = `${controlId}-error`;

  const describedBy = error
    ? [child?.props?.["aria-describedby"] as string | undefined, errorId].filter(Boolean).join(" ")
    : (child?.props?.["aria-describedby"] as string | undefined);

  const enhanced = child
    ? cloneElement(child, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : (child.props?.["aria-invalid"] as boolean | undefined),
      })
    : children;

  return (
    <div className="space-y-2">
      <Label htmlFor={controlId}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {enhanced}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
