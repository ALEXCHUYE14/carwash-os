-- =============================================================================
--  CARWASH OS · Esquema de base de datos de producción
--  Supabase · PostgreSQL 16+
--
--  Módulos: RBAC + RLS · Recepción Express + Inspección visual · Kanban con SLA
--           Hub WhatsApp (cola + backoff) · Caja / Arqueo · Gastos · P&L/EBITDA
--           Inventario + Kardex · Comisiones · Fidelización · Portal del cliente
--
--  Ejecución: UNA vez, en un proyecto limpio, desde Supabase SQL Editor.
--  Todo corre dentro de una transacción: si algo falla, no queda nada a medias.
--
--  Convenciones
--   · Montos en moneda local (PEN por defecto), numeric(12,2).
--   · Precios con IGV incluido por defecto (business_settings.prices_include_tax).
--   · Esquema `private`: funciones internas (triggers, lógica), NO expuestas por la API.
--   · Esquema `public`: tablas, vistas y RPCs que consume el frontend.
-- =============================================================================

begin;

-- =============================================================================
-- 0. EXTENSIONES Y ESQUEMAS
-- =============================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm     with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- =============================================================================
-- 1. ENUMS
-- =============================================================================
create type public.user_role          as enum ('superadmin', 'admin', 'cashier', 'operator', 'customer');
-- El orden del enum ES el orden del flujo Kanban (se usa para validar transiciones).
create type public.order_status       as enum ('received', 'washing', 'drying_detailing', 'quality_check', 'ready', 'delivered', 'cancelled');
create type public.payment_method     as enum ('cash', 'card', 'yape', 'plin', 'transfer', 'other');
create type public.payment_status     as enum ('pending', 'partial', 'paid');
create type public.expense_category   as enum ('utilities', 'payroll', 'washer_commissions', 'supplies', 'machinery_maintenance', 'misc');
create type public.vehicle_size       as enum ('small', 'medium', 'large', 'xl');
create type public.commission_type    as enum ('percentage', 'fixed');
create type public.commission_status  as enum ('pending', 'paid', 'void');
create type public.bay_type           as enum ('wash', 'detail', 'multi');
create type public.inventory_tx_type  as enum ('in', 'out', 'consumption', 'adjustment');
create type public.cash_cut_status    as enum ('open', 'closed');
create type public.damage_type        as enum ('scratch', 'dent', 'crack', 'chip', 'stain', 'missing_part', 'other');
create type public.vehicle_view       as enum ('top', 'front', 'rear', 'left', 'right');
create type public.loyalty_log_type   as enum ('stamp_earned', 'reward_redeemed', 'reward_refunded', 'adjustment');
create type public.wa_provider        as enum ('meta', 'twilio', 'evolution', 'baileys', 'wwebjs');
create type public.wa_event           as enum ('check_in', 'ready_for_pickup', 'appointment_reminder', 'nps_survey', 'custom');
create type public.wa_status          as enum ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled');
create type public.appointment_status as enum ('scheduled', 'confirmed', 'checked_in', 'no_show', 'cancelled');

-- =============================================================================
-- 2. UTILIDADES GENÉRICAS
-- =============================================================================
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- "abc-123" → "ABC123"
create or replace function public.normalize_plate(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

-- "987 654 321" → "51987654321" (formato internacional sin '+', listo para WhatsApp)
create or replace function public.normalize_phone(p text, p_country_code text default '51')
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
           when d is null then null
           when length(d) = 9 and left(d, 1) = '9' then p_country_code || d
           else d
         end
  from (select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') as d) x
$$;

create or replace function public.order_status_label(s public.order_status)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case s
    when 'received'         then 'Ingresado / En espera'
    when 'washing'          then 'En lavado'
    when 'drying_detailing' then 'Secado / Detallado'
    when 'quality_check'    then 'Control de calidad'
    when 'ready'            then 'Listo para entrega'
    when 'delivered'        then 'Entregado'
    when 'cancelled'        then 'Anulado'
  end
$$;

-- =============================================================================
-- 3. CONFIGURACIÓN DEL NEGOCIO (fila única)
-- =============================================================================
create table public.business_settings (
  id                      smallint primary key default 1 check (id = 1),
  business_name           text        not null default 'Mi Car Wash',
  legal_name              text,
  ruc                     text check (ruc is null or ruc ~ '^\d{11}$'),
  address                 text,
  phone                   text,
  currency                char(3)     not null default 'PEN',
  currency_symbol         text        not null default 'S/',
  tax_name                text        not null default 'IGV',
  tax_rate                numeric(5,4) not null default 0.18 check (tax_rate >= 0 and tax_rate < 1),
  prices_include_tax      boolean     not null default true,
  timezone                text        not null default 'America/Lima',
  loyalty_enabled         boolean     not null default true,
  loyalty_stamps_required smallint    not null default 5 check (loyalty_stamps_required > 0), -- 5 sellos → 6.º lavado gratis
  sla_warning_pct         numeric(4,2) not null default 0.20 check (sla_warning_pct between 0 and 1),
  wa_provider             public.wa_provider not null default 'evolution',
  wa_country_code         text        not null default '51',
  nps_delay_minutes       int         not null default 120 check (nps_delay_minutes >= 0),
  public_portal_url       text        not null default 'https://...',
  updated_at              timestamptz not null default now()
);

-- =============================================================================
-- 4. IDENTIDAD Y CLIENTES
-- =============================================================================
create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  document_type    text check (document_type in ('DNI', 'RUC', 'CE', 'PASAPORTE')),
  document_number  text,
  full_name        text not null check (length(trim(full_name)) >= 2),
  phone            text,           -- normalizado: 51987654321
  email            text,
  whatsapp_opt_in  boolean not null default true,
  birthday         date,
  notes            text,
  is_active        boolean not null default true,
  created_by       uuid default auth.uid() references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (document_type, document_number)
);

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null default '',
  email        text,
  phone        text,
  avatar_url   text,
  role         public.user_role not null default 'customer',
  customer_id  uuid references public.customers(id) on delete set null, -- solo rol customer
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.vehicle_types (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  size               public.vehicle_size not null,
  price_multiplier   numeric(5,2) not null default 1 check (price_multiplier > 0),
  time_multiplier    numeric(5,2) not null default 1 check (time_multiplier > 0),
  supply_multiplier  numeric(5,2) not null default 1 check (supply_multiplier > 0),
  icon               text,
  sort_order         int not null default 0,
  is_active          boolean not null default true
);

create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete restrict,
  vehicle_type_id  uuid not null references public.vehicle_types(id),
  plate            text not null,
  brand            text,
  model            text,
  color            text,
  year             smallint check (year between 1950 and 2100),
  vin              text,
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- 5. CATÁLOGO: INVENTARIO, SERVICIOS, BAHÍAS, PERSONAL
-- =============================================================================
create table public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  sku           text unique,
  name          text not null,
  category      text,
  unit          text not null check (unit in ('ml', 'l', 'g', 'kg', 'gal', 'unit')),
  current_stock numeric(14,3) not null default 0,   -- solo se modifica vía Kardex
  min_stock     numeric(14,3) not null default 0 check (min_stock >= 0),
  reorder_qty   numeric(14,3) not null default 0 check (reorder_qty >= 0),
  unit_cost     numeric(12,4) not null default 0 check (unit_cost >= 0), -- costo promedio ponderado
  stock_status  text generated always as (
                  case when current_stock <= 0 then 'out'
                       when current_stock <= min_stock then 'critical'
                       else 'ok' end) stored,
  supplier      text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.services (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  description        text,
  category           text,
  is_addon           boolean not null default false,
  base_price         numeric(10,2) not null check (base_price >= 0),
  base_duration_min  int not null default 30 check (base_duration_min > 0), -- SLA base
  required_bay       public.bay_type not null default 'wash' check (required_bay <> 'multi'),
  commission_type    public.commission_type not null default 'percentage',
  commission_value   numeric(10,2) not null default 0 check (commission_value >= 0),
  sort_order         int not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (commission_type <> 'percentage' or commission_value <= 100)
);

-- Precio/tiempo específico por tamaño (si no existe, se usa base × multiplicador del tipo)
create table public.service_prices (
  service_id    uuid not null references public.services(id) on delete cascade,
  vehicle_size  public.vehicle_size not null,
  price         numeric(10,2) not null check (price >= 0),
  duration_min  int check (duration_min > 0),
  primary key (service_id, vehicle_size)
);

-- Receta de consumo de insumos por servicio (descuento automático de Kardex)
create table public.service_supplies (
  service_id  uuid not null references public.services(id) on delete cascade,
  item_id     uuid not null references public.inventory_items(id) on delete restrict,
  quantity    numeric(12,3) not null check (quantity > 0),  -- en la unidad del insumo, para un auto "medium"
  primary key (service_id, item_id)
);

create table public.bays (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  bay_type    public.bay_type not null default 'wash',
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  notes       text
);

create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid unique references public.profiles(id) on delete set null,
  full_name         text not null,
  document_number   text unique,
  phone             text,
  position          text not null default 'Lavador',
  commission_type   public.commission_type,  -- override del servicio (null = usar el del servicio)
  commission_value  numeric(10,2) check (commission_value is null or commission_value >= 0),
  base_salary       numeric(10,2) check (base_salary is null or base_salary >= 0),
  hire_date         date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((commission_type is null) = (commission_value is null)),
  check (commission_type is distinct from 'percentage' or commission_value <= 100)
);

