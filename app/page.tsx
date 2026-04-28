import Link from "next/link";
import { FileText, Layers as LayersIcon, Upload, Plus, ArrowRight } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { TripCard } from "@/components/trip/TripCard";
import { mockTrips, formatTwd } from "@/lib/mock-trips";
import { placeIconRegistry } from "@/lib/place-icon";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";

export default function HomePage() {
  const activeTrips = mockTrips.filter((t) => t.status === "active");
  const pastTrips = mockTrips.filter((t) => t.status === "past");
  const lastEdited = activeTrips[0];

  const totalTrips = mockTrips.length;
  const totalPlans = mockTrips.reduce((sum, t) => sum + t.planCount, 0);
  const totalCost = mockTrips.reduce((sum, t) => sum + t.totalCost, 0);

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />

      <main className="mx-auto w-full max-w-content flex-1 px-lg py-xl">
        {/* Workspace title row */}
        <div className="flex items-end justify-between gap-md">
          <div>
            <p className="text-caption-uppercase text-muted-soft">WORKSPACE</p>
            <h1 className="mt-xxs text-title-lg text-ink">我的旅程</h1>
          </div>
          <Link
            href="/trips/new"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-button text-on-primary transition-colors hover:bg-primary-active"
          >
            <Plus size={14} strokeWidth={2.2} />
            新增旅程
          </Link>
        </div>

        {/* Stat strip */}
        <div className="mt-lg grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-4">
          <Stat label="旅程總數" value={String(totalTrips)} />
          <Stat label="進行中" value={String(activeTrips.length)} />
          <Stat label="累計方案" value={String(totalPlans)} />
          <StatPrice label="累計花費試算" amount={totalCost} />
        </div>

        {/* Continue last edited */}
        {lastEdited && (
          <section className="mt-xl">
            <div className="mb-sm flex items-center justify-between">
              <h2 className="text-title-sm text-ink">繼續上次編輯</h2>
              <span className="text-caption text-muted-soft">5 分鐘前</span>
            </div>
            <ContinueCard trip={lastEdited} />
            </section>
        )}

        {/* Quick actions */}
        <section className="mt-xl">
          <h2 className="mb-sm text-title-sm text-ink">快速開始</h2>
          <div className="grid gap-sm md:grid-cols-3">
            <QuickAction
              title="從空白開始"
              desc="自己決定每一步"
              Icon={FileText}
              href="/trips/new"
            />
            <QuickAction
              title="從範本複製"
              desc="關西七日 / 沖繩四日 / …"
              Icon={LayersIcon}
              href="#"
            />
            <QuickAction
              title="匯入 JSON"
              desc="還原備份的旅程"
              Icon={Upload}
              href="/settings#import"
            />
          </div>
        </section>

        {/* Trips list */}
        <section className="mt-xl">
          <div className="mb-md flex items-center justify-between gap-md">
            <h2 className="text-title-sm text-ink">所有旅程</h2>
            <div className="flex items-center gap-xs">
              <SearchInput />
              <button className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-caption text-ink hover:border-ink">
                依日期 ▾
              </button>
            </div>
          </div>

          {/* Active group */}
          <div className="mb-sm flex items-center gap-xs">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-caption text-muted">進行中 · {activeTrips.length}</span>
          </div>
          <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
            <NewTripTile />
            {activeTrips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>

          {/* Past group */}
          <div className="mb-sm mt-xl flex items-center gap-xs">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-soft" />
            <span className="text-caption text-muted">已完成 · {pastTrips.length}</span>
          </div>
          <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
            {pastTrips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        </section>

        {/* Footer status bar */}
        <div className="mt-xxl flex items-center justify-between border-t border-hairline-soft pt-md text-caption text-muted-soft">
          <span>本地端 · SQLite · v0.1</span>
          <span>所有資料只存在你的電腦上</span>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-canvas p-md">
      <p className="text-caption text-muted">{label}</p>
      <p className="mt-xxs text-title-md text-ink">{value}</p>
    </div>
  );
}

function StatPrice({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="bg-canvas p-md">
      <p className="text-caption text-muted">{label}</p>
      <div className="mt-xxs">
        <PriceWithLocal amount={amount} size="lg" align="left" />
      </div>
    </div>
  );
}

function ContinueCard({ trip }: { trip: import("@/lib/mock-trips").MockTrip }) {
  const iconKey = trip.coverIconKey ?? "landmark";
  const Icon = placeIconRegistry[iconKey].icon;
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group flex items-stretch gap-md overflow-hidden rounded-lg border border-hairline bg-canvas transition-colors hover:border-ink"
    >
      <div className={`flex w-28 flex-shrink-0 items-center justify-center bg-gradient-to-br ${trip.coverColor}`}>
        <Icon size={36} strokeWidth={1.4} className="text-white/95" />
      </div>
      <div className="flex flex-1 items-center justify-between gap-md py-md pr-md">
        <div className="min-w-0">
          <p className="text-caption text-muted">繼續規劃 · {trip.destination}</p>
          <h3 className="mt-xxs truncate text-title-md text-ink">{trip.title}</h3>
          <div className="mt-xs flex flex-wrap items-center gap-xs text-caption text-muted">
            <span>{trip.subtitle}</span>
            <span>·</span>
            <span>{trip.planCount} 個方案</span>
            <span>·</span>
            <span>{formatTwd(trip.totalCost)}</span>
          </div>
        </div>
        <span className="hidden items-center gap-1 text-button text-primary transition-transform group-hover:translate-x-1 md:inline-flex">
          打開編輯器 <ArrowRight size={14} strokeWidth={2} />
        </span>
      </div>
    </Link>
  );
}

function QuickAction({
  title,
  desc,
  Icon,
  href,
}: {
  title: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-sm rounded-lg border border-hairline bg-canvas p-md transition-colors hover:border-ink hover:bg-surface-soft"
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-surface-card text-ink">
        <Icon size={18} strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-title-sm text-ink">{title}</p>
        <p className="text-caption text-muted">{desc}</p>
      </div>
      <ArrowRight size={14} strokeWidth={2} className="text-muted-soft transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}

function NewTripTile() {
  return (
    <Link
      href="/trips/new"
      className="group flex min-h-[200px] flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-hairline bg-canvas p-md text-muted transition-colors hover:border-primary hover:bg-surface-soft hover:text-ink"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-card text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
        <Plus size={22} strokeWidth={2} />
      </span>
      <p className="text-title-sm">新增旅程</p>
      <p className="text-caption text-muted-soft">從空白、範本或 JSON 匯入</p>
    </Link>
  );
}

function SearchInput() {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-soft"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        placeholder="搜尋旅程..."
        className="h-9 w-56 rounded-md border border-hairline bg-canvas pl-8 pr-3 text-body-sm text-ink placeholder:text-muted-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
    </div>
  );
}

