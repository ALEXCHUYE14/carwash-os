// Edge Function: whatsapp-webhook
// Recibe confirmaciones de entrega/lectura y las aplica con wa_update_status.
//  · Meta Cloud API:   GET (verificación hub.challenge) + POST statuses[]
//  · Twilio:           POST application/x-www-form-urlencoded (MessageSid, MessageStatus)
//  · Evolution API:    POST { event: "messages.update", data: { keyId|key.id, status } }
//
// Rutas sugeridas:  /functions/v1/whatsapp-webhook?provider=meta|twilio|evolution

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, env, json } from "../_shared/http.ts";

type WaStatus = "sent" | "delivered" | "read" | "failed";

const META_MAP: Record<string, WaStatus> = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };
const TWILIO_MAP: Record<string, WaStatus> = { sent: "sent", delivered: "delivered", read: "read", failed: "failed", undelivered: "failed" };
const EVOLUTION_MAP: Record<string, WaStatus> = {
  SERVER_ACK: "sent",
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "meta";

  // Verificación del webhook de Meta
  if (req.method === "GET" && provider === "meta") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env("META_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("forbidden", { status: 403 });
  }

  // Secreto compartido opcional para Evolution / gateways (?secret=...)
  const hookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (hookSecret && provider !== "meta" && provider !== "twilio" && url.searchParams.get("secret") !== hookSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const updates: { id: string; status: WaStatus; error?: string }[] = [];

  try {
    if (provider === "twilio") {
      const form = await req.formData();
      const id = String(form.get("MessageSid") ?? "");
      const st = TWILIO_MAP[String(form.get("MessageStatus") ?? "")];
      if (id && st) updates.push({ id, status: st, error: form.get("ErrorMessage")?.toString() });
    } else {
      const body = await req.json();
      if (provider === "meta") {
        for (const entry of body?.entry ?? []) {
          for (const change of entry?.changes ?? []) {
            for (const s of change?.value?.statuses ?? []) {
              const st = META_MAP[s.status];
              if (s.id && st) updates.push({ id: s.id, status: st, error: s.errors?.[0]?.title });
            }
          }
        }
      } else {
        const items = Array.isArray(body?.data) ? body.data : [body?.data];
        for (const d of items) {
          const id = d?.keyId ?? d?.key?.id;
          const st = EVOLUTION_MAP[String(d?.status ?? "")];
          if (id && st) updates.push({ id, status: st });
        }
      }
    }
  } catch (e) {
    return json({ error: `payload inválido: ${(e as Error).message}` }, 400);
  }

  for (const u of updates) {
    await sb.rpc("wa_update_status", { p_provider_message_id: u.id, p_status: u.status, p_error: u.error ?? null });
  }
  return json({ ok: true, processed: updates.length });
});