-- =============================================================================
-- 6. OPERACIÓN: CITAS, ÓRDENES, INSPECCIÓN
-- =============================================================================
create table public.appointments (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers(id) on delete cascade,
  vehicle_id          uuid references public.vehicles(id) on delete set null,
  scheduled_at        timestamptz not null,
  duration_min        int not null default 60 check (duration_min > 0),
  service_ids         uuid[] not null default '{}',
  status              public.appointment_status not null default 'scheduled',
  notes               text,
  reminder_queued_at  timestamptz,
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create sequence public.work_order_number_seq;

create table public.work_orders (
  id                      uuid primary key default gen_random_uuid(),
  order_number            text not null unique
                          default ('OT-' || lpad(nextval('public.work_order_number_seq')::text, 6, '0')),
  public_token            text not null unique default replace(gen_random_uuid()::text, '-', ''),
  customer_id             uuid not null references public.customers(id),
  vehicle_id              uuid not null references public.vehicles(id),
  appointment_id          uuid references public.appointments(id) on delete set null,
  bay_id                  uuid references public.bays(id) on delete set null,
  assigned_employee_id    uuid references public.employees(id) on delete set null,

  status                  public.order_status not null default 'received',
  status_changed_at       timestamptz not null default now(),
  received_at             timestamptz not null default now(),
  started_at              timestamptz,
  ready_at                timestamptz,
  delivered_at            timestamptz,
  cancelled_at            timestamptz,
  cancel_reason           text,
  estimated_duration_min  int not null default 0,
  sla_due_at              timestamptz,

  mileage                 int check (mileage is null or mileage >= 0),
  fuel_level              smallint check (fuel_level between 0 and 100),

  subtotal                numeric(12,2) not null default 0 check (subtotal >= 0),
  discount                numeric(12,2) not null default 0 check (discount >= 0),
  tax_amount              numeric(12,2) not null default 0,
  total                   numeric(12,2) not null default 0,
  amount_paid             numeric(12,2) not null default 0,
  payment_status          public.payment_status not null default 'pending',
  paid_at                 timestamptz,

  is_loyalty_reward       boolean not null default false,
  supplies_consumed_at    timestamptz,

  nps_score               smallint check (nps_score between 0 and 10),
  nps_comment             text,
  nps_submitted_at        timestamptz,

  notes                   text,   -- visibles en el ticket
  internal_notes          text,
  created_by              uuid default auth.uid() references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.work_order_items (
  id                uuid primary key default gen_random_uuid(),
  work_order_id     uuid not null references public.work_orders(id) on delete cascade,
  service_id        uuid not null references public.services(id),
  employee_id       uuid references public.employees(id) on delete set null, -- null = responsable de la orden
  description       text not null default '',
  is_addon          boolean not null default false,
  quantity          numeric(10,2) not null default 1 check (quantity > 0),
  unit_price        numeric(12,2) check (unit_price >= 0),  -- null = precio automático
  discount          numeric(12,2) not null default 0 check (discount >= 0),
  line_total        numeric(12,2) not null default 0,
  duration_min      int not null default 0,
  commission_type   public.commission_type,
  commission_value  numeric(10,2),
  created_at        timestamptz not null default now()
);

create table public.work_order_status_history (
  id             bigint generated always as identity primary key,
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  from_status    public.order_status,
  to_status      public.order_status not null,
  note           text,
  changed_by     uuid references auth.users(id) on delete set null,
  changed_at     timestamptz not null default now()
);

create table public.car_inspections (
  id                       uuid primary key default gen_random_uuid(),
  work_order_id            uuid not null unique references public.work_orders(id) on delete cascade,
  vehicle_id               uuid not null references public.vehicles(id),
  inspected_by             uuid default auth.uid() references auth.users(id) on delete set null,
  general_notes            text,
  photo_paths              text[] not null default '{}',    -- bucket inspection-photos
  customer_signature_path  text,
  customer_accepted_at     timestamptz,
  created_at               timestamptz not null default now()
);

-- Cada marca es un punto (x, y en % 0–100) sobre una vista 2D del vehículo
create table public.car_inspection_marks (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.car_inspections(id) on delete cascade,
  view           public.vehicle_view not null default 'top',
  x              numeric(5,2) not null check (x between 0 and 100),
  y              numeric(5,2) not null check (y between 0 and 100),
  zone           text,          -- 'capó', 'puerta_del_izq', 'parachoques_tras'...
  damage_type    public.damage_type not null,
  severity       smallint not null default 1 check (severity between 1 and 3),
  notes          text,
  photo_path     text,
  created_at     timestamptz not null default now()
);

-- =============================================================================
-- 7. FINANZAS: CAJA, PAGOS, GASTOS, COMISIONES
-- =============================================================================
create table public.cash_cuts (
  id                uuid primary key default gen_random_uuid(),
  register_name     text not null default 'Caja principal',
  opened_by         uuid not null default auth.uid() references auth.users(id),
  opened_at         timestamptz not null default now(),
  opening_amount    numeric(12,2) not null default 0 check (opening_amount >= 0),
  closed_by         uuid references auth.users(id),
  closed_at         timestamptz,
  expected_cash     numeric(12,2),
  counted_cash      numeric(12,2) check (counted_cash is null or counted_cash >= 0),
  difference        numeric(12,2),             -- contado − esperado (+ sobrante / − faltante)
  totals_by_method  jsonb,
  cash_expenses     numeric(12,2),
  orders_count      int,
  status            public.cash_cut_status not null default 'open',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((status = 'closed') = (closed_at is not null))
);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references public.work_orders(id) on delete restrict,
  cash_cut_id    uuid references public.cash_cuts(id) on delete restrict,
  method         public.payment_method not null,
  amount         numeric(12,2) not null check (amount <> 0),  -- negativo = devolución
  reference      text,                                        -- N.º operación Yape/POS
  received_by    uuid default auth.uid() references auth.users(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now()
);

create table public.operational_expenses (
  id                 uuid primary key default gen_random_uuid(),
  category           public.expense_category not null,
  description        text not null,
  amount             numeric(12,2) not null check (amount > 0),
  expense_date       date not null default ((now() at time zone 'America/Lima')::date),
  payment_method     public.payment_method not null default 'cash',
  paid_from_cash     boolean not null default false,       -- sale de la caja del turno
  cash_cut_id        uuid references public.cash_cuts(id) on delete restrict,
  supplier           text,
  document_type      text check (document_type in ('boleta', 'factura', 'recibo', 'ticket', 'ninguno')),
  document_number    text,
  receipt_path       text,                                  -- bucket expense-receipts
  employee_id        uuid references public.employees(id) on delete set null,
  created_by         uuid default auth.uid() references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.commissions (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.employees(id),
  work_order_id       uuid not null references public.work_orders(id) on delete cascade,
  work_order_item_id  uuid not null unique references public.work_order_items(id) on delete cascade,
  base_amount         numeric(12,2) not null,
  commission_type     public.commission_type not null,
  rate                numeric(10,2) not null,
  amount              numeric(12,2) not null check (amount >= 0),
  status              public.commission_status not null default 'pending',
  paid_at             timestamptz,
  expense_id          uuid references public.operational_expenses(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- =============================================================================
-- 8. KARDEX
-- =============================================================================
create table public.inventory_transactions (
  id             bigint generated always as identity primary key,
  item_id        uuid not null references public.inventory_items(id) on delete restrict,
  tx_type        public.inventory_tx_type not null,
  quantity       numeric(14,3) not null check (quantity <> 0), -- 'adjustment' admite signo
  unit_cost      numeric(12,4),
  total_cost     numeric(14,2),
  balance_after  numeric(14,3),
  work_order_id  uuid references public.work_orders(id) on delete set null,
  expense_id     uuid references public.operational_expenses(id) on delete set null,
  reference      text,
  notes          text,
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (tx_type = 'adjustment' or quantity > 0)
);

-- =============================================================================
-- 9. FIDELIZACIÓN
-- =============================================================================
create table public.loyalty_cards (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null unique references public.customers(id) on delete cascade,
  stamps_current     int not null default 0 check (stamps_current >= 0),
  stamps_total       int not null default 0,
  rewards_available  int not null default 0 check (rewards_available >= 0),
  rewards_redeemed   int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Libro inmutable: TODO cambio de la tarjeta pasa por aquí (trigger)
create table public.loyalty_logs (
  id              bigint generated always as identity primary key,
  card_id         uuid references public.loyalty_cards(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  work_order_id   uuid references public.work_orders(id) on delete set null,
  log_type        public.loyalty_log_type not null,
  stamps_delta    int not null default 0,
  rewards_delta   int not null default 0,
  stamps_after    int,
  rewards_after   int,
  notes           text,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- 10. WHATSAPP HUB
-- =============================================================================
create table public.whatsapp_templates (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  event               public.wa_event not null,
  name                text not null,
  body                text not null,   -- variables: {{nombre}} {{vehiculo}} {{placa}} {{monto}} {{saldo}} {{link_ticket}} ...
  language            text not null default 'es',
  meta_template_name  text,            -- Opción A: nombre de plantilla aprobada en Meta/Twilio
  meta_param_order    text[] not null default '{}', -- orden de variables para {{1}}, {{2}}...
  is_active           boolean not null default true,
  auto_send           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Log + cola de envío (patrón outbox). El worker (Edge Function) reclama lotes.
create table public.whatsapp_logs (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid references public.whatsapp_templates(id) on delete set null,
  event                public.wa_event not null,
  work_order_id        uuid references public.work_orders(id) on delete set null,
  appointment_id       uuid references public.appointments(id) on delete set null,
  customer_id          uuid references public.customers(id) on delete set null,
  to_phone             text not null,
  provider             public.wa_provider not null,
  body_template        text,           -- para mensajes 'custom'
  body_rendered        text,           -- se renderiza al reclamar (datos frescos)
  variables            jsonb not null default '{}',
  status               public.wa_status not null default 'queued',
  attempts             int not null default 0,
  max_attempts         int not null default 5,
  next_attempt_at      timestamptz not null default now(),
  locked_at            timestamptz,
  last_error           text,
  provider_message_id  text,
  sent_at              timestamptz,
  delivered_at         timestamptz,
  read_at              timestamptz,
  created_by           uuid default auth.uid() references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- =============================================================================
-- 11. NOTIFICACIONES INTERNAS (stock crítico, descuadre de caja, WA fallido)
-- =============================================================================
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,       -- 'stock_critical' | 'cash_difference' | 'wa_failed' ...
  title        text not null,
  body         text,
  entity       text,
  entity_id    text,
  target_role  public.user_role,    -- null = todo el staff
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- 12. ÍNDICES
-- =============================================================================
create unique index vehicles_plate_uq          on public.vehicles (plate);
create index vehicles_plate_trgm               on public.vehicles using gin (plate extensions.gin_trgm_ops);
create index vehicles_customer_idx             on public.vehicles (customer_id);
create index customers_phone_idx               on public.customers (phone);
create index customers_name_trgm               on public.customers using gin (full_name extensions.gin_trgm_ops);
create index profiles_customer_idx             on public.profiles (customer_id);
create index service_supplies_item_idx         on public.service_supplies (item_id);
create index appointments_sched_idx            on public.appointments (scheduled_at) where status in ('scheduled', 'confirmed');
create index appointments_customer_idx         on public.appointments (customer_id);
create index work_orders_active_idx            on public.work_orders (status, received_at) where status not in ('delivered', 'cancelled');
create index work_orders_customer_idx          on public.work_orders (customer_id);
create index work_orders_vehicle_idx           on public.work_orders (vehicle_id, received_at desc);
create index work_orders_bay_idx               on public.work_orders (bay_id) where status not in ('delivered', 'cancelled');
create index work_orders_delivered_idx         on public.work_orders (delivered_at) where status = 'delivered';
create index work_orders_employee_idx          on public.work_orders (assigned_employee_id);
create index work_orders_appointment_idx       on public.work_orders (appointment_id);
create index woi_order_idx                     on public.work_order_items (work_order_id);
create index woi_service_idx                   on public.work_order_items (service_id);
create index woi_employee_idx                  on public.work_order_items (employee_id);
create index wosh_order_idx                    on public.work_order_status_history (work_order_id, changed_at);
create index inspections_vehicle_idx           on public.car_inspections (vehicle_id);
create index inspection_marks_idx              on public.car_inspection_marks (inspection_id);
create unique index cash_cuts_one_open_uq      on public.cash_cuts (register_name) where status = 'open';
create index cash_cuts_opened_by_idx           on public.cash_cuts (opened_by, opened_at desc);
create index payments_order_idx                on public.payments (work_order_id);
create index payments_cut_idx                  on public.payments (cash_cut_id);
create index payments_created_idx              on public.payments (created_at);
create index expenses_date_idx                 on public.operational_expenses (expense_date, category);
create index expenses_cut_idx                  on public.operational_expenses (cash_cut_id);
create index expenses_employee_idx             on public.operational_expenses (employee_id);
create index commissions_employee_idx          on public.commissions (employee_id, status, created_at);
create index commissions_order_idx             on public.commissions (work_order_id);
create index commissions_expense_idx           on public.commissions (expense_id);
create index inv_tx_item_idx                   on public.inventory_transactions (item_id, created_at);
create index inv_tx_order_idx                  on public.inventory_transactions (work_order_id);
create index inv_tx_expense_idx                on public.inventory_transactions (expense_id);
create index loyalty_logs_card_idx             on public.loyalty_logs (card_id, created_at);
create index loyalty_logs_customer_idx         on public.loyalty_logs (customer_id);
create unique index loyalty_stamp_once_uq      on public.loyalty_logs (work_order_id) where log_type = 'stamp_earned';
create index wa_queue_idx                      on public.whatsapp_logs (next_attempt_at) where status = 'queued';
create unique index wa_order_event_uq          on public.whatsapp_logs (work_order_id, event)
                                               where work_order_id is not null and event <> 'custom';
create unique index wa_appt_event_uq           on public.whatsapp_logs (appointment_id, event)
                                               where appointment_id is not null and event <> 'custom';
create index wa_provider_msg_idx               on public.whatsapp_logs (provider_message_id);
create index wa_customer_idx                   on public.whatsapp_logs (customer_id);
create index notifications_unread_idx          on public.notifications (created_at desc) where read_at is null;

-- =============================================================================
-- 13. HELPERS DE RBAC (usados por las políticas RLS)
-- =============================================================================
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.current_user_role() in ('superadmin', 'admin', 'cashier', 'operator'), false)
$$;

create or replace function public.is_cashier_or_above()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.current_user_role() in ('superadmin', 'admin', 'cashier'), false)
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.current_user_role() in ('superadmin', 'admin'), false)
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.current_user_role() = 'superadmin', false)
$$;

create or replace function public.current_customer_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select customer_id from public.profiles
  where id = auth.uid() and is_active and role = 'customer'
$$;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select e.id from public.employees e where e.profile_id = auth.uid() and e.is_active
$$;

-- =============================================================================
-- 14. TRIGGERS: IDENTIDAD
-- =============================================================================

-- Alta automática de perfil al registrarse. Rol por defecto: customer (mínimo privilegio).
-- Si el email coincide con un cliente existente, se vincula para el Portal.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name, email, phone, customer_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    new.phone,
    (select c.id from public.customers c
      where new.email is not null and lower(c.email) = lower(new.email)
      order by c.created_at limit 1)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Evita escalamiento de privilegios desde el cliente.
create or replace function private.profiles_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    return new;  -- service_role / SQL Editor
  end if;

  if (new.role, new.is_active, new.customer_id) is distinct from (old.role, old.is_active, old.customer_id) then
    if not public.is_manager() then
      raise exception 'No autorizado para cambiar rol, estado o vínculo de cliente' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'No puede modificar su propio rol o estado' using errcode = '42501';
    end if;
    if (new.role in ('superadmin', 'admin') or old.role in ('superadmin', 'admin'))
       and not public.is_superadmin() then
      raise exception 'Solo un SuperAdmin puede asignar o revocar roles de gerencia' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

create or replace function private.customers_normalize()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_cc text;
begin
  select wa_country_code into v_cc from public.business_settings where id = 1;
  new.phone := public.normalize_phone(new.phone, coalesce(v_cc, '51'));
  new.email := nullif(lower(trim(new.email)), '');
  new.full_name := trim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.document_number := nullif(trim(new.document_number), '');
  return new;
end $$;

create trigger customers_normalize before insert or update on public.customers
  for each row execute function private.customers_normalize();

create or replace function private.vehicles_normalize()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.plate := public.normalize_plate(new.plate);
  if new.plate is null or length(new.plate) < 4 then
    raise exception 'Placa inválida' using errcode = '22023';
  end if;
  new.brand := nullif(trim(new.brand), '');
  new.model := nullif(trim(new.model), '');
  return new;
end $$;

create trigger vehicles_normalize before insert or update on public.vehicles
  for each row execute function private.vehicles_normalize();

-- =============================================================================
-- 15. REALTIME BROADCAST (Portal del cliente, canal por token, sin login)
-- =============================================================================
create or replace function private.broadcast_order(o public.work_orders)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;
  begin
    execute 'select realtime.send($1, $2, $3, $4)'
    using jsonb_build_object(
            'order_number', o.order_number,
            'status',       o.status,
            'status_label', public.order_status_label(o.status),
            'sla_due_at',   o.sla_due_at,
            'ready_at',     o.ready_at,
            'updated_at',   now()),
          'status_changed',
          'order:' || o.public_token,
          false;
  exception when others then
    raise warning 'broadcast_order(%): %', o.order_number, sqlerrm;  -- nunca bloquear la operación
  end;
end $$;

-- =============================================================================
-- 16. ÓRDENES: TOTALES, IMPUESTOS, TRANSICIONES DE ESTADO
-- =============================================================================

-- Recalcula subtotal, tiempo estimado, SLA y descuento por premio de fidelización.
create or replace function private.recalc_work_order(p_order_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.work_orders wo set
    subtotal               = coalesce(x.subtotal, 0),
    estimated_duration_min = coalesce(x.minutes, 0),
    sla_due_at             = wo.received_at + make_interval(mins => coalesce(x.minutes, 0)),
    -- Premio: se regala el servicio principal más caro; los add-ons se cobran.
    discount               = case when wo.is_loyalty_reward then coalesce(x.reward, 0)
                                  when wo.discount > coalesce(x.subtotal, 0) then coalesce(x.subtotal, 0)
                                  else wo.discount end
  from (
    select sum(line_total)                                as subtotal,
           sum(ceil(duration_min * quantity))::int        as minutes,
           max(line_total) filter (where not is_addon)    as reward
    from public.work_order_items
    where work_order_id = p_order_id
  ) x
  where wo.id = p_order_id
$$;

create or replace function private.work_orders_before_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s          public.business_settings;
  v_base     numeric(12,2);
  v_old_pos  int;
  v_new_pos  int;
begin
  select * into s from public.business_settings where id = 1;
  if not found then
    raise exception 'business_settings no está inicializado';
  end if;

  if tg_op = 'INSERT' then
    new.status            := 'received';
    new.status_changed_at := now();
    new.received_at       := coalesce(new.received_at, now());
    new.amount_paid       := 0;
    new.subtotal          := 0;
  end if;

  -- ---- Máquina de estados ------------------------------------------------
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status in ('delivered', 'cancelled') then
      raise exception 'La orden % ya está cerrada (%)', old.order_number, public.order_status_label(old.status)
        using errcode = 'P0001';
    end if;

    if new.status = 'cancelled' then
      if old.amount_paid <> 0 then
        raise exception 'Registre la devolución del pago antes de anular la orden %', old.order_number
          using errcode = 'P0001';
      end if;
      new.cancelled_at := now();
    elsif new.status = 'delivered' then
      if old.status <> 'ready' then
        raise exception 'Solo se puede entregar un vehículo en estado "Listo para entrega"' using errcode = 'P0001';
      end if;
    else
      v_old_pos := array_position(enum_range(null::public.order_status), old.status);
      v_new_pos := array_position(enum_range(null::public.order_status), new.status);
      if v_old_pos - v_new_pos > 1 and not public.is_manager() then
        raise exception 'Solo se permite retroceder una etapa (reproceso)' using errcode = 'P0001';
      end if;
    end if;

    new.status_changed_at := now();
    if new.status = 'washing'   then new.started_at   := coalesce(new.started_at, now()); end if;
    if new.status = 'ready'     then new.ready_at     := now(); end if;
    if new.status = 'delivered' then new.delivered_at := now(); end if;

    -- Al salir de la espera por primera vez se consumen insumos (ver trigger AFTER)
    if new.status not in ('received', 'cancelled') and new.supplies_consumed_at is null then
      new.supplies_consumed_at := now();
      new.started_at := coalesce(new.started_at, now());
    end if;
  end if;

  -- ---- Totales e impuestos -----------------------------------------------
  new.discount := least(greatest(coalesce(new.discount, 0), 0), new.subtotal);
  v_base := new.subtotal - new.discount;

  if s.prices_include_tax then
    new.total      := v_base;
    new.tax_amount := round(v_base - v_base / (1 + s.tax_rate), 2);
  else
    new.tax_amount := round(v_base * s.tax_rate, 2);
    new.total      := v_base + new.tax_amount;
  end if;

  if new.amount_paid > new.total + 0.009 then
    raise exception 'El monto pagado (%) excede el total de la orden (%). Registre una devolución.',
      new.amount_paid, new.total using errcode = 'P0001';
  end if;

  new.payment_status := case
    when new.subtotal > 0 and new.amount_paid >= new.total then 'paid'
    when new.amount_paid > 0                                then 'partial'
    else 'pending'
  end::public.payment_status;

  if new.payment_status = 'paid' then
    if tg_op = 'INSERT' or old.payment_status <> 'paid' then
      new.paid_at := now();
    end if;
  else
    new.paid_at := null;
  end if;

  if tg_op = 'UPDATE' and new.status = 'delivered' and old.status <> 'delivered'
     and new.payment_status <> 'paid' then
    raise exception 'La orden % tiene saldo pendiente (% de %)', new.order_number, new.amount_paid, new.total
      using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger work_orders_before_write before insert or update on public.work_orders
  for each row execute function private.work_orders_before_write();

-- ---- Ítems de la orden ------------------------------------------------------
create or replace function private.work_order_items_before_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order  public.work_orders;
  v_svc    public.services;
  v_vt     public.vehicle_types;
  v_sp     public.service_prices;
begin
  select * into v_order from public.work_orders
  where id = case when tg_op = 'DELETE' then old.work_order_id else new.work_order_id end;

  if found and v_order.status in ('delivered', 'cancelled') then
    raise exception 'No se pueden modificar servicios de una orden cerrada (%)', v_order.order_number
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and new.work_order_id <> old.work_order_id then
    raise exception 'No se puede mover un ítem a otra orden';
  end if;

  select * into v_svc from public.services where id = new.service_id;
  select vt.* into v_vt
  from public.vehicles v join public.vehicle_types vt on vt.id = v.vehicle_type_id
  where v.id = v_order.vehicle_id;
  select * into v_sp from public.service_prices
  where service_id = new.service_id and vehicle_size = v_vt.size;

  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
    new.description      := coalesce(nullif(trim(new.description), ''), v_svc.name);
    new.is_addon         := v_svc.is_addon;
    new.unit_price       := coalesce(new.unit_price, v_sp.price,
                                     round(v_svc.base_price * coalesce(v_vt.price_multiplier, 1), 2));
    new.duration_min     := coalesce(v_sp.duration_min,
                                     ceil(v_svc.base_duration_min * coalesce(v_vt.time_multiplier, 1)))::int;
    new.commission_type  := coalesce(new.commission_type, v_svc.commission_type);
    new.commission_value := coalesce(new.commission_value, v_svc.commission_value);
  end if;

  new.unit_price := coalesce(new.unit_price, 0);
  new.discount   := least(coalesce(new.discount, 0), new.quantity * new.unit_price);
  new.line_total := round(new.quantity * new.unit_price - new.discount, 2);
  return new;
end $$;

create trigger work_order_items_before_write before insert or update or delete on public.work_order_items
  for each row execute function private.work_order_items_before_write();

create or replace function private.work_order_items_after_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.recalc_work_order(case when tg_op = 'DELETE' then old.work_order_id else new.work_order_id end);
  return null;
end $$;

create trigger work_order_items_after_write after insert or update or delete on public.work_order_items
  for each row execute function private.work_order_items_after_write();

-- =============================================================================
-- 17. INVENTARIO / KARDEX
-- =============================================================================
create or replace function private.inventory_items_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.kardex_write', true), 'off') <> 'on' then
    if tg_op = 'INSERT' then
      new.current_stock := 0;  -- el stock inicial se registra con un movimiento 'in'
    elsif new.current_stock is distinct from old.current_stock then
      raise exception 'El stock solo se modifica con movimientos de Kardex (inventory_transactions)'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger inventory_items_guard before insert or update on public.inventory_items
  for each row execute function private.inventory_items_guard();

create or replace function private.inventory_tx_apply()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item       public.inventory_items;
  v_delta      numeric(14,3);
  v_new_stock  numeric(14,3);
  v_new_cost   numeric(12,4);
begin
  select * into v_item from public.inventory_items where id = new.item_id for update;
  if not found then
    raise exception 'Insumo no encontrado';
  end if;

  v_delta := case new.tx_type
               when 'in'         then new.quantity
               when 'adjustment' then new.quantity
               else -new.quantity
             end;
  v_new_stock := v_item.current_stock + v_delta;

  -- Salidas manuales no pueden dejar stock negativo; el consumo automático sí
  -- (para no bloquear la operación) y queda marcado como 'out'.
  if new.tx_type = 'out' and v_new_stock < 0 then
    raise exception 'Stock insuficiente de % (disponible: % %)', v_item.name, v_item.current_stock, v_item.unit
      using errcode = 'P0001';
  end if;

  -- Costo promedio ponderado en entradas
  if new.tx_type = 'in' and new.unit_cost is not null then
    v_new_cost := round(
      (greatest(v_item.current_stock, 0) * v_item.unit_cost + new.quantity * new.unit_cost)
      / (greatest(v_item.current_stock, 0) + new.quantity), 4);
  else
    v_new_cost := v_item.unit_cost;
  end if;

  new.unit_cost     := coalesce(new.unit_cost, v_item.unit_cost);
  new.total_cost    := round(abs(v_delta) * new.unit_cost, 2);
  new.balance_after := v_new_stock;
  new.created_by    := coalesce(new.created_by, auth.uid());

  perform set_config('app.kardex_write', 'on', true);
  update public.inventory_items
     set current_stock = v_new_stock, unit_cost = v_new_cost
   where id = new.item_id;
  perform set_config('app.kardex_write', 'off', true);

  -- Alerta de reorden al cruzar el mínimo
  if v_new_stock <= v_item.min_stock and v_item.current_stock > v_item.min_stock then
    insert into public.notifications (type, title, body, entity, entity_id, target_role)
    values ('stock_critical',
            'Stock crítico: ' || v_item.name,
            format('Quedan %s %s (mínimo %s). Reorden sugerida: %s %s.',
                   v_new_stock, v_item.unit, v_item.min_stock,
                   greatest(v_item.reorder_qty, v_item.min_stock * 2 - v_new_stock), v_item.unit),
            'inventory_items', v_item.id::text, 'admin');
  end if;

  return new;
end $$;

create trigger inventory_tx_apply before insert on public.inventory_transactions
  for each row execute function private.inventory_tx_apply();

-- Kardex inmutable: correcciones = nuevo movimiento 'adjustment'
create or replace function private.forbid_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception '% es un registro inmutable; registre un movimiento de ajuste', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger inventory_tx_immutable
  before update of item_id, tx_type, quantity, unit_cost, total_cost, balance_after
  on public.inventory_transactions
  for each row execute function private.forbid_mutation();

create trigger inventory_tx_no_delete before delete on public.inventory_transactions
  for each row execute function private.forbid_mutation();

create or replace function private.consume_supplies(p_order_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.inventory_transactions (item_id, tx_type, quantity, work_order_id, reference, notes)
  select ss.item_id,
         'consumption',
         round(sum(ss.quantity * i.quantity * coalesce(vt.supply_multiplier, 1)), 3),
         o.id,
         o.order_number,
         'Consumo automático por servicio'
  from public.work_order_items i
  join public.service_supplies ss on ss.service_id = i.service_id
  join public.work_orders o       on o.id = i.work_order_id
  join public.vehicles v          on v.id = o.vehicle_id
  join public.vehicle_types vt    on vt.id = v.vehicle_type_id
  where i.work_order_id = p_order_id
  group by ss.item_id, o.id, o.order_number
$$;

-- =============================================================================
-- 18. COMISIONES
-- =============================================================================
create or replace function private.generate_commissions(p_order_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.commissions
    (employee_id, work_order_id, work_order_item_id, base_amount, commission_type, rate, amount)
  select employee_id, work_order_id, item_id, base_amount, ctype, rate, amount
  from (
    select e.id                                   as employee_id,
           i.work_order_id,
           i.id                                   as item_id,
           i.line_total                           as base_amount,
           coalesce(e.commission_type,  i.commission_type, 'percentage') as ctype,
           coalesce(case when e.commission_type is not null then e.commission_value end,
                    i.commission_value, 0)        as rate,
           i.quantity
    from public.work_order_items i
    join public.work_orders o on o.id = i.work_order_id
    join public.employees e   on e.id = coalesce(i.employee_id, o.assigned_employee_id)
    where i.work_order_id = p_order_id
  ) x
  cross join lateral (
    select round(case when x.ctype = 'percentage' then x.base_amount * x.rate / 100
                      else x.rate * x.quantity end, 2) as amount
  ) a
  where a.amount > 0
  on conflict (work_order_item_id) do nothing
$$;

-- =============================================================================
-- 19. FIDELIZACIÓN (toda la lógica vive en el libro loyalty_logs)
-- =============================================================================
create or replace function private.loyalty_apply_log()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_card     public.loyalty_cards;
  v_req      int;
  v_stamps   int;
  v_earned   int;
  v_rewards  int;
begin
  insert into public.loyalty_cards (customer_id) values (new.customer_id)
  on conflict (customer_id) do nothing;

  select * into v_card from public.loyalty_cards where customer_id = new.customer_id for update;
  select loyalty_stamps_required into v_req from public.business_settings where id = 1;

  v_stamps  := greatest(v_card.stamps_current + new.stamps_delta, 0);
  v_earned  := v_stamps / v_req;               -- cada N sellos = 1 premio
  v_rewards := v_card.rewards_available + new.rewards_delta + v_earned;

  if v_rewards < 0 then
    raise exception 'El cliente no tiene premios de fidelización disponibles' using errcode = 'P0001';
  end if;

  update public.loyalty_cards set
    stamps_current    = v_stamps % v_req,
    stamps_total      = stamps_total + greatest(new.stamps_delta, 0),
    rewards_available = v_rewards,
    rewards_redeemed  = rewards_redeemed + case new.log_type
                                             when 'reward_redeemed' then 1
                                             when 'reward_refunded' then -1
                                             else 0 end,
    updated_at        = now()
  where id = v_card.id;

  new.card_id       := v_card.id;
  new.stamps_after  := v_stamps % v_req;
  new.rewards_after := v_rewards;
  new.created_by    := coalesce(new.created_by, auth.uid());
  return new;
end $$;

create trigger loyalty_apply_log before insert on public.loyalty_logs
  for each row execute function private.loyalty_apply_log();

-- Inmutable en sus montos (work_order_id puede pasar a null si se borra la orden)
create trigger loyalty_logs_immutable
  before update of customer_id, log_type, stamps_delta, rewards_delta, stamps_after, rewards_after
  on public.loyalty_logs
  for each row execute function private.forbid_mutation();

create or replace function private.loyalty_award_stamp(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_o public.work_orders; v_enabled boolean;
begin
  select loyalty_enabled into v_enabled from public.business_settings where id = 1;
  if not coalesce(v_enabled, false) then return; end if;

  select * into v_o from public.work_orders where id = p_order_id;
  if v_o.is_loyalty_reward or v_o.total <= 0 then return; end if;

  -- Idempotente: un sello por orden (protegido además por índice único)
  if exists (select 1 from public.loyalty_logs
             where work_order_id = p_order_id and log_type = 'stamp_earned') then
    return;
  end if;

  insert into public.loyalty_logs (customer_id, work_order_id, log_type, stamps_delta, notes)
  values (v_o.customer_id, v_o.id, 'stamp_earned', 1, 'Servicio pagado ' || v_o.order_number);
end $$;

-- =============================================================================
-- 20. WHATSAPP: ENCOLADO, VARIABLES, RENDER
-- =============================================================================
create or replace function private.wa_enqueue_for_order(p_order_id uuid, p_event public.wa_event, p_delay_minutes int default 0)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_o  public.work_orders;
  v_c  public.customers;
  v_t  public.whatsapp_templates;
  v_p  public.wa_provider;
begin
  select * into v_o from public.work_orders where id = p_order_id;
  select * into v_c from public.customers where id = v_o.customer_id;
  if v_c.phone is null or not v_c.whatsapp_opt_in then return; end if;

  select * into v_t from public.whatsapp_templates
  where event = p_event and is_active and auto_send
  order by updated_at desc limit 1;
  if not found then return; end if;

  select wa_provider into v_p from public.business_settings where id = 1;

  insert into public.whatsapp_logs
    (template_id, event, work_order_id, customer_id, to_phone, provider, next_attempt_at, created_by)
  values
    (v_t.id, p_event, v_o.id, v_c.id, v_c.phone, v_p,
     now() + make_interval(mins => greatest(p_delay_minutes, 0)), auth.uid())
  on conflict (work_order_id, event) where work_order_id is not null and event <> 'custom'
  do nothing;
end $$;

create or replace function private.wa_build_variables(p_log public.whatsapp_logs)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'negocio',       s.business_name,
    'nombre',        split_part(c.full_name, ' ', 1),
    'cliente',       c.full_name,
    'vehiculo',      coalesce(nullif(trim(concat_ws(' ', v.brand, v.model)), ''), vt.name, 'vehículo'),
    'placa',         v.plate,
    'numero_orden',  o.order_number,
    'monto',         case when o.id is not null then s.currency_symbol || ' ' || to_char(o.total, 'FM999999990.00') end,
    'saldo',         case when o.id is not null then s.currency_symbol || ' ' || to_char(o.total - o.amount_paid, 'FM999999990.00') end,
    'link_ticket',   case when o.id is not null then rtrim(s.public_portal_url, '/') || '/t/' || o.public_token end,
    'link_encuesta', case when o.id is not null then rtrim(s.public_portal_url, '/') || '/t/' || o.public_token || '?nps=1' end,
    'fecha_cita',    to_char(a.scheduled_at at time zone s.timezone, 'DD/MM/YYYY'),
    'hora_cita',     to_char(a.scheduled_at at time zone s.timezone, 'HH24:MI')
  ))
  from public.business_settings s
  left join public.work_orders   o  on o.id  = p_log.work_order_id
  left join public.appointments  a  on a.id  = p_log.appointment_id
  left join public.customers     c  on c.id  = coalesce(p_log.customer_id, o.customer_id, a.customer_id)
  -- Sin orden ni cita (mensaje manual): se usa el vehículo más reciente del cliente
  left join public.vehicles      v  on v.id  = coalesce(o.vehicle_id, a.vehicle_id,
                                                (select lv.id from public.vehicles lv
                                                 where lv.customer_id = c.id and lv.is_active
                                                 order by lv.updated_at desc limit 1))
  left join public.vehicle_types vt on vt.id = v.vehicle_type_id
  where s.id = 1
$$;

create or replace function private.wa_render(p_body text, p_vars jsonb)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  r text := regexp_replace(coalesce(p_body, ''), '\{\{\s*(\w+)\s*\}\}', '{{\1}}', 'g');
  k text;
  v text;
begin
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}')) loop
    r := replace(r, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  return regexp_replace(r, '\{\{\w+\}\}', '', 'g');  -- variables sin valor se eliminan
end $$;

-- =============================================================================
-- 21. ÓRDENES: EFECTOS POSTERIORES (historial, WA, Kardex, comisiones, sellos)
-- =============================================================================
create or replace function private.work_orders_after_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nps_delay int;
  v_note      text := nullif(current_setting('app.status_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.work_order_status_history (work_order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());

    -- El cuerpo se renderiza al reclamar el mensaje: ya tendrá servicios y monto.
    perform private.wa_enqueue_for_order(new.id, 'check_in', 0);

    if new.is_loyalty_reward then
      insert into public.loyalty_logs (customer_id, work_order_id, log_type, rewards_delta, notes)
      values (new.customer_id, new.id, 'reward_redeemed', -1, 'Canje en ' || new.order_number);
    end if;

    perform private.broadcast_order(new);
    return null;
  end if;

  -- ---- Cambio de estado ----
  if new.status is distinct from old.status then
    insert into public.work_order_status_history (work_order_id, from_status, to_status, note, changed_by)
    values (new.id, old.status, new.status, v_note, auth.uid());

    if new.status = 'ready' then
      perform private.wa_enqueue_for_order(new.id, 'ready_for_pickup', 0);
    end if;

    if new.status = 'delivered' then
      perform private.generate_commissions(new.id);
      select nps_delay_minutes into v_nps_delay from public.business_settings where id = 1;
      perform private.wa_enqueue_for_order(new.id, 'nps_survey', coalesce(v_nps_delay, 120));
    end if;

    if new.status = 'cancelled' then
      update public.whatsapp_logs set status = 'cancelled', updated_at = now()
      where work_order_id = new.id and status = 'queued';
      if new.is_loyalty_reward then
        insert into public.loyalty_logs (customer_id, work_order_id, log_type, rewards_delta, notes)
        values (new.customer_id, new.id, 'reward_refunded', 1, 'Orden anulada ' || new.order_number);
      end if;
    end if;
  end if;

  -- ---- Premio activado/desactivado después de creada la orden ----
  if new.status <> 'cancelled' and new.is_loyalty_reward is distinct from old.is_loyalty_reward then
    insert into public.loyalty_logs (customer_id, work_order_id, log_type, rewards_delta, notes)
    values (new.customer_id, new.id,
            case when new.is_loyalty_reward then 'reward_redeemed' else 'reward_refunded' end::public.loyalty_log_type,
            case when new.is_loyalty_reward then -1 else 1 end,
            'Cambio manual en ' || new.order_number);
    perform private.recalc_work_order(new.id);
  end if;

  -- ---- Descuento automático de insumos ----
  if old.supplies_consumed_at is null and new.supplies_consumed_at is not null then
    perform private.consume_supplies(new.id);
  end if;

  -- ---- Sello de fidelización al completar el pago ----
  if new.payment_status = 'paid' and old.payment_status <> 'paid' then
    perform private.loyalty_award_stamp(new.id);
  end if;

  if (new.status, new.bay_id, new.sla_due_at) is distinct from (old.status, old.bay_id, old.sla_due_at) then
    perform private.broadcast_order(new);
  end if;

  return null;
end $$;

create trigger work_orders_after_write after insert or update on public.work_orders
  for each row execute function private.work_orders_after_write();

-- =============================================================================
-- 22. CAJA Y PAGOS
-- =============================================================================
create or replace function private.find_open_cash_cut(p_user uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.cash_cuts
  where status = 'open'
  order by (opened_by = p_user) desc nulls last, opened_at desc
  limit 1
$$;

create or replace function private.payments_before_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order  public.work_orders;
  v_status public.cash_cut_status;
begin
  if tg_op = 'DELETE' then
    select status into v_status from public.cash_cuts where id = old.cash_cut_id;
    if v_status = 'closed' then
      raise exception 'No se puede eliminar un pago de una caja cerrada; registre una devolución'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  select * into v_order from public.work_orders where id = new.work_order_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if v_order.status = 'cancelled' then
    raise exception 'La orden % está anulada', v_order.order_number using errcode = 'P0001';
  end if;
  if new.amount < 0 and auth.uid() is not null and not public.is_manager() then
    raise exception 'Solo gerencia puede registrar devoluciones' using errcode = '42501';
  end if;

  new.received_by := coalesce(new.received_by, auth.uid());
  new.cash_cut_id := coalesce(new.cash_cut_id, private.find_open_cash_cut(new.received_by));

  if new.cash_cut_id is not null then
    select status into v_status from public.cash_cuts where id = new.cash_cut_id;
    if v_status <> 'open' then
      raise exception 'La caja indicada está cerrada' using errcode = 'P0001';
    end if;
  elsif new.method = 'cash' then
    raise exception 'No hay una caja abierta. Abra caja antes de cobrar en efectivo.' using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger payments_before_write before insert or delete on public.payments
  for each row execute function private.payments_before_write();

create trigger payments_no_update before update on public.payments
  for each row execute function private.forbid_mutation();

create or replace function private.payments_after_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order_id uuid := case when tg_op = 'DELETE' then old.work_order_id else new.work_order_id end;
begin
  update public.work_orders
     set amount_paid = (select coalesce(sum(amount), 0) from public.payments where work_order_id = v_order_id)
   where id = v_order_id;
  return null;
end $$;

create trigger payments_after_write after insert or delete on public.payments
  for each row execute function private.payments_after_write();

create or replace function private.expenses_before_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status public.cash_cut_status;
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  if new.paid_from_cash then
    new.payment_method := 'cash';
    new.cash_cut_id := coalesce(new.cash_cut_id, private.find_open_cash_cut(auth.uid()));
    if new.cash_cut_id is null then
      raise exception 'No hay una caja abierta para registrar un egreso en efectivo' using errcode = 'P0001';
    end if;
  end if;

  if new.cash_cut_id is not null
     and (tg_op = 'INSERT' or new.cash_cut_id is distinct from old.cash_cut_id or new.amount <> old.amount) then
    select status into v_status from public.cash_cuts where id = new.cash_cut_id;
    if v_status <> 'open' then
      raise exception 'La caja del egreso está cerrada' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger expenses_before_write before insert or update on public.operational_expenses
  for each row execute function private.expenses_before_write();

-- =============================================================================
-- 23. NOTIFICACIONES DE WHATSAPP FALLIDO
-- =============================================================================
create or replace function private.whatsapp_logs_after_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'failed' and old.status <> 'failed' then
    insert into public.notifications (type, title, body, entity, entity_id, target_role)
    values ('wa_failed', 'WhatsApp no enviado a ' || new.to_phone,
            coalesce(new.last_error, 'Error desconocido'), 'whatsapp_logs', new.id::text, 'cashier');
  end if;
  return null;
end $$;

create trigger whatsapp_logs_after_update after update on public.whatsapp_logs
  for each row execute function private.whatsapp_logs_after_update();

-- =============================================================================
-- 24. updated_at
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'business_settings', 'customers', 'profiles', 'vehicles', 'inventory_items', 'services',
    'employees', 'appointments', 'work_orders', 'cash_cuts', 'operational_expenses',
    'whatsapp_templates', 'whatsapp_logs'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- =============================================================================
-- 25. RPCs PARA EL FRONTEND
-- =============================================================================

-- ---- Recepción: bahía con menor carga compatible con el servicio -----------
create or replace function public.suggest_bay(p_required public.bay_type default 'wash')
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select b.id
  from public.bays b
  left join lateral (
    select coalesce(sum(greatest(
             wo.estimated_duration_min
             - extract(epoch from now() - coalesce(wo.started_at, wo.received_at)) / 60, 0)), 0) as load_min
    from public.work_orders wo
    where wo.bay_id = b.id
      and wo.status in ('received', 'washing', 'drying_detailing', 'quality_check')
  ) l on true
  where b.is_active
    and (b.bay_type = p_required or b.bay_type = 'multi' or p_required = 'multi')
  order by l.load_min, b.sort_order
  limit 1
$$;

-- ---- Autocompletado por placa / nombre / teléfono (< 30 s check-in) --------
create or replace function public.search_vehicles(p_query text, p_limit int default 8)
returns table (
  vehicle_id uuid, plate text, vehicle_label text, vehicle_type_id uuid, vehicle_type text,
  customer_id uuid, customer_name text, customer_phone text,
  stamps_current int, rewards_available int, last_visit timestamptz, open_order_number text
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select v.id, v.plate,
         nullif(trim(concat_ws(' ', v.brand, v.model, v.color)), ''),
         vt.id, vt.name,
         c.id, c.full_name, c.phone,
         coalesce(lc.stamps_current, 0), coalesce(lc.rewards_available, 0),
         lv.last_visit, oo.order_number
  from public.vehicles v
  join public.customers c      on c.id = v.customer_id
  join public.vehicle_types vt on vt.id = v.vehicle_type_id
  left join public.loyalty_cards lc on lc.customer_id = c.id
  left join lateral (select max(received_at) as last_visit from public.work_orders where vehicle_id = v.id) lv on true
  left join lateral (select order_number from public.work_orders
                     where vehicle_id = v.id and status not in ('delivered', 'cancelled')
                     order by received_at desc limit 1) oo on true
  where public.is_staff()
    and length(trim(coalesce(p_query, ''))) >= 2
    and (v.plate like public.normalize_plate(p_query) || '%'
         or c.full_name ilike '%' || trim(p_query) || '%'
         or c.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%' and length(regexp_replace(p_query, '\D', '', 'g')) >= 6)
  order by (v.plate like public.normalize_plate(p_query) || '%') desc, lv.last_visit desc nulls last
  limit least(greatest(p_limit, 1), 25)
$$;

-- ---- Check-in atómico: cliente + vehículo + servicios + inspección + bahía --
-- Payload:
-- {
--   "customer": {"id"?, "full_name", "phone", "document_type", "document_number", "email", "whatsapp_opt_in"},
--   "vehicle":  {"id"?, "plate", "vehicle_type_id", "brand", "model", "color", "year"},
--   "services": [{"service_id", "quantity"?, "employee_id"?, "unit_price"? (solo gerencia)}],
--   "bay_id"?, "assigned_employee_id"?, "appointment_id"?, "notes"?, "mileage"?, "fuel_level"?,
--   "use_loyalty_reward"?: bool,
--   "inspection"?: {"general_notes", "photo_paths": [], "marks": [{"view","x","y","zone","damage_type","severity","notes"}]}
-- }
create or replace function public.create_work_order(p jsonb)
returns public.work_orders
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_c          jsonb := coalesce(p -> 'customer', '{}');
  v_v          jsonb := coalesce(p -> 'vehicle', '{}');
  v_customer   uuid  := nullif(v_c ->> 'id', '')::uuid;
  v_vehicle    uuid  := nullif(v_v ->> 'id', '')::uuid;
  v_veh_cust   uuid;
  v_plate      text  := public.normalize_plate(v_v ->> 'plate');
  v_phone      text;
  v_cc         text;
  v_order      public.work_orders;
  v_svc        jsonb;
  v_required   public.bay_type := 'wash';
  v_insp       uuid;
  v_mark       jsonb;
  v_is_manager boolean := public.is_manager();
begin
  if not public.is_cashier_or_above() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'services') is distinct from 'array' or jsonb_array_length(p -> 'services') = 0 then
    raise exception 'Seleccione al menos un servicio' using errcode = '22023';
  end if;

  select wa_country_code into v_cc from public.business_settings where id = 1;
  v_phone := public.normalize_phone(v_c ->> 'phone', coalesce(v_cc, '51'));

  -- 1) Vehículo existente
  if v_vehicle is null and v_plate is not null then
    select id, customer_id into v_vehicle, v_veh_cust from public.vehicles where plate = v_plate;
  elsif v_vehicle is not null then
    select customer_id into v_veh_cust from public.vehicles where id = v_vehicle;
  end if;

  -- 2) Cliente: id → documento → teléfono → dueño del vehículo → nuevo
  if v_customer is null and nullif(v_c ->> 'document_number', '') is not null then
    select id into v_customer from public.customers
    where document_type = v_c ->> 'document_type' and document_number = trim(v_c ->> 'document_number');
  end if;
  if v_customer is null and v_phone is not null then
    select id into v_customer from public.customers where phone = v_phone order by created_at limit 1;
  end if;
  if v_customer is null then
    v_customer := v_veh_cust;
  end if;

  if v_customer is null then
    if nullif(trim(v_c ->> 'full_name'), '') is null then
      raise exception 'Ingrese el nombre del cliente' using errcode = '22023';
    end if;
    insert into public.customers (full_name, phone, document_type, document_number, email, whatsapp_opt_in)
    values (v_c ->> 'full_name', v_phone, nullif(v_c ->> 'document_type', ''),
            nullif(v_c ->> 'document_number', ''), v_c ->> 'email',
            coalesce((v_c ->> 'whatsapp_opt_in')::boolean, true))
    returning id into v_customer;
  else
    update public.customers set
      phone           = coalesce(v_phone, phone),
      email           = coalesce(nullif(v_c ->> 'email', ''), email),
      whatsapp_opt_in = coalesce((v_c ->> 'whatsapp_opt_in')::boolean, whatsapp_opt_in)
    where id = v_customer and (v_c ?| array['phone', 'email', 'whatsapp_opt_in']);
  end if;

  -- 3) Vehículo nuevo / actualización de datos
  if v_vehicle is null then
    if v_plate is null or nullif(v_v ->> 'vehicle_type_id', '') is null then
      raise exception 'Placa y tipo de vehículo son obligatorios' using errcode = '22023';
    end if;
    insert into public.vehicles (customer_id, vehicle_type_id, plate, brand, model, color, year)
    values (v_customer, (v_v ->> 'vehicle_type_id')::uuid, v_plate, v_v ->> 'brand', v_v ->> 'model',
            v_v ->> 'color', nullif(v_v ->> 'year', '')::smallint)
    returning id into v_vehicle;
  else
    update public.vehicles set
      vehicle_type_id = coalesce(nullif(v_v ->> 'vehicle_type_id', '')::uuid, vehicle_type_id),
      brand = coalesce(nullif(v_v ->> 'brand', ''), brand),
      model = coalesce(nullif(v_v ->> 'model', ''), model),
      color = coalesce(nullif(v_v ->> 'color', ''), color)
    where id = v_vehicle and (v_v ?| array['vehicle_type_id', 'brand', 'model', 'color']);
  end if;

  if exists (select 1 from public.work_orders
             where vehicle_id = v_vehicle and status not in ('delivered', 'cancelled')) then
    raise exception 'El vehículo % ya tiene una orden activa', coalesce(v_plate, '') using errcode = 'P0001';
  end if;

  -- 4) Orden
  insert into public.work_orders
    (customer_id, vehicle_id, appointment_id, assigned_employee_id, notes, mileage, fuel_level, is_loyalty_reward)
  values
    (v_customer, v_vehicle, nullif(p ->> 'appointment_id', '')::uuid,
     nullif(p ->> 'assigned_employee_id', '')::uuid, p ->> 'notes',
     nullif(p ->> 'mileage', '')::int, nullif(p ->> 'fuel_level', '')::smallint,
     coalesce((p ->> 'use_loyalty_reward')::boolean, false))
  returning * into v_order;

  -- 5) Servicios y add-ons
  for v_svc in select * from jsonb_array_elements(p -> 'services') loop
    insert into public.work_order_items (work_order_id, service_id, quantity, employee_id, unit_price)
    values (v_order.id,
            (v_svc ->> 'service_id')::uuid,
            coalesce(nullif(v_svc ->> 'quantity', '')::numeric, 1),
            nullif(v_svc ->> 'employee_id', '')::uuid,
            case when v_is_manager then nullif(v_svc ->> 'unit_price', '')::numeric end);
  end loop;

  -- 6) Asignación inteligente de bahía
  if exists (select 1 from public.work_order_items i join public.services s on s.id = i.service_id
             where i.work_order_id = v_order.id and s.required_bay = 'detail') then
    v_required := 'detail';
  end if;
  update public.work_orders
     set bay_id = coalesce(nullif(p ->> 'bay_id', '')::uuid, public.suggest_bay(v_required))
   where id = v_order.id;

  -- 7) Inspección visual
  if jsonb_typeof(p -> 'inspection') = 'object' then
    insert into public.car_inspections (work_order_id, vehicle_id, general_notes, photo_paths)
    values (v_order.id, v_vehicle, p -> 'inspection' ->> 'general_notes',
            coalesce(array(select jsonb_array_elements_text(p -> 'inspection' -> 'photo_paths')), '{}'))
    returning id into v_insp;

    for v_mark in select * from jsonb_array_elements(coalesce(p -> 'inspection' -> 'marks', '[]')) loop
      insert into public.car_inspection_marks (inspection_id, view, x, y, zone, damage_type, severity, notes, photo_path)
      values (v_insp,
              coalesce(nullif(v_mark ->> 'view', ''), 'top')::public.vehicle_view,
              (v_mark ->> 'x')::numeric, (v_mark ->> 'y')::numeric,
              v_mark ->> 'zone',
              (v_mark ->> 'damage_type')::public.damage_type,
              coalesce(nullif(v_mark ->> 'severity', '')::smallint, 1),
              v_mark ->> 'notes', v_mark ->> 'photo_path');
    end loop;
  end if;

  -- 8) Cita → check-in
  if v_order.appointment_id is not null then
    update public.appointments set status = 'checked_in' where id = v_order.appointment_id;
  end if;

  select * into v_order from public.work_orders where id = v_order.id;
  return v_order;
end $$;

-- ---- Kanban: mover tarjeta (usado por operadores y caja) --------------------
create or replace function public.move_work_order(p_order_id uuid, p_status public.order_status, p_note text default null)
returns public.work_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.work_orders;
begin
  if not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if public.current_user_role() = 'operator' and p_status in ('delivered', 'cancelled') then
    raise exception 'Los operadores no pueden entregar ni anular órdenes' using errcode = '42501';
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.work_orders set status = p_status where id = p_order_id returning * into v;
  perform set_config('app.status_note', '', true);

  if not found then raise exception 'Orden no encontrada'; end if;
  return v;
end $$;

create or replace function public.assign_work_order(p_order_id uuid, p_bay_id uuid default null, p_employee_id uuid default null)
returns public.work_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.work_orders;
begin
  if not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.work_orders set
    bay_id               = coalesce(p_bay_id, bay_id),
    assigned_employee_id = coalesce(p_employee_id, assigned_employee_id)
  where id = p_order_id and status not in ('delivered', 'cancelled')
  returning * into v;
  if not found then raise exception 'Orden no encontrada o cerrada'; end if;
  return v;
end $$;

-- ---- Caja: arqueo y cierre ------------------------------------------------
create or replace function public.close_cash_cut(p_cash_cut_id uuid, p_counted_cash numeric, p_notes text default null)
returns public.cash_cuts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cut       public.cash_cuts;
  v_cash_in   numeric(12,2);
  v_cash_out  numeric(12,2);
  v_totals    jsonb;
  v_orders    int;
  v_expected  numeric(12,2);
begin
  if not public.is_cashier_or_above() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Monto contado inválido' using errcode = '22023';
  end if;

  select * into v_cut from public.cash_cuts where id = p_cash_cut_id for update;
  if not found then raise exception 'Caja no encontrada'; end if;
  if v_cut.status = 'closed' then raise exception 'La caja ya está cerrada' using errcode = 'P0001'; end if;
  if v_cut.opened_by <> auth.uid() and not public.is_manager() then
    raise exception 'Solo quien abrió la caja o gerencia puede cerrarla' using errcode = '42501';
  end if;

  select coalesce(sum(amount) filter (where method = 'cash'), 0), count(distinct work_order_id)
    into v_cash_in, v_orders
  from public.payments where cash_cut_id = p_cash_cut_id;

  select coalesce(jsonb_object_agg(method, total), '{}') into v_totals
  from (select method, sum(amount) as total from public.payments
        where cash_cut_id = p_cash_cut_id group by method) t;

  select coalesce(sum(amount), 0) into v_cash_out
  from public.operational_expenses where cash_cut_id = p_cash_cut_id and paid_from_cash;

  v_expected := v_cut.opening_amount + v_cash_in - v_cash_out;

  update public.cash_cuts set
    status           = 'closed',
    closed_by        = auth.uid(),
    closed_at        = now(),
    expected_cash    = v_expected,
    counted_cash     = p_counted_cash,
    difference       = p_counted_cash - v_expected,
    totals_by_method = v_totals,
    cash_expenses    = v_cash_out,
    orders_count     = v_orders,
    notes            = coalesce(p_notes, notes)
  where id = p_cash_cut_id
  returning * into v_cut;

  if v_cut.difference <> 0 then
    insert into public.notifications (type, title, body, entity, entity_id, target_role)
    values ('cash_difference',
            case when v_cut.difference > 0 then 'Sobrante de caja' else 'Faltante de caja' end
              || ' en ' || v_cut.register_name,
            format('Esperado %s · Contado %s · Diferencia %s', v_expected, p_counted_cash, v_cut.difference),
            'cash_cuts', v_cut.id::text, 'admin');
  end if;

  return v_cut;
end $$;

-- ---- Pago de comisiones (genera egreso y marca comisiones como pagadas) -----
create or replace function public.pay_commissions(
  p_employee_id uuid, p_until date,
  p_method public.payment_method default 'cash', p_paid_from_cash boolean default false)
returns public.operational_expenses
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_total numeric(12,2);
  v_emp   public.employees;
  v_tz    text;
  v_exp   public.operational_expenses;
begin
  if not public.is_manager() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select timezone into v_tz from public.business_settings where id = 1;
  select * into v_emp from public.employees where id = p_employee_id;
  if not found then raise exception 'Empleado no encontrado'; end if;

  select coalesce(sum(amount), 0) into v_total
  from public.commissions
  where employee_id = p_employee_id and status = 'pending'
    and (created_at at time zone v_tz)::date <= p_until;

  if v_total <= 0 then
    raise exception 'No hay comisiones pendientes para % hasta %', v_emp.full_name, p_until using errcode = 'P0001';
  end if;

  insert into public.operational_expenses
    (category, description, amount, payment_method, paid_from_cash, employee_id, document_type)
  values
    ('washer_commissions', format('Comisiones de %s hasta %s', v_emp.full_name, to_char(p_until, 'DD/MM/YYYY')),
     v_total, p_method, p_paid_from_cash, p_employee_id, 'recibo')
  returning * into v_exp;

  update public.commissions set status = 'paid', paid_at = now(), expense_id = v_exp.id
  where employee_id = p_employee_id and status = 'pending'
    and (created_at at time zone v_tz)::date <= p_until;

  return v_exp;
end $$;

-- ---- Estado de resultados: Ingresos − Costos directos − Gastos = EBITDA ----
-- Base devengada: ingresos de órdenes ENTREGADAS en el rango, netos de IGV.
-- Costos directos: comisiones generadas + costo de insumos consumidos (Kardex).
-- Gastos operativos: egresos del rango EXCEPTO 'washer_commissions' y 'supplies'
-- (esos son salidas de caja ya contabilizadas como costo directo; evita doble conteo).
create or replace function public.get_financial_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tz        text;
  v_rev       record;
  v_comm      numeric(14,2);
  v_supplies  numeric(14,2);
  v_opex      jsonb;
  v_opex_tot  numeric(14,2);
  v_cash      jsonb;
  v_direct    numeric(14,2);
  v_gross     numeric(14,2);
  v_ebitda    numeric(14,2);
begin
  if not public.is_manager() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_to < p_from then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  select timezone into v_tz from public.business_settings where id = 1;

  select count(*)                           as orders,
         coalesce(sum(total), 0)            as gross,
         coalesce(sum(tax_amount), 0)       as tax,
         coalesce(sum(total - tax_amount), 0) as net,
         coalesce(sum(discount), 0)         as discounts
    into v_rev
  from public.work_orders
  where status = 'delivered'
    and (delivered_at at time zone v_tz)::date between p_from and p_to;

  select coalesce(sum(amount), 0) into v_comm
  from public.commissions
  where status <> 'void' and (created_at at time zone v_tz)::date between p_from and p_to;

  select coalesce(sum(total_cost), 0) into v_supplies
  from public.inventory_transactions
  where tx_type = 'consumption' and (created_at at time zone v_tz)::date between p_from and p_to;

  select coalesce(jsonb_object_agg(category, total), '{}'), coalesce(sum(total), 0)
    into v_opex, v_opex_tot
  from (select category, sum(amount) as total from public.operational_expenses
        where expense_date between p_from and p_to
          and category not in ('washer_commissions', 'supplies')
        group by category) t;

  select coalesce(jsonb_object_agg(method, total), '{}') into v_cash
  from (select method, sum(amount) as total from public.payments
        where (created_at at time zone v_tz)::date between p_from and p_to
        group by method) t;

  v_direct := v_comm + v_supplies;
  v_gross  := v_rev.net - v_direct;
  v_ebitda := v_gross - v_opex_tot;

  return jsonb_build_object(
    'period',             jsonb_build_object('from', p_from, 'to', p_to),
    'orders_count',       v_rev.orders,
    'revenue_gross',      v_rev.gross,
    'tax',                v_rev.tax,
    'revenue_net',        v_rev.net,
    'discounts',          v_rev.discounts,
    'avg_ticket',         case when v_rev.orders > 0 then round(v_rev.gross / v_rev.orders, 2) else 0 end,
    'direct_costs',       jsonb_build_object('commissions', v_comm, 'supplies', v_supplies, 'total', v_direct),
    'gross_profit',       v_gross,
    'gross_margin_pct',   case when v_rev.net > 0 then round(v_gross / v_rev.net * 100, 1) else 0 end,
    'operating_expenses', jsonb_build_object('by_category', v_opex, 'total', v_opex_tot),
    'ebitda',             v_ebitda,
    'ebitda_margin_pct',  case when v_rev.net > 0 then round(v_ebitda / v_rev.net * 100, 1) else 0 end,
    'cash_collected',     v_cash
  );
end $$;

-- ---- Fidelización: ajuste manual de gerencia ------------------------------
create or replace function public.adjust_loyalty(p_customer_id uuid, p_stamps int, p_rewards int default 0, p_reason text default null)
returns public.loyalty_cards
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.loyalty_cards;
begin
  if not public.is_manager() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.loyalty_logs (customer_id, log_type, stamps_delta, rewards_delta, notes)
  values (p_customer_id, 'adjustment', coalesce(p_stamps, 0), coalesce(p_rewards, 0), p_reason);
  select * into v from public.loyalty_cards where customer_id = p_customer_id;
  return v;
end $$;

-- =============================================================================
-- 26. WHATSAPP: RPCs DEL WORKER (solo service_role) Y DE CAJA
-- =============================================================================

-- Reclama un lote con SKIP LOCKED (varios workers en paralelo sin duplicar).
create or replace function public.wa_claim_batch(p_limit int default 20)
returns setof public.whatsapp_logs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r       public.whatsapp_logs;
  v_body  text;
  v_vars  jsonb;
begin
  -- Rescata trabajos colgados (worker caído a mitad de envío)
  update public.whatsapp_logs set status = 'queued', locked_at = null
  where status = 'sending' and locked_at < now() - interval '5 minutes';

  for r in
    select * from public.whatsapp_logs
    where status = 'queued' and next_attempt_at <= now()
    order by next_attempt_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  loop
    if r.body_rendered is null then
      select coalesce(t.body, r.body_template) into v_body
      from (select 1) x left join public.whatsapp_templates t on t.id = r.template_id;

      if v_body is null then
        update public.whatsapp_logs set status = 'failed', last_error = 'Mensaje sin contenido'
        where id = r.id;
        continue;
      end if;

      v_vars := private.wa_build_variables(r) || coalesce(r.variables, '{}');
      update public.whatsapp_logs
         set variables = v_vars, body_rendered = private.wa_render(v_body, v_vars)
       where id = r.id;
    end if;

    update public.whatsapp_logs
       set status = 'sending', locked_at = now(), attempts = attempts + 1
     where id = r.id
    returning * into r;
    return next r;
  end loop;
end $$;

create or replace function public.wa_mark_sent(p_id uuid, p_provider_message_id text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.whatsapp_logs
     set status = 'sent', sent_at = now(), locked_at = null, last_error = null,
         provider_message_id = coalesce(p_provider_message_id, provider_message_id)
   where id = p_id
$$;

-- Exponential backoff: 30s, 1m, 2m, 4m, ... (máx. 1 h) + jitter
create or replace function public.wa_mark_failed(p_id uuid, p_error text, p_retryable boolean default true)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.whatsapp_logs set
    status          = case when not p_retryable or attempts >= max_attempts then 'failed' else 'queued' end::public.wa_status,
    last_error      = left(p_error, 2000),
    locked_at       = null,
    next_attempt_at = now()
                      + least(interval '1 hour', interval '30 seconds' * power(2, greatest(attempts - 1, 0)))
                      + make_interval(secs => floor(random() * 10))
  where id = p_id
$$;

-- Webhook de estado del proveedor (delivered / read / failed)
create or replace function public.wa_update_status(p_provider_message_id text, p_status public.wa_status, p_error text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.whatsapp_logs set
    status       = p_status,
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, now()) else delivered_at end,
    read_at      = case when p_status = 'read' then now() else read_at end,
    last_error   = coalesce(p_error, last_error)
  where provider_message_id = p_provider_message_id
    and status not in ('read')
$$;

-- Recordatorios de citas (lo invoca pg_cron o el worker)
create or replace function public.wa_enqueue_appointment_reminders(p_hours_ahead int default 24)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int := 0;
  v_tpl   public.whatsapp_templates;
  v_prov  public.wa_provider;
begin
  select * into v_tpl from public.whatsapp_templates
  where event = 'appointment_reminder' and is_active and auto_send
  order by updated_at desc limit 1;
  if not found then return 0; end if;
  select wa_provider into v_prov from public.business_settings where id = 1;

  with due as (
    select a.id, a.customer_id, c.phone
    from public.appointments a
    join public.customers c on c.id = a.customer_id
    where a.status in ('scheduled', 'confirmed')
      and a.reminder_queued_at is null
      and a.scheduled_at between now() and now() + make_interval(hours => p_hours_ahead)
      and c.phone is not null and c.whatsapp_opt_in
    for update of a skip locked
  ), ins as (
    insert into public.whatsapp_logs (template_id, event, appointment_id, customer_id, to_phone, provider)
    select v_tpl.id, 'appointment_reminder', id, customer_id, phone, v_prov from due
    on conflict (appointment_id, event) where appointment_id is not null and event <> 'custom' do nothing
    returning appointment_id
  )
  update public.appointments set reminder_queued_at = now()
  where id in (select id from due);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Mensaje manual desde caja/recepción
create or replace function public.wa_send_custom(p_customer_id uuid, p_body text, p_work_order_id uuid default null)
returns public.whatsapp_logs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c    public.customers;
  v_prov public.wa_provider;
  v      public.whatsapp_logs;
begin
  if not public.is_cashier_or_above() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Mensaje vacío' using errcode = '22023';
  end if;
  select * into v_c from public.customers where id = p_customer_id;
  if v_c.phone is null then
    raise exception 'El cliente no tiene teléfono registrado' using errcode = 'P0001';
  end if;
  select wa_provider into v_prov from public.business_settings where id = 1;

  insert into public.whatsapp_logs (event, work_order_id, customer_id, to_phone, provider, body_template)
  values ('custom', p_work_order_id, v_c.id, v_c.phone, v_prov, p_body)
  returning * into v;
  return v;
end $$;

create or replace function public.wa_retry(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_cashier_or_above() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.whatsapp_logs
     set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null, locked_at = null
   where id = p_id and status = 'failed';
  if not found then
    raise exception 'Solo se pueden reintentar mensajes fallidos' using errcode = 'P0001';
  end if;
end $$;

-- =============================================================================
-- 27. PORTAL DEL CLIENTE (anon, sin login)
-- =============================================================================
-- Seguimiento por placa: solo datos operativos, sin información personal.
-- Devuelve public_token para suscribirse al canal Realtime 'order:<token>'.
create or replace function public.portal_track_by_plate(p_plate text)
returns table (
  order_number text, status public.order_status, status_label text, bay_name text,
  received_at timestamptz, eta timestamptz, ready_at timestamptz, public_token text, business_name text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.order_number, o.status, public.order_status_label(o.status), b.name,
         o.received_at, o.sla_due_at, o.ready_at, o.public_token, s.business_name
  from public.vehicles v
  join public.work_orders o on o.vehicle_id = v.id
  left join public.bays b on b.id = o.bay_id
  cross join public.business_settings s
  where length(coalesce(public.normalize_plate(p_plate), '')) >= 5
    and v.plate = public.normalize_plate(p_plate)
    and (o.status not in ('delivered', 'cancelled') or o.delivered_at > now() - interval '12 hours')
  order by o.received_at desc
  limit 1
$$;

create or replace function public.portal_get_ticket(p_token text)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'business', jsonb_build_object('name', s.business_name, 'legal_name', s.legal_name, 'ruc', s.ruc,
                                   'address', s.address, 'phone', s.phone),
    'order', jsonb_build_object(
      'number', o.order_number, 'status', o.status, 'status_label', public.order_status_label(o.status),
      'received_at', o.received_at, 'eta', o.sla_due_at, 'ready_at', o.ready_at,
      'delivered_at', o.delivered_at, 'bay', b.name, 'notes', o.notes),
    'customer', jsonb_build_object('first_name', split_part(c.full_name, ' ', 1)),
    'vehicle',  jsonb_build_object('plate', v.plate,
                                   'label', coalesce(nullif(trim(concat_ws(' ', v.brand, v.model, v.color)), ''), vt.name)),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                       'description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price,
                       'discount', i.discount, 'line_total', i.line_total, 'is_addon', i.is_addon)
                     order by i.is_addon, i.created_at), '[]'::jsonb)
              from public.work_order_items i where i.work_order_id = o.id),
    'totals', jsonb_build_object(
      'currency', s.currency_symbol, 'subtotal', o.subtotal, 'discount', o.discount,
      'tax_name', s.tax_name, 'tax', o.tax_amount, 'prices_include_tax', s.prices_include_tax,
      'total', o.total, 'paid', o.amount_paid, 'balance', o.total - o.amount_paid,
      'payment_status', o.payment_status, 'loyalty_reward', o.is_loyalty_reward),
    'loyalty', jsonb_build_object(
      'enabled', s.loyalty_enabled,
      'stamps', coalesce(lc.stamps_current, 0),
      'required', s.loyalty_stamps_required,
      'rewards_available', coalesce(lc.rewards_available, 0)),
    'nps', jsonb_build_object(
      'can_submit', o.status = 'delivered' and o.nps_submitted_at is null,
      'score', o.nps_score)
  )
  from public.work_orders o
  join public.customers c      on c.id = o.customer_id
  join public.vehicles v       on v.id = o.vehicle_id
  join public.vehicle_types vt on vt.id = v.vehicle_type_id
  left join public.bays b      on b.id = o.bay_id
  left join public.loyalty_cards lc on lc.customer_id = o.customer_id
  cross join public.business_settings s
  where p_token ~ '^[0-9a-f]{32}$' and o.public_token = p_token
$$;

create or replace function public.portal_submit_nps(p_token text, p_score int, p_comment text default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_score is null or p_score not between 0 and 10 then
    raise exception 'Puntaje inválido' using errcode = '22023';
  end if;
  update public.work_orders
     set nps_score = p_score, nps_comment = left(p_comment, 1000), nps_submitted_at = now()
   where p_token ~ '^[0-9a-f]{32}$' and public_token = p_token
     and status = 'delivered' and nps_submitted_at is null;
  return found;
end $$;

-- =============================================================================
-- 28. VISTAS (security_invoker: respetan RLS del usuario que consulta)
-- =============================================================================
create view public.v_kanban_board with (security_invoker = true) as
select
  wo.id, wo.order_number, wo.public_token, wo.status,
  public.order_status_label(wo.status)                                  as status_label,
  wo.status_changed_at, wo.received_at, wo.started_at, wo.sla_due_at, wo.estimated_duration_min,
  v.id as vehicle_id, v.plate,
  nullif(trim(concat_ws(' ', v.brand, v.model, v.color)), '')           as vehicle_label,
  vt.name as vehicle_type, vt.size as vehicle_size,
  c.id as customer_id, c.full_name as customer_name, c.phone as customer_phone,
  b.id as bay_id, b.name as bay_name,
  e.id as employee_id, e.full_name as employee_name,
  (select string_agg(i.description, ' + ' order by i.is_addon, i.created_at)
     from public.work_order_items i where i.work_order_id = wo.id)     as services,
  wo.total, wo.amount_paid, wo.total - wo.amount_paid                   as balance,
  wo.payment_status, wo.is_loyalty_reward,
  (exists (select 1 from public.car_inspection_marks m
           join public.car_inspections ci on ci.id = m.inspection_id
           where ci.work_order_id = wo.id))                             as has_prior_damage,
  floor(extract(epoch from now() - wo.received_at) / 60)::int          as minutes_elapsed,
  floor(extract(epoch from wo.sla_due_at - now()) / 60)::int           as minutes_remaining,
  case
    when wo.status in ('ready', 'delivered', 'cancelled') then 'done'
    when wo.sla_due_at is null                             then 'on_time'
    when now() > wo.sla_due_at                             then 'overdue'
    when now() > wo.sla_due_at - make_interval(secs => greatest(300, wo.estimated_duration_min * 60 * s.sla_warning_pct)::double precision)
                                                           then 'due_soon'
    else 'on_time'
  end                                                                   as sla_state
from public.work_orders wo
join public.vehicles v       on v.id = wo.vehicle_id
join public.vehicle_types vt on vt.id = v.vehicle_type_id
join public.customers c      on c.id = wo.customer_id
left join public.bays b      on b.id = wo.bay_id
left join public.employees e on e.id = wo.assigned_employee_id
cross join public.business_settings s
where wo.status not in ('delivered', 'cancelled')
   or wo.delivered_at > now() - interval '12 hours';

create view public.v_inventory_status with (security_invoker = true) as
select i.id, i.sku, i.name, i.category, i.unit, i.current_stock, i.min_stock, i.reorder_qty,
       i.unit_cost, round(greatest(i.current_stock, 0) * i.unit_cost, 2) as stock_value,
       i.stock_status,
       case when i.stock_status <> 'ok'
            then greatest(i.reorder_qty, i.min_stock * 2 - i.current_stock) else 0 end as suggested_order_qty,
       (select max(t.created_at) from public.inventory_transactions t where t.item_id = i.id) as last_movement_at
from public.inventory_items i
where i.is_active;

create view public.v_daily_sales with (security_invoker = true) as
select (wo.delivered_at at time zone s.timezone)::date as day,
       count(*)                                         as orders,
       sum(wo.total)                                    as revenue_gross,
       sum(wo.total - wo.tax_amount)                    as revenue_net,
       round(avg(wo.total), 2)                          as avg_ticket,
       count(*) filter (where wo.is_loyalty_reward)     as loyalty_rewards,
       round(avg(wo.nps_score), 1)                      as avg_nps
from public.work_orders wo
cross join public.business_settings s
where wo.status = 'delivered'
group by 1;

create view public.v_employee_performance with (security_invoker = true) as
select e.id as employee_id, e.full_name,
       date_trunc('month', c.created_at) as month,
       count(distinct c.work_order_id)   as orders,
       sum(c.base_amount)                as sales_attributed,
       sum(c.amount)                     as commissions,
       sum(c.amount) filter (where c.status = 'pending') as commissions_pending
from public.commissions c
join public.employees e on e.id = c.employee_id
where c.status <> 'void'
group by e.id, e.full_name, date_trunc('month', c.created_at);

-- =============================================================================
-- 29. ROW LEVEL SECURITY
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'business_settings', 'customers', 'profiles', 'vehicle_types', 'vehicles', 'inventory_items',
    'services', 'service_prices', 'service_supplies', 'bays', 'employees', 'appointments',
    'work_orders', 'work_order_items', 'work_order_status_history', 'car_inspections',
    'car_inspection_marks', 'cash_cuts', 'payments', 'operational_expenses', 'commissions',
    'inventory_transactions', 'loyalty_cards', 'loyalty_logs', 'whatsapp_templates',
    'whatsapp_logs', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- Catálogos: lectura staff / autenticados, escritura gerencia -----------
do $$
declare t text;
begin
  foreach t in array array['vehicle_types', 'services', 'service_prices', 'bays'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;

  foreach t in array array['service_supplies', 'employees', 'inventory_items', 'whatsapp_templates'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_staff()))', t || '_read', t);
  end loop;

  foreach t in array array['vehicle_types', 'services', 'service_prices', 'service_supplies', 'bays',
                           'employees', 'inventory_items', 'whatsapp_templates'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_manager()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_manager()))', t || '_delete', t);
  end loop;
end $$;

-- ---- business_settings ----
create policy business_settings_read on public.business_settings
  for select to authenticated using ((select public.is_staff()));
create policy business_settings_update on public.business_settings
  for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

-- ---- profiles ----
create policy profiles_read on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_manager()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_manager()))
  with check (id = (select auth.uid()) or (select public.is_manager()));
