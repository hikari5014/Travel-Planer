import { convert, defaultCurrencySettings, formatCurrency, mockRates, type CurrencyCode } from "@/lib/currency";

// Renders an amount in the user's primary currency, with the local-currency
// equivalent in small gray text directly underneath.
//
// For Phase 0a we use mockRates + default settings (TWD primary, JPY local).
// In Phase 2 these will come from a global Settings store + live API rates.
export function PriceWithLocal({
  amount,
  primary = defaultCurrencySettings.primary,
  local = defaultCurrencySettings.local,
  align = "left",
  size = "md",
  hideLocalIfSame = true,
  inline = false,
  className = "",
}: {
  amount: number;
  primary?: CurrencyCode;
  local?: CurrencyCode;
  align?: "left" | "right";
  size?: "sm" | "md" | "lg" | "xl";
  hideLocalIfSame?: boolean;
  inline?: boolean;
  className?: string;
}) {
  const showLocal = !(hideLocalIfSame && primary === local);
  const localAmount = showLocal ? convert(amount, local, mockRates, primary) : 0;
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
          {formatCurrency(amount, primary, { compact: size === "xl" })}
        </span>
        {showLocal && (
          <span className="text-caption text-muted-soft">
            ≈ {formatCurrency(localAmount, local)}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={`flex flex-col ${align === "right" ? "items-end" : "items-start"} ${className}`}>
      <span className={`${sizeClass} text-ink`}>
        {formatCurrency(amount, primary, { compact: size === "xl" || size === "lg" })}
      </span>
      {showLocal && (
        <span className="text-caption text-muted-soft leading-tight mt-px">
          {formatCurrency(localAmount, local)}
        </span>
      )}
    </div>
  );
}
