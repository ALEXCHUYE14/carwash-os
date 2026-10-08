// Edge Function: whatsapp-worker
// Reclama lotes de la cola (wa_claim_batch con SKIP LOCKED), envía por el proveedor
// configurado y registra el resultado. Los reintentos usan exponential backoff en la BD.
//
// Invocación: pg_cron cada minuto (ver carwash_schema.sql) con el header
//   Authorization: Bearer <SERVICE_ROLE_KEY>   o   x-worker-secret: <WORKER_SECRET>

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, env, json } from "../_shared/http.ts";
import { getProvider, type OutgoingMessage } from "../_shared/providers/index.ts";

interface ClaimedLog {
  id: string;
  template_id: string | null;
  to_phone: string;
  provider: string;
  body_rendered: string | null;
  variables: Record<string, string>;
  attempts: number;
}

interface TemplateRow {
  id: string;
  meta_template_name: string | null;
  meta_param_order: string[];
  language: string;
}

const BATCH = Number(Deno.env.get("WA_BATCH_SIZE") ?? "20");
const MAX_RUNTIME_MS = 50_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("WORKER_SECRET");
  const auth = req.headers.get("authorization") ?? "";
  const authorized = auth === `Bearer ${serviceKey}` || (!!secret && req.headers.get("x-worker-secret") === secret);
  if (!authorized) return json({ error: "unauthorized" }, 401);

  const sb = createClient(env("SUPABASE_URL"), serviceKey, { auth: { persistSession: false } });
  const started = Date.now();
  const stats = { claimed: 0, sent: 0, failed: 0, retried: 0 };
  const templates = new Map<string, TemplateRow>();

  while (Date.now() - started < MAX_RUNTIME_MS) {
    const { data, error } = await sb.rpc("wa_claim_batch", { p_limit: BATCH });
    if (error) return json({ error: error.message, stats }, 500);
    const batch = (data ?? []) as ClaimedLog[];
    if (batch.length === 0) break;
    stats.claimed += batch.length;

    // Carga perezosa de plantillas (para Meta/Twilio con plantillas aprobadas)
    const missing = [...new Set(batch.map((b) => b.template_id).filter((id): id is string => !!id && !templates.has(id)))];
    if (missing.length) {
      const { data: rows } = await sb
        .from("whatsapp_templates")
        .select("id, meta_template_name, meta_param_order, language")
        .in("id", missing);
      (rows ?? []).forEach((t: TemplateRow) => templates.set(t.id, t));
    }

    await Promise.all(
      batch.map(async (log) => {
        const tpl = log.template_id ? templates.get(log.template_id) : undefined;
        const msg: OutgoingMessage = {
          id: log.id,
          to: log.to_phone,
          body: log.body_rendered ?? "",
          variables: log.variables ?? {},
          template: tpl ? { name: tpl.meta_template_name, paramOrder: tpl.meta_param_order ?? [], language: tpl.language } : undefined,
        };

        let result;
        try {
          result = await getProvider(log.provider).send(msg);
        } catch (e) {
          result = { ok: false as const, error: (e as Error).message, retryable: false };
        }

        if (result.ok) {
          await sb.rpc("wa_mark_sent", { p_id: log.id, p_provider_message_id: result.providerMessageId });
          stats.sent++;
        } else {
          await sb.rpc("wa_mark_failed", { p_id: log.id, p_error: result.error, p_retryable: result.retryable });
          if (result.retryable) stats.retried++;
          else stats.failed++;
        }
      }),
    );

    if (batch.length < BATCH) break;
  }

  return json({ ok: true, ms: Date.now() - started, stats });
});