create policy profiles_delete on public.profiles
  for delete to authenticated using ((select public.is_superadmin()));

-- ---- customers ----
create policy customers_read on public.customers
  for select to authenticated using ((select public.is_staff()) or id = (select public.current_customer_id()));
create policy customers_insert on public.customers
  for insert to authenticated with check ((select public.is_cashier_or_above()));
create policy customers_update on public.customers
  for update to authenticated
  using ((select public.is_cashier_or_above()) or id = (select public.current_customer_id()))
  with check ((select public.is_cashier_or_above()) or id = (select public.current_customer_id()));
create policy customers_delete on public.customers
  for delete to authenticated using ((select public.is_manager()));

-- ---- vehicles ----
create policy vehicles_read on public.vehicles
  for select to authenticated using ((select public.is_staff()) or customer_id = (select public.current_customer_id()));
create policy vehicles_insert on public.vehicles
  for insert to authenticated with check ((select public.is_cashier_or_above()));
create policy vehicles_update on public.vehicles
  for update to authenticated using ((select public.is_cashier_or_above())) with check ((select public.is_cashier_or_above()));
create policy vehicles_delete on public.vehicles
  for delete to authenticated using ((select public.is_manager()));

-- ---- appointments ----
create policy appointments_read on public.appointments
  for select to authenticated using ((select public.is_staff()) or customer_id = (select public.current_customer_id()));
