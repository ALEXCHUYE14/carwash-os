import { redirect } from "next/navigation";

/** El middleware redirige a la pantalla de inicio según el rol. */
export default function Home() {
  redirect("/login");
}
