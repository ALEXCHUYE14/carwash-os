import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-6xl font-extrabold text-cyan">404</p>
        <p className="mt-2 text-fg-muted">Esta página no existe.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-cyan hover:underline">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
