/** Fábrica centralizada de query keys (invalidaciones predecibles por feature). */
export const qk = {
  me: ["me"] as const,
  settings: ["settings"] as const,
  catalog: {
    services: ["catalog", "services"] as const,
    vehicleTypes: ["catalog", "vehicle-types"] as const,
    bays: ["catalog", "bays"] as const,
    employees: ["catalog", "employees"] as const,
  },
  board: ["board"] as const,
  vehicleSearch: (q: string) => ["vehicle-search", q] as const,
  cash: {
    open: ["cash", "open"] as const,
    history: ["cash", "history"] as const,
    payments: (orderId: string) => ["cash", "payments", orderId] as const,
  },
  expenses: (from: string, to: string) => ["expenses", from, to] as const,
  inventory: {
    status: ["inventory", "status"] as const,
    kardex: (id: string) => ["inventory", "kardex", id] as const,
    item: (id: string) => ["inventory", "item", id] as const,
  },
  customers: {
    list: (q: string) => ["customers", "list", q] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
  },
  appointments: (from: string) => ["appointments", from] as const,
  whatsapp: {
    templates: ["whatsapp", "templates"] as const,
    outbox: (status: string) => ["whatsapp", "outbox", status] as const,
  },
  reports: {
    summary: (from: string, to: string) => ["reports", "summary", from, to] as const,
    daily: (from: string, to: string) => ["reports", "daily", from, to] as const,
    employees: ["reports", "employees"] as const,
  },
  notifications: ["notifications"] as const,
  staff: ["staff"] as const,
};
