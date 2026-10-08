import type { Metadata } from "next";
import { CustomerDetailScreen } from "@/features/customers/components/customers-screen";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetailScreen id={id} />;
}
