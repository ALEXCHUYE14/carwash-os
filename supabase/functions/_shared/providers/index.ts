import { EvolutionProvider, GenericGatewayProvider } from "./gateway.ts";
import { MetaProvider, TwilioProvider } from "./official.ts";
import type { WhatsAppProvider } from "./types.ts";

const cache = new Map<string, WhatsAppProvider>();

/** Fábrica: el proveedor se elige por mensaje (whatsapp_logs.provider), lo que permite modo híbrido. */
export function getProvider(name: string): WhatsAppProvider {
  const hit = cache.get(name);
  if (hit) return hit;
  let p: WhatsAppProvider;
  switch (name) {
    case "meta":
      p = new MetaProvider();
      break;
    case "twilio":
      p = new TwilioProvider();
      break;
    case "evolution":
      p = new EvolutionProvider();
      break;
    case "baileys":
    case "wwebjs":
      p = new GenericGatewayProvider(name);
      break;
    default:
      throw new Error(`Proveedor de WhatsApp no soportado: ${name}`);
  }
  cache.set(name, p);
  return p;
}

export type { OutgoingMessage, SendResult, WhatsAppProvider } from "./types.ts";
