/**
 * Tipos de dominio que espejan el esquema SQL (carwash_schema.sql).
 * Si cambias el esquema, actualiza este archivo o genera tipos con:
 *   npx supabase gen types typescript --project-id <ref> > src/shared/types/database.types.ts
 */

// ---------------------------------------------------------------- ENUMS
export const USER_ROLES = ["superadmin", "admin", "cashier", "operator", "customer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORDER_FLOW = ["received", "washing", "drying_detailing", "quality_check", "ready", "delivered"] as const;
export type OrderStatus = (typeof ORDER_FLOW)[number] | "cancelled";

export const PAYMENT_METHODS = ["cash", "card", "yape", "plin", "transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentStatus = "pending" | "partial" | "paid";

export const EXPENSE_CATEGORIES = [
  "utilities",
  "payroll",
  "washer_commissions",
  "supplies",
  "machinery_maintenance",
  "misc",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type VehicleSize = "small" | "medium" | "large" | "xl";
export type CommissionType = "percentage" | "fixed";
export type BayType = "wash" | "detail" | "multi";
export type InventoryTxType = "in" | "out" | "consumption" | "adjustment";
export const DAMAGE_TYPES = ["scratch", "dent", "crack", "chip", "stain", "missing_part", "other"] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
export const VEHICLE_VIEWS = ["top", "left", "right", "front", "rear"] as const;
export type VehicleView = (typeof VEHICLE_VIEWS)[number];
export type WaStatus = "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "cancelled";
export type WaEvent = "check_in" | "ready_for_pickup" | "appointment_reminder" | "nps_survey" | "custom";
export type WaProvider = "meta" | "twilio" | "evolution" | "baileys" | "wwebjs";
export type AppointmentStatus = "scheduled" | "confirmed" | "checked_in" | "no_show" | "cancelled";
export type SlaState = "on_time" | "due_soon" | "overdue" | "done";
export type StockStatus = "ok" | "critical" | "out";

// ---------------------------------------------------------------- TABLAS
export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  customer_id: string | null;
  is_active: boolean;
}

export interface BusinessSettings {
  id: 1;
  business_name: string;
  legal_name: string | null;
  ruc: string | null;
  address: string | null;
  phone: string | null;
  currency: string;
  currency_symbol: string;
  tax_name: string;
  tax_rate: number;
  prices_include_tax: boolean;
  timezone: string;
  loyalty_enabled: boolean;
  loyalty_stamps_required: number;
  sla_warning_pct: number;
  wa_provider: WaProvider;
  wa_country_code: string;
  nps_delay_minutes: number;
  public_portal_url: string;
}

export interface Customer {
  id: string;
  document_type: "DNI" | "RUC" | "CE" | "PASAPORTE" | null;
  document_number: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  whatsapp_opt_in: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface VehicleType {
  id: string;
  name: string;
  size: VehicleSize;
  price_multiplier: number;
  time_multiplier: number;
  supply_multiplier: number;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  vehicle_type_id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  is_active: boolean;
}

export interface Service {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  is_addon: boolean;
  base_price: number;
  base_duration_min: number;
  required_bay: BayType;
  commission_type: CommissionType;
  commission_value: number;
  sort_order: number;
  is_active: boolean;
}

export interface ServicePrice {
  service_id: string;
  vehicle_size: VehicleSize;
  price: number;
  duration_min: number | null;
}

export interface Bay {
  id: string;
  code: string;
  name: string;
  bay_type: BayType;
  is_active: boolean;
  sort_order: number;
}

export interface Employee {
  id: string;
  profile_id: string | null;
  full_name: string;
  document_number: string | null;
  phone: string | null;
  position: string;
  commission_type: CommissionType | null;
  commission_value: number | null;
  base_salary: number | null;
  hire_date: string | null;
  is_active: boolean;
}

export interface WorkOrder {
  id: string;
  order_number: string;
  public_token: string;
  customer_id: string;
  vehicle_id: string;
  bay_id: string | null;
  assigned_employee_id: string | null;
  status: OrderStatus;
  status_changed_at: string;
  received_at: string;
  started_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  sla_due_at: string | null;
  estimated_duration_min: number;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  is_loyalty_reward: boolean;
  nps_score: number | null;
  notes: string | null;
}

export interface WorkOrderItem {
  id: string;
  work_order_id: string;
  service_id: string;
  description: string;
  is_addon: boolean;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  duration_min: number;
}

export interface KanbanCard {
  id: string;
  order_number: string;
  public_token: string;
  status: OrderStatus;
  status_label: string;
  status_changed_at: string;
  received_at: string;
  started_at: string | null;
  sla_due_at: string | null;
  estimated_duration_min: number;
  vehicle_id: string;
  plate: string;
  vehicle_label: string | null;
  vehicle_type: string;
  vehicle_size: VehicleSize;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  bay_id: string | null;
  bay_name: string | null;
  employee_id: string | null;
  employee_name: string | null;
  services: string | null;
  total: number;
  amount_paid: number;
  balance: number;
  payment_status: PaymentStatus;
  is_loyalty_reward: boolean;
  has_prior_damage: boolean;
  minutes_elapsed: number;
  minutes_remaining: number | null;
  sla_state: SlaState;
}

export interface CashCut {
  id: string;
  register_name: string;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  totals_by_method: Partial<Record<PaymentMethod, number>> | null;
  cash_expenses: number | null;
  orders_count: number | null;
  status: "open" | "closed";
  notes: string | null;
}

export interface Payment {
  id: string;
  work_order_id: string;
  cash_cut_id: string | null;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  created_at: string;
}

export interface OperationalExpense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: PaymentMethod;
  paid_from_cash: boolean;
  supplier: string | null;
  document_type: "boleta" | "factura" | "recibo" | "ticket" | "ninguno" | null;
  document_number: string | null;
  receipt_path: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: "ml" | "l" | "g" | "kg" | "gal" | "unit";
  current_stock: number;
  min_stock: number;
  reorder_qty: number;
  unit_cost: number;
  stock_status: StockStatus;
  supplier: string | null;
  is_active: boolean;
}

export interface InventoryStatusRow {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: InventoryItem["unit"];
  current_stock: number;
  min_stock: number;
  reorder_qty: number;
  unit_cost: number;
  stock_value: number;
  stock_status: StockStatus;
  suggested_order_qty: number;
  last_movement_at: string | null;
}

export interface InventoryTransaction {
  id: number;
  item_id: string;
  tx_type: InventoryTxType;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  balance_after: number | null;
  work_order_id: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface LoyaltyCard {
  id: string;
  customer_id: string;
  stamps_current: number;
  stamps_total: number;
  rewards_available: number;
  rewards_redeemed: number;
}

export interface LoyaltyLog {
  id: number;
  log_type: "stamp_earned" | "reward_redeemed" | "reward_refunded" | "adjustment";
  stamps_delta: number;
  rewards_delta: number;
  stamps_after: number | null;
  rewards_after: number | null;
  notes: string | null;
  created_at: string;
}

export interface WhatsappTemplate {
  id: string;
  code: string;
  event: WaEvent;
  name: string;
  body: string;
  language: string;
  meta_template_name: string | null;
  meta_param_order: string[];
  is_active: boolean;
  auto_send: boolean;
}

export interface WhatsappLog {
  id: string;
  event: WaEvent;
  to_phone: string;
  provider: WaProvider;
  body_rendered: string | null;
  body_template: string | null;
  status: WaStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  work_order_id: string | null;
  customer_id: string | null;
}

export interface Appointment {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  scheduled_at: string;
  duration_min: number;
  service_ids: string[];
  status: AppointmentStatus;
  notes: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity: string | null;
  entity_id: string | null;
  target_role: UserRole | null;
  read_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------- RPCs
export interface VehicleSearchResult {
  vehicle_id: string;
  plate: string;
  vehicle_label: string | null;
  vehicle_type_id: string;
  vehicle_type: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  stamps_current: number;
  rewards_available: number;
  last_visit: string | null;
  open_order_number: string | null;
}

export interface InspectionMarkInput {
  view: VehicleView;
  x: number;
  y: number;
  zone?: string;
  damage_type: DamageType;
  severity: 1 | 2 | 3;
  notes?: string;
}

export interface CreateWorkOrderPayload {
  customer: {
    id?: string;
    full_name?: string;
    phone?: string;
    document_type?: string;
    document_number?: string;
    email?: string;
    whatsapp_opt_in?: boolean;
  };
  vehicle: {
    id?: string;
    plate?: string;
    vehicle_type_id?: string;
    brand?: string;
    model?: string;
    color?: string;
  };
  services: { service_id: string; quantity?: number; employee_id?: string }[];
  bay_id?: string;
  assigned_employee_id?: string;
  appointment_id?: string;
  notes?: string;
  mileage?: number;
  fuel_level?: number;
  use_loyalty_reward?: boolean;
  inspection?: { general_notes?: string; photo_paths?: string[]; marks: InspectionMarkInput[] };
}

export interface FinancialSummary {
  period: { from: string; to: string };
  orders_count: number;
  revenue_gross: number;
  tax: number;
  revenue_net: number;
  discounts: number;
  avg_ticket: number;
  direct_costs: { commissions: number; supplies: number; total: number };
  gross_profit: number;
  gross_margin_pct: number;
  operating_expenses: { by_category: Partial<Record<ExpenseCategory, number>>; total: number };
  ebitda: number;
  ebitda_margin_pct: number;
  cash_collected: Partial<Record<PaymentMethod, number>>;
}

export interface DailySalesRow {
  day: string;
  orders: number;
  revenue_gross: number;
  revenue_net: number;
  avg_ticket: number;
  loyalty_rewards: number;
  avg_nps: number | null;
}

export interface EmployeePerformanceRow {
  employee_id: string;
  full_name: string;
  month: string;
  orders: number;
  sales_attributed: number;
  commissions: number;
  commissions_pending: number;
}

export interface PlateTrackingResult {
  order_number: string;
  status: OrderStatus;
  status_label: string;
  bay_name: string | null;
  received_at: string;
  eta: string | null;
  ready_at: string | null;
  public_token: string;
  business_name: string;
}

export interface PublicTicket {
  business: { name: string; legal_name: string | null; ruc: string | null; address: string | null; phone: string | null };
  order: {
    number: string;
    status: OrderStatus;
    status_label: string;
    received_at: string;
    eta: string | null;
    ready_at: string | null;
    delivered_at: string | null;
    bay: string | null;
    notes: string | null;
  };
  customer: { first_name: string };
  vehicle: { plate: string; label: string };
  items: { description: string; quantity: number; unit_price: number; discount: number; line_total: number; is_addon: boolean }[];
  totals: {
    currency: string;
    subtotal: number;
    discount: number;
    tax_name: string;
    tax: number;
    prices_include_tax: boolean;
    total: number;
    paid: number;
    balance: number;
    payment_status: PaymentStatus;
    loyalty_reward: boolean;
  };
  loyalty: { enabled: boolean; stamps: number; required: number; rewards_available: number };
  nps: { can_submit: boolean; score: number | null };
}