create policy appointments_insert on public.appointments
  for insert to authenticated with check ((select public.is_cashier_or_above()));
create policy appointments_update on public.appointments
  for update to authenticated using ((select public.is_cashier_or_above())) with check ((select public.is_cashier_or_above()));
create policy appointments_delete on public.appointments
  for delete to authenticated using ((select public.is_manager()));

-- ---- work_orders (operadores cambian estado vía RPC move_work_order) ----
create policy work_orders_read on public.work_orders
  for select to authenticated using ((select public.is_staff()) or customer_id = (select public.current_customer_id()));
create policy work_orders_insert on public.work_orders
  for insert to authenticated with check ((select public.is_cashier_or_above()));
create policy work_orders_update on public.work_orders
  for update to authenticated using ((select public.is_cashier_or_above())) with check ((select public.is_cashier_or_above()));
create policy work_orders_delete on public.work_orders
  for delete to authenticated using ((select public.is_superadmin()));

-- ---- work_order_items ----
create policy woi_read on public.work_order_items
  for select to authenticated using (
    (select public.is_staff())
    or exists (select 1 from public.work_orders o
               where o.id = work_order_id and o.customer_id = (select public.current_customer_id())));
create policy woi_insert on public.work_order_items
  for insert to authenticated with check ((select public.is_cashier_or_above()));
