import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-xl font-semibold">Página no encontrada</h2>
        <p className="text-muted-foreground">
          La página que buscas no existe.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
