import type { Metadata } from "next";
import { OperatorQueue } from "@/features/kanban/components/operator-queue";

export const metadata: Metadata = { title: "Mis autos" };

export default function MisAutosPage() {
  return <OperatorQueue />;
}