create policy woi_update on public.work_order_items
  for update to authenticated using ((select public.is_cashier_or_above())) with check ((select public.is_cashier_or_above()));
create policy woi_delete on public.work_order_items
  for delete to authenticated using ((select public.is_cashier_or_above()));

-- ---- historial (solo lectura; lo escribe el trigger) ----
create policy wosh_read on public.work_order_status_history
  for select to authenticated using ((select public.is_staff()));

-- ---- inspección ----
create policy inspections_read on public.car_inspections
  for select to authenticated using (
    (select public.is_staff())
    or exists (select 1 from public.work_orders o
               where o.id = work_order_id and o.customer_id = (select public.current_customer_id())));
create policy inspections_insert on public.car_inspections
  for insert to authenticated with check ((select public.is_staff()));
create policy inspections_update on public.car_inspections
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy inspections_delete on public.car_inspections
  for delete to authenticated using ((select public.is_manager()));

create policy inspection_marks_read on public.car_inspection_marks
  for select to authenticated using (
    (select public.is_staff())
    or exists (select 1 from public.car_inspections ci join public.work_orders o on o.id = ci.work_order_id
               where ci.id = inspection_id and o.customer_id = (select public.current_customer_id())));
create policy inspection_marks_insert on public.car_inspection_marks
  for insert to authenticated with check ((select public.is_staff()));
