"use client";

import { convert, defaultCurrencySettings, formatCurrency, mockRates, type CurrencyCode } from "@/lib/currency";
import { useCurrencyContext } from "@/lib/currency-context";

// Renders an amount in the user's primary currency, with the local-currency
// equivalent in small gray text directly underneath.
//
// Reads live rates from CurrencyContext when present (editor session); falls
// back to mockRates when used outside a provider (PDF preview demo, etc).
export function PriceWithLocal({
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
  amount: number;
  // Currency of `amount`. Defaults to the user's primary (e.g. TWD).
  // Pass this when `amount` is in a foreign currency (e.g. taxi fare in JPY).
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
  const sourceCurrency = currency ?? effectivePrimary;
  // Normalise amount → user's primary currency before display and local conversion.
  const primaryAmount =
    sourceCurrency === effectivePrimary
      ? amount
      : convert(amount, effectivePrimary, effectiveRates, sourceCurrency);
  const showLocal = !(hideLocalIfSame && effectivePrimary === effectiveLocal);
  const localAmount = showLocal
    ? convert(primaryAmount, effectiveLocal, effectiveRates, effectivePrimary)
    : 0;
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
          {formatCurrency(primaryAmount, effectivePrimary, { compact: size === "xl" })}
        </span>
        {showLocal && (
          <span className="text-caption text-muted-soft">
            ≈ {formatCurrency(localAmount, effectiveLocal)}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={`flex flex-col ${align === "right" ? "items-end" : "items-start"} ${className}`}>
      <span className={`${sizeClass} text-ink`}>
        {formatCurrency(primaryAmount, effectivePrimary, { compact: size === "xl" || size === "lg" })}
      </span>
      {showLocal && (
        <span className="text-caption text-muted-soft leading-tight mt-px">
          {formatCurrency(localAmount, effectiveLocal)}
        </span>
      )}
    </div>
  );
}
