import Link from "next/link";
import { FileText, Layers as LayersIcon, Upload, Plus, ArrowRight, Download } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { TripCard } from "@/components/trip/TripCard";
import { listTripsForDashboard } from "@/lib/services/trip-service";
import { placeIconRegistry, type PlaceIconKey } from "@/lib/place-icon";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";
import { formatTwd } from "@/lib/format";
import { NewTripDialog } from "@/components/trip/NewTripDialog";
import { TripImportDialogContainer } from "@/components/trip/TripImportDialog";

// Dashboard pulls trips straight from the DB. Fresh installs see only the
// seeded demo data (kyoto-7d + 2 past trips).
export default async function HomePage() {
  const trips = await listTripsForDashboard();

  const activeTrips = trips.filter((t) => t.status === "active");
  const pastTrips = trips.filter((t) => t.status === "past");
  const lastEdited = activeTrips[0];

  const totalTrips = trips.length;
  const totalPlans = trips.reduce((sum, t) => sum + t.planCount, 0);
  const totalCost = trips.reduce((sum, t) => sum + t.totalCost, 0);

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
          <NewTripDialog />
          <TripImportDialogContainer />
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
              <span className="text-caption text-muted-soft">最近</span>
            </div>
            <ContinueCard trip={lastEdited} />
          </section>
        )}

        {/* Empty workspace welcome */}
        {totalTrips === 0 && (
          <section className="mt-xl rounded-lg border border-hairline bg-surface-soft px-lg py-xl text-center">
            <p className="text-title-md text-ink">歡迎使用旅遊規劃Z</p>
            <p className="mx-auto mt-xxs max-w-md text-caption text-muted">
              目前還沒有旅程。從「新增旅程」開始一段空白規劃，或從備份的 JSON 匯入既有資料。
            </p>
            <div className="mt-md flex items-center justify-center gap-sm">
              <a
                href="#new-trip"
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active"
              >
                <Plus size={14} strokeWidth={2} />
                新增旅程
              </a>
              <Link
                href="/settings#backup"
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-hairline bg-canvas px-4 text-button text-ink hover:border-ink"
              >
                <Upload size={14} strokeWidth={2} />
                匯入 JSON
              </Link>
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section className="mt-xl">
          <h2 className="mb-sm text-title-sm text-ink">快速開始</h2>
          <div className="grid gap-sm md:grid-cols-3">
            <QuickAction title="從空白開始" desc="自己決定每一步" Icon={FileText} href="#new-trip" />
            <QuickAction title="從範本複製" desc="敬請期待" Icon={LayersIcon} disabled />
            <QuickAction title="匯入 JSON" desc="還原備份的旅程" Icon={Upload} href="/settings#backup" />
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
            <TripImportTile />
            {activeTrips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={{
                  id: trip.id,
                  title: trip.title,
                  subtitle: trip.subtitle,
                  startDate: trip.startDate,
                  endDate: trip.endDate,
                  coverColor: trip.coverColor,
                  coverIconKey: trip.coverIconKey as PlaceIconKey,
                  planCount: trip.planCount,
                  totalCost: trip.totalCost,
                  baseCurrency: trip.baseCurrency,
                  status: trip.status as "active" | "past" | "upcoming",
                  destination: trip.destination,
                }}
              />
            ))}
          </div>

          {/* Past group */}
          {pastTrips.length > 0 && (
            <>
              <div className="mb-sm mt-xl flex items-center gap-xs">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-soft" />
                <span className="text-caption text-muted">已完成 · {pastTrips.length}</span>
              </div>
              <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
                {pastTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={{
                      id: trip.id,
                      title: trip.title,
                      subtitle: trip.subtitle,
                      startDate: trip.startDate,
                      endDate: trip.endDate,
                      coverColor: trip.coverColor,
                      coverIconKey: trip.coverIconKey as PlaceIconKey,
                      planCount: trip.planCount,
                      totalCost: trip.totalCost,
                      baseCurrency: trip.baseCurrency,
                      status: trip.status as "active" | "past" | "upcoming",
                      destination: trip.destination,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Footer status bar */}
        <div className="mt-xxl flex items-center justify-between border-t border-hairline-soft pt-md text-caption text-muted-soft">
          <span>旅遊規劃Z · v1.0 · Phase 10（成本回滾 / 每 kind 細節 / 飛行模塊 / 照片）</span>
          <span>單機 / 多人協作 · 4 種交通模式 · 真實路線 + 步驟 + 路況</span>
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

function ContinueCard({
  trip,
}: {
  trip: { id: string; title: string; subtitle: string; destination: string; coverColor: string; coverIconKey: string; planCount: number; totalCost: number };
}) {
  const iconKey = (trip.coverIconKey as PlaceIconKey) || "landmark";
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
  disabled,
}: {
  title: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  href?: string;
  disabled?: boolean;
}) {
  if (disabled || !href) {
    return (
      <div
        title="敬請期待"
        aria-disabled="true"
        className="group flex cursor-not-allowed items-center gap-sm rounded-lg border border-hairline bg-canvas p-md opacity-60"
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-surface-card text-muted-soft">
          <Icon size={18} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-title-sm text-muted">{title}</p>
          <p className="text-caption text-muted-soft">{desc}</p>
        </div>
      </div>
    );
  }
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
    <a
      href="#new-trip"
      className="group flex min-h-[200px] flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-hairline bg-canvas p-md text-muted transition-colors hover:border-primary hover:bg-surface-soft hover:text-ink"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-card text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
        <Plus size={22} strokeWidth={2} />
      </span>
      <p className="text-title-sm">新增旅程</p>
      <p className="text-caption text-muted-soft">從空白開始</p>
    </a>
  );
}

function TripImportTile() {
  return (
    <a
      href="#import-trip"
      className="group flex min-h-[200px] flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-hairline bg-canvas p-md text-muted transition-colors hover:border-brand-accent hover:bg-surface-soft hover:text-ink"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-card text-brand-accent transition-colors group-hover:bg-brand-accent group-hover:text-on-primary">
        <Download size={22} strokeWidth={2} />
      </span>
      <p className="text-title-sm">從外部貼入</p>
      <p className="text-caption text-muted-soft">JSON / 自然語言 → 自動部署</p>
    </a>
  );
}

function SearchInput() {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-soft"
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
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