create policy inspection_marks_update on public.car_inspection_marks
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy inspection_marks_delete on public.car_inspection_marks
  for delete to authenticated using ((select public.is_staff()));

-- ---- caja ----
create policy cash_cuts_read on public.cash_cuts
  for select to authenticated using (
    (select public.is_manager())
    or opened_by = (select auth.uid())
    or ((select public.is_cashier_or_above()) and status = 'open'));
create policy cash_cuts_open on public.cash_cuts
  for insert to authenticated with check (
    (select public.is_cashier_or_above()) and opened_by = (select auth.uid()) and status = 'open');
create policy cash_cuts_update on public.cash_cuts
  for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

-- ---- pagos ----
create policy payments_read on public.payments
  for select to authenticated using (
    (select public.is_cashier_or_above())
    or exists (select 1 from public.work_orders o
               where o.id = work_order_id and o.customer_id = (select public.current_customer_id())));
create policy payments_insert on public.payments
  for insert to authenticated with check ((select public.is_cashier_or_above()));
create policy payments_delete on public.payments
  for delete to authenticated using ((select public.is_manager()));

-- ---- gastos: caja registra egresos de caja chica; gerencia todo ----
create policy expenses_read on public.operational_expenses
  for select to authenticated using (
    (select public.is_manager())
    or ((select public.is_cashier_or_above()) and created_by = (select auth.uid())));
