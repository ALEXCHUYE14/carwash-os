// Edge Function: staff-invite
// Alta de personal: solo gerencia. Invita por correo (Supabase Auth), asigna rol y crea el colaborador.
// El rol se asigna con service_role DESPUÉS de verificar al invocador con su propio JWT.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, env, json } from "../_shared/http.ts";

const STAFF_ROLES = ["superadmin", "admin", "cashier", "operator"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = env("SUPABASE_URL");
  const authHeader = req.headers.get("Authorization") ?? "";

  // 1) Cliente con el JWT del usuario que invoca → valida que sea gerencia
  const asUser = createClient(url, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
  const { data: me } = await asUser.auth.getUser();
  if (!me.user) return json({ error: "No autenticado" }, 401);
  const { data: myProfile } = await asUser.from("profiles").select("role, is_active").eq("id", me.user.id).single();
  if (!myProfile?.is_active || !["superadmin", "admin"].includes(myProfile.role)) {
    return json({ error: "Solo gerencia puede invitar usuarios" }, 403);
  }

  const { email, full_name, role } = (await req.json()) as { email?: string; full_name?: string; role?: StaffRole };
  if (!email || !full_name || !role || !STAFF_ROLES.includes(role)) return json({ error: "Datos incompletos" }, 400);
  if ((role === "superadmin" || role === "admin") && myProfile.role !== "superadmin") {
    return json({ error: "Solo un SuperAdmin puede crear gerentes" }, 403);
  }

  // 2) Acciones privilegiadas con service_role
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  // Destino del enlace del correo: la app valida el token y pide crear la contraseña.
  const redirectTo = Deno.env.get("SITE_URL") ? `${Deno.env.get("SITE_URL")}/auth/confirm?next=/auth/set-password` : undefined;
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo });
  if (error || !invited.user) return json({ error: error?.message ?? "No se pudo invitar" }, 400);

  const userId = invited.user.id;
  // El trigger handle_new_user ya creó el perfil como 'customer': se eleva al rol pedido.
  const { error: pErr } = await admin.from("profiles").update({ role, full_name }).eq("id", userId);
  if (pErr) return json({ error: pErr.message }, 400);

  if (role === "operator" || role === "cashier") {
    await admin.from("employees").insert({
      profile_id: userId,
      full_name,
      position: role === "operator" ? "Lavador" : "Cajero",
      hire_date: new Date().toISOString().slice(0, 10),
    });
  }

  return json({ ok: true, user_id: userId });
});
