import type { Metadata } from "next";
import { KanbanBoard } from "@/features/kanban/components/kanban-board";

export const metadata: Metadata = { title: "Tablero" };

export default function TableroPage() {
  return <KanbanBoard />;
}