create policy expenses_insert on public.operational_expenses
  for insert to authenticated with check (
    (select public.is_manager())
    or ((select public.is_cashier_or_above()) and paid_from_cash
        and category in ('utilities', 'supplies', 'machinery_maintenance', 'misc')));
create policy expenses_update on public.operational_expenses
  for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy expenses_delete on public.operational_expenses
  for delete to authenticated using ((select public.is_manager()));

-- ---- comisiones: gerencia todo; el operador ve las suyas ----
create policy commissions_read on public.commissions
  for select to authenticated using (
    (select public.is_manager()) or employee_id = (select public.current_employee_id()));
create policy commissions_update on public.commissions
  for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

-- ---- Kardex ----
create policy inv_tx_read on public.inventory_transactions
  for select to authenticated using ((select public.is_staff()));
create policy inv_tx_insert on public.inventory_transactions
  for insert to authenticated with check ((select public.is_manager()) and tx_type <> 'consumption');

-- ---- fidelización ----
create policy loyalty_cards_read on public.loyalty_cards
  for select to authenticated using ((select public.is_staff()) or customer_id = (select public.current_customer_id()));
create policy loyalty_logs_read on public.loyalty_logs
  for select to authenticated using ((select public.is_staff()) or customer_id = (select public.current_customer_id()));

