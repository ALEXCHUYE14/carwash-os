import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import logo from "../../../public/img/icono.jpg";

/**
 * Logo del negocio (public/img/icono.jpg, 600×446 con fondo blanco).
 * El contenedor es blanco para fundirse con el fondo del JPG, y la imagen se amplía un poco
 * para recortar el margen blanco del archivo y que el auto y el texto se vean más grandes.
 * El tamaño se controla desde fuera con `className` (p. ej. "h-10 w-[54px]").
 */
export function BrandLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-line", className)}>
      <Image
        src={logo}
        alt="Logo CarWash"
        fill
        priority={priority}
        sizes="(max-width: 640px) 120px, 160px"
        className="scale-[1.3] object-contain"
      />
    </div>
  );
}
