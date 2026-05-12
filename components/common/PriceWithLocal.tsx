"use client";

import {
  defaultCurrencySettings,
  formatCurrency,
  mockRates,
  money,
  toCurrency,
  type CurrencyCode,
  type Money,
} from "@/lib/currency";
import { useCurrencyContext } from "@/lib/currency-context";

// Renders an amount in the user's primary currency, with the local-currency
// equivalent in small gray text directly underneath.
//
// Phase B3 — accepts either:
//   value: Money    (preferred — currency tagged at the type level)
//   amount + currency? (legacy — to be removed in B4)
//
// Reads live rates from CurrencyContext when present (editor session); falls
// back to mockRates when used outside a provider (PDF preview demo, etc).
export function PriceWithLocal({
  value,
  amount,
  currency,
  primary,
  local,
  align = "left",
  size = "md",
  hideLocalIfSame = true,
  inline = false,
  className = "",
}: {
  // Preferred — pass a Money value built via money(amount, currency).
  value?: Money;
  /** @deprecated pass `value={money(amount, currency)}` instead. */
  amount?: number;
  /** @deprecated pass `value={money(amount, currency)}` instead. */
  currency?: CurrencyCode;
  primary?: CurrencyCode;
  local?: CurrencyCode;
  align?: "left" | "right";
  size?: "sm" | "md" | "lg" | "xl";
  hideLocalIfSame?: boolean;
  inline?: boolean;
  className?: string;
}) {
  const ctx = useCurrencyContext();
  const effectivePrimary = primary ?? ctx?.primary ?? defaultCurrencySettings.primary;
  const effectiveLocal = local ?? ctx?.local ?? defaultCurrencySettings.local;
  const effectiveRates = ctx?.rates ?? mockRates;

  // Normalise inputs to a single Money source-of-truth. value wins if both
  // are supplied (allows incremental migration without breaking callers).
  const src: Money =
    value ?? money(amount ?? 0, currency ?? effectivePrimary);

  const primaryMoney = toCurrency(src, effectivePrimary, effectiveRates);
  const showLocal = !(hideLocalIfSame && effectivePrimary === effectiveLocal);
  const localMoney = showLocal
    ? toCurrency(primaryMoney, effectiveLocal, effectiveRates)
    : null;

  const sizeClass = {
    sm: "text-caption",
    md: "text-body-sm",
    lg: "text-title-md",
    xl: "font-display text-[28px] leading-none tracking-tight",
  }[size];

  if (inline) {
    return (
      <span className={`inline-flex items-baseline gap-1 ${className}`}>
        <span className={`${sizeClass} text-ink`}>
          {formatCurrency(primaryMoney.amount, effectivePrimary, { compact: size === "xl" })}
        </span>
        {showLocal && localMoney && (
          <span className="text-caption text-muted-soft">
            ≈ {formatCurrency(localMoney.amount, effectiveLocal)}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={`flex flex-col ${align === "right" ? "items-end" : "items-start"} ${className}`}>
      <span className={`${sizeClass} text-ink`}>
        {formatCurrency(primaryMoney.amount, effectivePrimary, { compact: size === "xl" || size === "lg" })}
      </span>
      {showLocal && localMoney && (
        <span className="text-caption text-muted-soft leading-tight mt-px">
          {formatCurrency(localMoney.amount, effectiveLocal)}
        </span>
      )}
    </div>
  );
}