-- ---- WhatsApp logs: lectura caja/gerencia; escritura vía RPC ----
create policy wa_logs_read on public.whatsapp_logs
  for select to authenticated using ((select public.is_cashier_or_above()));

-- ---- notificaciones ----
create policy notifications_read on public.notifications
  for select to authenticated using (
    (select public.is_staff())
    and (target_role is null or target_role = (select public.current_user_role()) or (select public.is_manager())));
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using ((select public.is_staff())
         and (target_role is null or target_role = (select public.current_user_role()) or (select public.is_manager())))
  with check ((select public.is_staff()));

-- =============================================================================
-- 30. PRIVILEGIOS DE FUNCIONES
-- =============================================================================
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema public  from public, anon;
grant  execute on all functions in schema public  to authenticated, service_role;

-- Worker de WhatsApp: solo service_role (Edge Function)
revoke execute on function public.wa_claim_batch(int)                                    from authenticated;
revoke execute on function public.wa_mark_sent(uuid, text)                                from authenticated;
revoke execute on function public.wa_mark_failed(uuid, text, boolean)                     from authenticated;
revoke execute on function public.wa_update_status(text, public.wa_status, text)          from authenticated;
revoke execute on function public.wa_enqueue_appointment_reminders(int)                  from authenticated;

-- Portal público
grant execute on function public.portal_track_by_plate(text)          to anon;
grant execute on function public.portal_get_ticket(text)              to anon;
grant execute on function public.portal_submit_nps(text, int, text)   to anon;
grant execute on function public.order_status_label(public.order_status) to anon;

-- =============================================================================
-- 31. STORAGE (comprobantes de gasto y fotos de inspección, privados)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('expense-receipts',  'expense-receipts',  false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('inspection-photos', 'inspection-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "receipts: lectura caja y gerencia" on storage.objects
  for select to authenticated using (bucket_id = 'expense-receipts' and (select public.is_cashier_or_above()));
create policy "receipts: subida caja y gerencia" on storage.objects
  for insert to authenticated with check (bucket_id = 'expense-receipts' and (select public.is_cashier_or_above()));
create policy "receipts: borrado gerencia" on storage.objects
  for delete to authenticated using (bucket_id = 'expense-receipts' and (select public.is_manager()));

create policy "inspection: lectura staff" on storage.objects
  for select to authenticated using (bucket_id = 'inspection-photos' and (select public.is_staff()));
create policy "inspection: subida staff" on storage.objects
  for insert to authenticated with check (bucket_id = 'inspection-photos' and (select public.is_staff()));
create policy "inspection: borrado gerencia" on storage.objects
  for delete to authenticated using (bucket_id = 'inspection-photos' and (select public.is_manager()));

-- =============================================================================
-- 32. REALTIME (postgres_changes respeta RLS → Kanban, stock, alertas)
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.work_orders, public.inventory_items, public.notifications, public.whatsapp_logs, public.cash_cuts;
  end if;
end $$;

-- =============================================================================
-- 33. DATOS INICIALES
-- =============================================================================
insert into public.business_settings (id) values (1);

insert into public.vehicle_types (name, size, price_multiplier, time_multiplier, supply_multiplier, icon, sort_order) values
  ('Moto',              'small',  0.60, 0.60, 0.40, 'bike',  1),
  ('Auto / Sedán',      'medium', 1.00, 1.00, 1.00, 'car',   2),
  ('SUV / Camioneta',   'large',  1.30, 1.25, 1.40, 'suv',   3),
  ('Pickup / Van',      'xl',     1.50, 1.40, 1.70, 'truck', 4);

insert into public.bays (code, name, bay_type, sort_order) values
  ('B1', 'Bahía 1',            'wash',   1),
  ('B2', 'Bahía 2',            'wash',   2),
  ('B3', 'Bahía 3',            'multi',  3),
  ('D1', 'Zona de Detailing',  'detail', 4);

insert into public.services (code, name, description, category, is_addon, base_price, base_duration_min, required_bay, commission_type, commission_value, sort_order) values
  ('LAV-EXP',  'Lavado Express',          'Exterior, aro y secado',                       'Lavado',    false,  25.00,  25, 'wash',   'percentage', 30, 1),
  ('LAV-COM',  'Lavado Completo',         'Exterior + interior, aspirado y silicona',     'Lavado',    false,  40.00,  45, 'wash',   'percentage', 30, 2),
  ('LAV-PRE',  'Lavado Premium + Cera',   'Completo + encerado a mano',                   'Lavado',    false,  70.00,  75, 'wash',   'percentage', 30, 3),
  ('DET-INT',  'Detailing Interior',      'Lavado de tapiz, plásticos y desinfección',    'Detailing', false, 180.00, 180, 'detail', 'percentage', 25, 4),
  ('ADD-OZO',  'Desinfección con ozono',  'Elimina olores y bacterias',                   'Add-on',    true,   30.00,  20, 'wash',   'fixed',       5, 10),
  ('ADD-FAR',  'Pulido de faros',         'Restauración de ópticas',                      'Add-on',    true,   50.00,  30, 'wash',   'fixed',      10, 11),
  ('ADD-MOT',  'Lavado de motor',         'Desengrase y abrillantado',                    'Add-on',    true,   20.00,  15, 'wash',   'fixed',       5, 12);

insert into public.inventory_items (sku, name, category, unit, min_stock, reorder_qty, supplier) values
  ('INS-SHAM', 'Shampoo neutro',         'Químicos',  'ml', 5000, 20000, null),
  ('INS-CERA', 'Cera líquida',           'Químicos',  'ml', 2000, 10000, null),
  ('INS-SILI', 'Silicona para interior', 'Químicos',  'ml', 2000, 10000, null),
  ('INS-DESE', 'Desengrasante',          'Químicos',  'ml', 3000, 10000, null),
  ('INS-APC',  'Limpiador multiuso APC', 'Químicos',  'ml', 3000, 10000, null);

-- Stock inicial vía Kardex (costos referenciales en S/ por unidad de medida)
insert into public.inventory_transactions (item_id, tx_type, quantity, unit_cost, reference, notes)
select id, 'in', q, c, 'INV-INICIAL', 'Inventario inicial'
from public.inventory_items
join (values ('INS-SHAM', 20000, 0.0150), ('INS-CERA', 10000, 0.0450), ('INS-SILI', 10000, 0.0300),
             ('INS-DESE', 10000, 0.0200), ('INS-APC',  10000, 0.0250)) v(sku, q, c) using (sku);

insert into public.service_supplies (service_id, item_id, quantity)
select s.id, i.id, v.q
from (values ('LAV-EXP', 'INS-SHAM', 150), ('LAV-COM', 'INS-SHAM', 200), ('LAV-COM', 'INS-SILI', 50),
             ('LAV-PRE', 'INS-SHAM', 200), ('LAV-PRE', 'INS-SILI', 50), ('LAV-PRE', 'INS-CERA', 80),
             ('DET-INT', 'INS-APC', 400),  ('DET-INT', 'INS-SILI', 100), ('ADD-MOT', 'INS-DESE', 300)) v(svc, sku, q)
join public.services s on s.code = v.svc
join public.inventory_items i on i.sku = v.sku;

insert into public.whatsapp_templates (code, event, name, body, meta_param_order) values
  ('CHECK_IN', 'check_in', 'Confirmación de ingreso',
   'Hola {{nombre}} 👋 Recibimos tu {{vehiculo}} placa {{placa}} en {{negocio}}. Orden {{numero_orden}} · Total {{monto}}. Sigue el avance en tiempo real: {{link_ticket}}',
   array['nombre', 'vehiculo', 'placa', 'negocio', 'numero_orden', 'monto', 'link_ticket']),
  ('READY', 'ready_for_pickup', 'Listo para retiro',
   '¡{{nombre}}, tu {{vehiculo}} ({{placa}}) está listo para recoger! ✨ Saldo pendiente: {{saldo}}. Tu ticket digital: {{link_ticket}}',
   array['nombre', 'vehiculo', 'placa', 'saldo', 'link_ticket']),
  ('REMINDER', 'appointment_reminder', 'Recordatorio de cita',
   'Hola {{nombre}}, te recordamos tu cita en {{negocio}} el {{fecha_cita}} a las {{hora_cita}} para tu {{vehiculo}} ({{placa}}). Si necesitas reprogramar, responde este mensaje.',
   array['nombre', 'negocio', 'fecha_cita', 'hora_cita', 'vehiculo', 'placa']),
  ('NPS', 'nps_survey', 'Encuesta de satisfacción',
   'Gracias por confiar en {{negocio}}, {{nombre}} 🙌 Del 0 al 10, ¿qué tan probable es que nos recomiendes? Califícanos aquí: {{link_encuesta}}',
   array['negocio', 'nombre', 'link_encuesta']);

commit;

-- =============================================================================
-- POST-INSTALACIÓN (ejecutar manualmente)
-- =============================================================================
-- 1) Crear el primer SuperAdmin (después de registrar el usuario en Auth):
--    update public.profiles set role = 'superadmin'
--    where id = (select id from auth.users where email = 'dueño@tucarwash.pe');
--
-- 2) Configurar el negocio:
--    update public.business_settings set business_name = 'Car Wash Piura', ruc = '20XXXXXXXXX',
--      public_portal_url = 'https://carwash.tudominio.pe', wa_provider = 'evolution';
--
-- 3) Worker de WhatsApp cada minuto (requiere pg_cron + pg_net habilitados):
--    select cron.schedule('wa-worker', '* * * * *', $$
--      select net.http_post(
--        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-worker',
--        headers := jsonb_build_object('Authorization', 'Bearer ' || '<SERVICE_ROLE_KEY via Vault>'),
--        body    := '{}'::jsonb)
--      where exists (select 1 from public.whatsapp_logs            -- solo si hay trabajo pendiente:
--                    where (status = 'queued' and next_attempt_at <= now())   -- evita ~1.440 invocaciones
--                       or (status = 'sending' and locked_at < now() - interval '5 minutes'))  -- y logs diarios
--    $$);
--    select cron.schedule('cron-history-cleanup', '30 3 * * *',
--      $$ delete from cron.job_run_details where end_time < now() - interval '3 days' $$);
--    select cron.schedule('wa-reminders', '0 * * * *', $$ select public.wa_enqueue_appointment_reminders(24) $$);
