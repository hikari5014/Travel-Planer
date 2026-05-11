import type { ComponentType, ReactNode } from "react";

export function EmptyState({
  Icon,
  title,
  description,
  action,
  className,
}: {
  Icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center gap-sm rounded-lg border border-dashed border-hairline bg-surface-soft px-md py-xl text-center " +
        (className ?? "")
      }
    >
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-card text-muted">
          <Icon size={22} strokeWidth={1.6} />
        </span>
      )}
      <p className="text-title-sm text-ink">{title}</p>
      {description && <p className="max-w-md text-caption text-muted-soft">{description}</p>}
      {action && <div className="mt-xs">{action}</div>}
    </div>
  );
}
