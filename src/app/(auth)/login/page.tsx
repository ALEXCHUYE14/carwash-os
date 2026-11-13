import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";
import loginBg from "../../../../public/img/login-detailing.webp";

export const metadata: Metadata = { title: "Ingresar" };

const CAPABILITIES = [
  { k: "Operación", v: "Órdenes, bahías y tiempos de servicio en vivo" },
  { k: "Caja", v: "Cobros, cortes de turno e inventario conciliados" },
  { k: "Clientes", v: "Avisos por WhatsApp y seguimiento por placa" },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Panel de marca (solo escritorio) */}
      <aside className="relative isolate hidden overflow-hidden bg-[#0b141d] text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* Import estático → Next lo optimiza (AVIF/WebP) y genera un blur mientras carga */}
        <Image
          src={loginBg}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 1024px) 52vw, 0px"
          className="-z-20 object-cover object-[50%_55%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(8_17_28/0.6)_0%,rgb(8_17_28/0.35)_35%,rgb(8_17_28/0.9)_100%)]"
        />
        {/* Oscurece el lado izquierdo, donde va el texto, sin apagar al operario de la derecha */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgb(8_17_28/0.7)] via-[rgb(8_17_28/0.3)] to-transparent" />

        <div className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span aria-hidden className="size-2 rounded-full bg-[#5fd4c4] shadow-[0_0_0_4px_rgb(95_212_196/0.18)]" />
          CarWash OS
        </div>

        <div className="max-w-[30rem]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Panel del personal</p>
          <h2 className="mt-4 text-[2.5rem] font-bold leading-[1.08] tracking-[-0.025em] xl:text-5xl">
            De la recepción a la entrega, sin perder un solo vehículo.
          </h2>
          <dl className="mt-10 divide-y divide-white/12 border-y border-white/12">
            {CAPABILITIES.map((c) => (
              <div key={c.k} className="grid grid-cols-[7rem_1fr] gap-4 py-3.5 text-sm">
                <dt className="font-semibold text-white/55">{c.k}</dt>
                <dd className="text-white/90">{c.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-white/50">© {new Date().getFullYear()} CarWash OS · Car Wash & Auto Detailing</p>
      </aside>

      {/* Columna del formulario */}
      <section className="relative flex min-h-dvh flex-col px-5 py-8 sm:px-10">
        {/* Franja con la foto en móvil/tablet: mantiene la identidad visual sin tapar el formulario */}
        <div className="relative -mx-5 -mt-8 mb-8 h-36 overflow-hidden sm:-mx-10 sm:h-44 lg:hidden">
          <Image src={loginBg} alt="" fill priority placeholder="blur" sizes="(max-width: 1023px) 100vw, 0px" className="object-cover object-[50%_45%]" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[rgb(8_17_28/0.25)] to-bg" />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <footer className="mt-10 flex flex-col items-center justify-between gap-2 text-xs text-fg-subtle sm:flex-row lg:px-2">
          <span>Conexión cifrada · Solo personal autorizado</span>
          <Link href="/seguimiento" className="font-semibold text-fg-muted underline-offset-4 hover:text-fg hover:underline">
            ¿Eres cliente? Sigue tu vehículo por placa →
          </Link>
        </footer>
      </section>
    </main>
  );
}
