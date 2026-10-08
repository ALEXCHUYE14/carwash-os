import { Skeleton } from "@/shared/ui/card";

/** Se muestra al instante al navegar entre secciones mientras carga la pantalla. */
export default function StaffLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
