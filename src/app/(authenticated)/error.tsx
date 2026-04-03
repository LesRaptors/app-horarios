"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function AuthenticatedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">Error</h2>
      <p className="text-muted-foreground max-w-md">
        Ha ocurrido un error al cargar esta página. Por favor intenta de nuevo.
      </p>
      <Button onClick={reset}>Intentar de nuevo</Button>
    </div>
  );
}
