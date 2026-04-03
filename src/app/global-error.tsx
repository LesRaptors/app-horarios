"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Algo salió mal</h2>
          <p className="text-muted-foreground">
            Ha ocurrido un error inesperado.
          </p>
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
