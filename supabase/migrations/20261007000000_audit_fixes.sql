-- =============================================================================
--  CARWASH OS · Correcciones de auditoría (2026-10-07)
--  Ejecutar DESPUÉS de 20261001000000_carwash_schema.sql (SQL Editor o `supabase db push`).
--  Es idempotente: puede ejecutarse más de una vez sin efectos secundarios.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Una sola orden activa por vehículo.
--    create_work_order lo validaba con un SELECT, pero dos recepciones simultáneas
--    de la misma placa podían crear dos órdenes activas. El índice lo garantiza.
-- -----------------------------------------------------------------------------
create unique index if not exists work_orders_one_active_per_vehicle_uq
  on public.work_orders (vehicle_id)
  where status not in ('delivered', 'cancelled');

-- -----------------------------------------------------------------------------
-- 2) Protección de campos financieros de la orden frente a UPDATE directo desde la API.
--    La política work_orders_update permite a caja actualizar la fila completa: sin esto,
--    un cajero podía marcar una orden como pagada (amount_paid) sin registrar pago, o
--    aplicar descuentos arbitrarios. Los cambios internos (triggers anidados: pagos,
--    recálculo de ítems) tienen pg_trigger_depth() > 1 y no se ven afectados.
-- -----------------------------------------------------------------------------
create or replace function private.work_orders_client_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;  -- service_role / SQL Editor / triggers internos
  end if;

  if new.amount_paid is distinct from old.amount_paid then
    raise exception 'El monto pagado solo cambia registrando pagos o devoluciones' using errcode = '42501';
  end if;
  if new.subtotal is distinct from old.subtotal then
    raise exception 'El subtotal se calcula a partir de los servicios de la orden' using errcode = '42501';
  end if;
  if new.discount is distinct from old.discount and not public.is_manager() then
    raise exception 'Solo gerencia puede aplicar descuentos' using errcode = '42501';
  end if;
  if (new.order_number, new.public_token, new.customer_id, new.vehicle_id)
     is distinct from (old.order_number, old.public_token, old.customer_id, old.vehicle_id) then
    raise exception 'Número, token, cliente y vehículo de la orden no se pueden modificar' using errcode = '42501';
  end if;
  return new;
end $$;

-- Los BEFORE triggers se ejecutan en orden alfabético: "00" garantiza que corra primero.
drop trigger if exists work_orders_00_client_guard on public.work_orders;
create trigger work_orders_00_client_guard before update on public.work_orders
  for each row execute function private.work_orders_client_guard();

-- -----------------------------------------------------------------------------
-- 3) Autoría no falsificable en pagos y gastos.
--    received_by / created_by usaban coalesce(valor_enviado, auth.uid()): el cliente
--    podía atribuir un cobro o un egreso a otra persona (y a otra caja abierta).
-- -----------------------------------------------------------------------------
create or replace function private.stamp_author()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then
    if tg_table_name = 'payments' then
      new.received_by := auth.uid();
    else
      new.created_by := auth.uid();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists payments_00_stamp_author on public.payments;
create trigger payments_00_stamp_author before insert on public.payments
  for each row execute function private.stamp_author();

drop trigger if exists expenses_00_stamp_author on public.operational_expenses;
create trigger expenses_00_stamp_author before insert on public.operational_expenses
  for each row execute function private.stamp_author();

-- -----------------------------------------------------------------------------
-- 4) Caja: el cajero no veía los egresos de caja chica registrados por otra persona
--    en SU caja abierta, por lo que el "efectivo esperado" en pantalla no coincidía
--    con el arqueo (que sí los descuenta).
-- -----------------------------------------------------------------------------
drop policy if exists expenses_read on public.operational_expenses;
create policy expenses_read on public.operational_expenses
  for select to authenticated using (
    (select public.is_manager())
    or ((select public.is_cashier_or_above()) and created_by = (select auth.uid()))
    or ((select public.is_cashier_or_above()) and paid_from_cash and cash_cut_id is not null
        and exists (select 1 from public.cash_cuts cc where cc.id = cash_cut_id and cc.status = 'open')));

-- -----------------------------------------------------------------------------
-- 5) Notificaciones: el personal solo puede marcarlas como leídas, no reescribir
--    su título, cuerpo o destinatario.
-- -----------------------------------------------------------------------------
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- 6) WhatsApp: los webhooks pueden llegar desordenados ("sent" después de "delivered").
--    El estado ahora solo avanza: queued → sending → sent → delivered → read.
--    "failed" no pisa un mensaje ya entregado o leído.
-- -----------------------------------------------------------------------------
create or replace function public.wa_update_status(p_provider_message_id text, p_status public.wa_status, p_error text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.whatsapp_logs l set
    status       = p_status,
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(l.delivered_at, now()) else l.delivered_at end,
    read_at      = case when p_status = 'read' then coalesce(l.read_at, now()) else l.read_at end,
    last_error   = coalesce(p_error, l.last_error)
  where l.provider_message_id = p_provider_message_id
    and l.status not in ('cancelled')
    and case
          when p_status = 'failed' then l.status not in ('delivered', 'read')
          else array_position(array['queued', 'sending', 'sent', 'delivered', 'read']::public.wa_status[], p_status)
               > coalesce(array_position(array['queued', 'sending', 'sent', 'delivered', 'read']::public.wa_status[], l.status), 0)
        end
$$;

-- -----------------------------------------------------------------------------
-- 7) Asignación: era imposible QUITAR la bahía o el responsable de una orden
--    (coalesce(null, valor_actual) conservaba siempre el valor). Se añaden banderas
--    explícitas para limpiar.
-- -----------------------------------------------------------------------------
drop function if exists public.assign_work_order(uuid, uuid, uuid);
create or replace function public.assign_work_order(
  p_order_id uuid,
  p_bay_id uuid default null,
  p_employee_id uuid default null,
  p_clear_bay boolean default false,
  p_clear_employee boolean default false)
returns public.work_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.work_orders;
begin
  if not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.work_orders set
    bay_id               = case when p_clear_bay then null else coalesce(p_bay_id, bay_id) end,
    assigned_employee_id = case when p_clear_employee then null else coalesce(p_employee_id, assigned_employee_id) end
  where id = p_order_id and status not in ('delivered', 'cancelled')
  returning * into v;
  if not found then raise exception 'Orden no encontrada o cerrada' using errcode = 'P0001'; end if;
  return v;
end $$;
revoke execute on function public.assign_work_order(uuid, uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.assign_work_order(uuid, uuid, uuid, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 8) Anulación: el motivo quedaba solo en el historial; ahora también en la orden
--    (cancel_reason), que es donde lo leen reportes y el detalle.
-- -----------------------------------------------------------------------------
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
  if p_status = 'cancelled' and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Indique el motivo de la anulación' using errcode = '22023';
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.work_orders set
    status        = p_status,
    cancel_reason = case when p_status = 'cancelled' then trim(p_note) else cancel_reason end
  where id = p_order_id
  returning * into v;
  perform set_config('app.status_note', '', true);

  if not found then raise exception 'Orden no encontrada' using errcode = 'P0001'; end if;
  return v;
end $$;

revoke execute on function public.wa_update_status(text, public.wa_status, text) from public, anon, authenticated;
revoke execute on function private.work_orders_client_guard() from public, anon, authenticated;
revoke execute on function private.stamp_author() from public, anon, authenticated;

commit;
