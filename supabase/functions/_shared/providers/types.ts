/** Contrato común de los adaptadores de WhatsApp (Opción A oficial / Opción B gateway local). */
export interface OutgoingMessage {
  id: string;
  to: string; // E.164 sin '+', ej. 51987654321
  body: string; // texto ya renderizado
  variables: Record<string, string>;
  template?: {
    name: string | null; // plantilla aprobada (Meta/Twilio)
    paramOrder: string[];
    language: string;
  };
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

export interface WhatsAppProvider {
  readonly name: string;
  send(msg: OutgoingMessage): Promise<SendResult>;
}

/** 408/429/5xx y errores de red se reintentan; el resto (número inválido, plantilla rechazada) no. */
export function classifyHttp(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function safeFetch(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `HTTP ${res.status}: ${text.slice(0, 500)}`;
}
