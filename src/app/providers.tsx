"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { errorMessage } from "@/shared/lib/errors";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cada petición queda registrada en los logs de Supabase (Log Ingestion): los datos en vivo
            // llegan por Realtime, así que no se vuelve a pedir todo al regresar a la pestaña.
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            // Solo se reintentan fallos de red. Un error de Postgres/PostgREST (permiso, duplicado,
            // regla de negocio) daría el mismo resultado y solo sumaría peticiones fallidas al log.
            retry: (count, err) => count < 2 && !(err as { code?: string } | null)?.code,
          },
          mutations: {
            onError: (err) => toast.error(errorMessage(err)),
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        theme="light"
        position="top-center"
        richColors
        toastOptions={{ className: "!rounded-xl !border-line !bg-surface !shadow-lg !font-sans" }}
      />
    </QueryClientProvider>
  );
}
