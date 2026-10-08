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
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => count < 2 && !String((err as { code?: string })?.code ?? "").startsWith("42"),
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
