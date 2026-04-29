"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CurrencyCode, CurrencyRates } from "@/lib/currency";

// Live currency state for the editor session. Replaces module-level mockRates
// so that switching base/local in the popover or refreshing the FX feed
// instantly re-renders every PriceWithLocal in the tree.
//
// PriceWithLocal still works without a provider (falls back to mockRates) —
// pages outside the editor (settings, dashboard) don't need to opt in.

export type CurrencyContextValue = {
  primary: CurrencyCode;
  local: CurrencyCode;
  rates: CurrencyRates;
  fetchedAt: string | null;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  value,
  children,
}: {
  value: CurrencyContextValue;
  children: ReactNode;
}) {
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

// Returns the active currency context, or `null` if no provider is mounted
// (callers should fall back to module-level defaults in that case).
export function useCurrencyContext(): CurrencyContextValue | null {
  return useContext(CurrencyContext);
}
