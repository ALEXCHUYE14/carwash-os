/** Contacto de soporte técnico (WhatsApp). Número en formato internacional sin "+". */
export const SUPPORT_WHATSAPP = "51924996961";
export const SUPPORT_WHATSAPP_DISPLAY = "+51 924 996 961";

export function supportWhatsappUrl(message = "Hola, necesito ayuda para ingresar a CarWash OS."): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
