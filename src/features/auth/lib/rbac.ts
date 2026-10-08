import type { UserRole } from "@/shared/types/domain";

export const STAFF_ROLES: readonly UserRole[] = ["superadmin", "admin", "cashier", "operator"];
export const CASHIER_UP: readonly UserRole[] = ["superadmin", "admin", "cashier"];
export const MANAGERS: readonly UserRole[] = ["superadmin", "admin"];

export const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: "SuperAdmin",
  admin: "Gerente",
  cashier: "Caja / Recepción",
  operator: "Operador",
  customer: "Cliente",
};

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  roles: readonly UserRole[];
  /** aparece en la barra inferior del móvil */
  mobile?: boolean;
}

export type NavIcon =
  | "board"
  | "checkin"
  | "car"
  | "cash"
  | "expenses"
  | "inventory"
  | "customers"
  | "calendar"
  | "whatsapp"
  | "reports"
  | "settings";

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/tablero", label: "Tablero", icon: "board", roles: STAFF_ROLES, mobile: true },
  { href: "/recepcion", label: "Recepción", icon: "checkin", roles: CASHIER_UP, mobile: true },
  { href: "/mis-autos", label: "Mis autos", icon: "car", roles: ["operator", "admin", "superadmin"], mobile: true },
  { href: "/caja", label: "Caja", icon: "cash", roles: CASHIER_UP, mobile: true },
  { href: "/citas", label: "Citas", icon: "calendar", roles: CASHIER_UP },
  { href: "/clientes", label: "Clientes", icon: "customers", roles: CASHIER_UP },
  { href: "/gastos", label: "Gastos", icon: "expenses", roles: CASHIER_UP },
  { href: "/inventario", label: "Inventario", icon: "inventory", roles: STAFF_ROLES },
  { href: "/whatsapp", label: "WhatsApp", icon: "whatsapp", roles: CASHIER_UP },
  { href: "/reportes", label: "Reportes", icon: "reports", roles: MANAGERS, mobile: true },
  { href: "/ajustes", label: "Ajustes", icon: "settings", roles: MANAGERS },
];

/** Prefijos de ruta protegidos y los roles que pueden entrar (usado por el middleware). */
export const ROUTE_ROLES: readonly { prefix: string; roles: readonly UserRole[] }[] = NAV_ITEMS.map((i) => ({
  prefix: i.href,
  roles: i.roles,
}));

export function canAccess(role: UserRole | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const rule = ROUTE_ROLES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return rule ? rule.roles.includes(role) : true;
}

export function homeFor(role: UserRole): string {
  switch (role) {
    case "operator":
      return "/mis-autos";
    case "cashier":
      return "/recepcion";
    case "customer":
      return "/mi-cuenta";
    default:
      return "/tablero";
  }
}

export const isManager = (role: UserRole | null | undefined): boolean => !!role && MANAGERS.includes(role);
export const isCashierUp = (role: UserRole | null | undefined): boolean => !!role && CASHIER_UP.includes(role);
export const isStaff = (role: UserRole | null | undefined): boolean => !!role && STAFF_ROLES.includes(role);
