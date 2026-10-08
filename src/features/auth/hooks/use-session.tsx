"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Profile } from "@/shared/types/domain";
import { isCashierUp, isManager } from "@/features/auth/lib/rbac";

interface SessionValue {
  profile: Profile;
  isManager: boolean;
  isCashierUp: boolean;
  isOperator: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ profile, children }: { profile: Profile; children: ReactNode }) {
  const value: SessionValue = {
    profile,
    isManager: isManager(profile.role),
    isCashierUp: isCashierUp(profile.role),
    isOperator: profile.role === "operator",
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
