# CarWash OS

Sistema de gestión para Car Wash & Auto Detailing.
Next.js 15 (App Router) · React 19 · TypeScript estricto · Tailwind CSS v4 · Supabase · TanStack Query v5 · Zustand · React Hook Form + Zod · Motion · dnd-kit · Recharts.

## Módulos

| Ruta | Rol | Qué hace |
|---|---|---|
| `/recepcion` | Caja | Check-in en < 30 s: búsqueda por placa con autocompletado, servicios + add-ons, inspección visual 2D de daños, bahía automática, canje de premio |
| `/tablero` | Staff | Kanban en tiempo real con drag & drop, semáforo SLA y detalle de la orden |
| `/mis-autos` | Operador | Vista móvil: deslizar o botones grandes para avanzar/reprocesar |
| `/caja` | Caja | Apertura, cobro (pagos mixtos, vuelto), entrega, cierre y arqueo con diferencias |
| `/gastos` | Caja / Gerencia | Egresos por categoría con foto del comprobante (Storage) |
| `/inventario` | Staff | Stock, alertas de reorden, entradas/salidas/ajustes, Kardex por insumo |
| `/clientes` | Caja | CRM, historial, vehículos, tarjeta de sellos |
| `/citas` | Caja | Agenda con recordatorio automático por WhatsApp |
| `/whatsapp` | Caja | Bandeja de salida, reintentos, editor de plantillas con vista previa |
| `/reportes` | Gerencia | Ingresos, estado de resultados, EBITDA, cobranza, desempeño del equipo |
| `/ajustes` | Gerencia | Negocio, IGV, fidelización, proveedor WhatsApp, servicios, bahías, equipo y roles |
| `/seguimiento` | Público | Búsqueda por placa con estado en vivo (sin login) |
| `/t/[token]` | Público | Ticket digital en vivo + tarjeta de sellos + encuesta NPS |
| `/mi-cuenta` | Cliente | Portal del cliente con login |

## Instalación

### 1. Base de datos
1. Crea un proyecto en Supabase.
2. En **SQL Editor** pega y ejecuta `supabase/carwash_schema.sql` (o usa `supabase db push` con la migración de `supabase/migrations/`).
3. Registra tu usuario (Authentication → Users → Add user) y conviértelo en SuperAdmin:
   ```sql
   update public.profiles set role = 'superadmin'
   where id = (select id from auth.users where email = 'tu@correo.com');
   ```

### 2. Frontend
```bash
cp .env.example .env.local      # completa URL y anon key de Supabase
npm install
npm run dev                     # http://localhost:3000
```
Producción: `npm run build && npm start`, o despliega en Vercel con las mismas variables de entorno.

### 3. Edge Functions (WhatsApp e invitaciones)
```bash
supabase link --project-ref <ref>
supabase functions deploy whatsapp-worker whatsapp-webhook staff-invite
```
Secretos según el proveedor elegido en **Ajustes → Proveedor de WhatsApp**:

| Proveedor | Secretos |
|---|---|
| Evolution API (local) | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` |
| Baileys / wwebjs (REST propio) | `GATEWAY_URL`, `GATEWAY_TOKEN` (opcional) |
| Meta Cloud API | `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_VERIFY_TOKEN` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_STATUS_CALLBACK` |
| Todos | `WORKER_SECRET`, `SITE_URL` (para invitaciones), `WEBHOOK_SECRET` (opcional) |

```bash
supabase secrets set EVOLUTION_API_URL=https://... EVOLUTION_API_KEY=... EVOLUTION_INSTANCE=carwash WORKER_SECRET=...
```

Programa el worker (SQL Editor, requiere extensiones `pg_cron` y `pg_net`). La revisión es cada minuto,
pero **solo invoca la Edge Function cuando hay mensajes pendientes**: así no se generan ~1.440 invocaciones
y sus logs diarios en Supabase (Log Ingestion) con la cola vacía.
```sql
select cron.schedule('wa-worker', '* * * * *', $$
  select net.http_post(
    url     := 'https://<ref>.supabase.co/functions/v1/whatsapp-worker',
    headers := jsonb_build_object('x-worker-secret', '<WORKER_SECRET>'),
    body    := '{}'::jsonb)
  where exists (select 1 from public.whatsapp_logs
                where (status = 'queued' and next_attempt_at <= now())
                   or (status = 'sending' and locked_at < now() - interval '5 minutes'))
$$);
select cron.schedule('wa-reminders', '0 * * * *', $$ select public.wa_enqueue_appointment_reminders(24) $$);

-- Limpieza diaria del historial de ejecuciones de pg_cron (si no, crece sin límite)
select cron.schedule('cron-history-cleanup', '30 3 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '3 days'
$$);
```
Si ya habías creado `wa-worker` con la versión anterior, vuelve a ejecutar el `cron.schedule('wa-worker', …)`
de arriba: con el mismo nombre reemplaza la tarea existente.
Webhook de estados (entregado/leído): `https://<ref>.supabase.co/functions/v1/whatsapp-webhook?provider=meta|twilio|evolution`.

## Arquitectura

```
src/
├─ app/                 solo rutas y layouts (sin lógica de negocio)
├─ features/            cada módulo es dueño de su UI, hooks, esquemas y estado
│  ├─ auth  catalog  check-in  kanban  cash  expenses  inventory
│  ├─ customers  appointments  whatsapp  reports  settings
│  └─ public-tracking  notifications  shell
├─ shared/              ui/, lib/ (supabase, formato, errores, query keys), hooks/, types/
└─ middleware.ts        refresco de sesión + RBAC por ruta
supabase/
├─ carwash_schema.sql   esquema completo (tablas, triggers, RPCs, RLS, storage, seeds)
├─ migrations/          el mismo esquema como migración de Supabase CLI
└─ functions/           whatsapp-worker · whatsapp-webhook · staff-invite
```

Principios:
- **La lógica crítica vive en la base de datos.** Totales, IGV, transiciones de estado, Kardex, sellos y comisiones se calculan en triggers. El frontend solo los muestra.
- **Las escrituras críticas pasan por RPC** (`create_work_order`, `move_work_order`, `close_cash_cut`, `pay_commissions`), y las lecturas por vistas (`v_kanban_board`, `v_inventory_status`, `v_daily_sales`).
- **Seguridad real en RLS.** El middleware solo oculta pantallas.
- **Realtime:** el staff usa `postgres_changes`, que respeta RLS. El portal público usa Broadcast en el canal `order:<token>`.
- **Errores:** los `RAISE EXCEPTION` del SQL ya vienen en español y se muestran tal cual en un toast.

## Roles

| Rol | Acceso |
|---|---|
| SuperAdmin | Todo, incluida la gestión de gerentes |
| Gerente | Todo menos crear o revocar gerentes |
| Caja / Recepción | Recepción, caja, gastos de caja chica, clientes, citas, WhatsApp |
| Operador | Tablero y "Mis autos"; ve solo sus comisiones; no entrega ni anula |
| Cliente | Su portal: sus órdenes, vehículos y sellos |
