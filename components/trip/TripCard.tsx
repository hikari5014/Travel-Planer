import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  formatDateRange,
  tripDurationDays,
  type MockTrip,
} from "@/lib/format";
import { placeIconRegistry, type PlaceIconKey } from "@/lib/place-icon";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";

export function TripCard({ trip }: { trip: MockTrip }) {
  const days = tripDurationDays(trip.startDate, trip.endDate);
  const isPast = trip.status === "past";
  const iconKey: PlaceIconKey = (trip.coverIconKey as PlaceIconKey) ?? "landmark";
  const Icon = placeIconRegistry[iconKey].icon;

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group flex flex-col overflow-hidden rounded-lg bg-surface-card transition-all hover:shadow-soft-elevation"
    >
      {/* Cover */}
      <div
        className={`relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br ${trip.coverColor}`}
      >
        {/* Decorative paper texture overlay */}
        <svg className="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 200 100" preserveAspectRatio="none">
          <defs>
            <pattern id={`grid-${trip.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="200" height="100" fill={`url(#grid-${trip.id})`} />
        </svg>
        <Icon size={48} strokeWidth={1.4} className="relative z-10 text-white/95 drop-shadow-sm" />
        {isPast && (
          <span className="absolute right-2 top-2 z-10 rounded-pill bg-canvas/90 px-2 py-0.5 text-[10px] text-muted">
            已完成
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="text-title-md text-ink leading-tight">{trip.title}</h3>
          <p className="mt-0.5 text-caption text-muted">{trip.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded-pill bg-canvas px-2 py-0.5 text-[11px] text-ink">
            {formatDateRange(trip.startDate, trip.endDate)} · {days}天
          </span>
          <span className="rounded-pill bg-canvas px-2 py-0.5 text-[11px] text-ink">
            {trip.planCount} 方案
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-soft">預估總花費</p>
            <PriceWithLocal amount={trip.totalCost} size="xl" align="left" />
          </div>
          <span className="inline-flex items-center gap-0.5 text-caption text-primary transition-transform group-hover:translate-x-0.5">
            繼續編輯 <ArrowRight size={12} strokeWidth={2} />
          </span>
        </div>
      </div>
    </Link>
  );
}
