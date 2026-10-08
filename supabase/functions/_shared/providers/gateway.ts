import { env } from "../http.ts";
import { classifyHttp, errorText, safeFetch, type OutgoingMessage, type SendResult, type WhatsAppProvider } from "./types.ts";

/**
 * Opción B · Evolution API (gateway local sobre Baileys)
 * POST {EVOLUTION_API_URL}/message/sendText/{instance}
 */
export class EvolutionProvider implements WhatsAppProvider {
  readonly name = "evolution";
  private url = env("EVOLUTION_API_URL").replace(/\/$/, "");
  private key = env("EVOLUTION_API_KEY");
  private instance = env("EVOLUTION_INSTANCE");

  async send(msg: OutgoingMessage): Promise<SendResult> {
    try {
      const res = await safeFetch(`${this.url}/message/sendText/${encodeURIComponent(this.instance)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: this.key },
        body: JSON.stringify({ number: msg.to, text: msg.body, delay: 1200, linkPreview: true }),
      });
      if (!res.ok) return { ok: false, error: await errorText(res), retryable: classifyHttp(res.status) };
      const data = await res.json().catch(() => ({}));
      return { ok: true, providerMessageId: data?.key?.id ?? null };
    } catch (e) {
      return { ok: false, error: `Red/timeout: ${(e as Error).message}`, retryable: true };
    }
  }
}

/**
 * Opción B · Gateway REST genérico (Baileys propio, whatsapp-web.js, etc.)
 * Espera: POST {GATEWAY_URL}  body {to, message}  → {id?}
 */
export class GenericGatewayProvider implements WhatsAppProvider {
  constructor(readonly name: string) {}
  private url = env("GATEWAY_URL");
  private token = env("GATEWAY_TOKEN", false);

  async send(msg: OutgoingMessage): Promise<SendResult> {
    try {
      const res = await safeFetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({ to: msg.to, message: msg.body }),
      });
      if (!res.ok) return { ok: false, error: await errorText(res), retryable: classifyHttp(res.status) };
      const data = await res.json().catch(() => ({}));
      return { ok: true, providerMessageId: data?.id ?? data?.messageId ?? null };
    } catch (e) {
      return { ok: false, error: `Red/timeout: ${(e as Error).message}`, retryable: true };
    }
  }
}
