import { env } from "../http.ts";
import { classifyHttp, errorText, safeFetch, type OutgoingMessage, type SendResult, type WhatsAppProvider } from "./types.ts";

/**
 * Opción A · Meta WhatsApp Cloud API (oficial)
 * Fuera de la ventana de 24 h solo se permiten plantillas aprobadas:
 * si la plantilla tiene meta_template_name se envía como "template" con parámetros ordenados.
 */
export class MetaProvider implements WhatsAppProvider {
  readonly name = "meta";
  private phoneId = env("META_PHONE_NUMBER_ID");
  private token = env("META_ACCESS_TOKEN");
  private version = Deno.env.get("META_API_VERSION") ?? "v21.0";

  async send(msg: OutgoingMessage): Promise<SendResult> {
    const payload = msg.template?.name
      ? {
          messaging_product: "whatsapp",
          to: msg.to,
          type: "template",
          template: {
            name: msg.template.name,
            language: { code: msg.template.language === "es" ? "es" : msg.template.language },
            components: [
              {
                type: "body",
                parameters: msg.template.paramOrder.map((k) => ({ type: "text", text: msg.variables[k] ?? "-" })),
              },
            ],
          },
        }
      : { messaging_product: "whatsapp", to: msg.to, type: "text", text: { body: msg.body, preview_url: true } };

    try {
      const res = await safeFetch(`https://graph.facebook.com/${this.version}/${this.phoneId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: await errorText(res), retryable: classifyHttp(res.status) };
      const data = await res.json();
      return { ok: true, providerMessageId: data?.messages?.[0]?.id ?? null };
    } catch (e) {
      return { ok: false, error: `Red/timeout: ${(e as Error).message}`, retryable: true };
    }
  }
}

/**
 * Opción A · Twilio WhatsApp
 * Con plantilla aprobada usa ContentSid (meta_template_name = "HX...") + ContentVariables.
 */
export class TwilioProvider implements WhatsAppProvider {
  readonly name = "twilio";
  private sid = env("TWILIO_ACCOUNT_SID");
  private auth = env("TWILIO_AUTH_TOKEN");
  private from = env("TWILIO_FROM"); // ej. whatsapp:+14155238886
  private statusCallback = Deno.env.get("TWILIO_STATUS_CALLBACK") ?? "";

  async send(msg: OutgoingMessage): Promise<SendResult> {
    const form = new URLSearchParams({ From: this.from, To: `whatsapp:+${msg.to}` });
    if (msg.template?.name?.startsWith("HX")) {
      form.set("ContentSid", msg.template.name);
      form.set(
        "ContentVariables",
        JSON.stringify(Object.fromEntries(msg.template.paramOrder.map((k, i) => [String(i + 1), msg.variables[k] ?? "-"]))),
      );
    } else {
      form.set("Body", msg.body);
    }
    if (this.statusCallback) form.set("StatusCallback", this.statusCallback);

    try {
      const res = await safeFetch(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${this.sid}:${this.auth}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      if (!res.ok) return { ok: false, error: await errorText(res), retryable: classifyHttp(res.status) };
      const data = await res.json();
      return { ok: true, providerMessageId: data?.sid ?? null };
    } catch (e) {
      return { ok: false, error: `Red/timeout: ${(e as Error).message}`, retryable: true };
    }
  }
}
