import type { Metadata } from "next";
import { Suspense } from "react";
import { TicketView } from "@/features/public-tracking/components/ticket-view";

export const metadata: Metadata = { title: "Ticket digital", robots: { index: false } };

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-dvh px-4 py-8">
      <Suspense>
        <TicketView token={token} />
      </Suspense>
    </main>
  );
}
