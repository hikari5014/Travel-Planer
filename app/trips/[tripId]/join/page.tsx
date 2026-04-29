import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Eye, Pencil } from "lucide-react";
import { SpikeMark } from "@/components/brand/SpikeMark";
import { joinTripViaToken } from "@/lib/services/share-service";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

// Landing page for share-link URLs:
//   /trips/:tripId/join?s=<shareId>&t=<rawToken>
// Validates the token and (on success) auto-creates a TripMember row for
// the visitor. Then renders a confirmation card with a button into the
// editor — we don't auto-redirect so the visitor can see what trip they
// just joined and as whom.

export default async function JoinTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ s?: string; t?: string }>;
}) {
  const { tripId } = await params;
  const sp = await searchParams;
  const token = sp.t ?? "";

  if (!token) {
    return <ErrorCard tripId={tripId} message="網址缺少 token 參數" />;
  }

  // ensureCurrentUser before the join so a fresh visitor (no row yet) gets
  // their User row created — joinTripViaToken will then upsert TripMember.
  const me = await ensureCurrentUser();
  const result = await joinTripViaToken(tripId, token);

  if (!result.ok) {
    return <ErrorCard tripId={tripId} message={result.error} />;
  }

  // If they're the owner, just bounce straight into the editor.
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, title: true, userId: true, startDate: true, endDate: true, owner: true },
  });
  if (!trip) return <ErrorCard tripId={tripId} message="找不到此旅程" />;
  if (trip.userId === me.id) redirect(`/trips/${tripId}`);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-hairline-soft bg-canvas">
        <div className="mx-auto flex h-14 max-w-content items-center gap-2 px-lg">
          <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
            <SpikeMark size={14} />
            <span className="text-caption">旅遊規劃Z</span>
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="text-title-sm text-ink">加入旅程</span>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-lg py-2xl">
        <div className="rounded-lg border border-hairline bg-canvas p-6 shadow-soft-elevation">
          <div className="flex items-center gap-2 text-success">
            <Check size={16} strokeWidth={2.4} />
            <p className="text-caption-uppercase">JOINED</p>
          </div>

          <h1 className="mt-2 text-title-lg text-ink">{trip.title}</h1>
          <p className="mt-1 text-caption text-muted">
            {trip.startDate.toISOString().slice(0, 10)} – {trip.endDate.toISOString().slice(0, 10)}
            {trip.owner ? ` · 由 ${trip.owner.displayName} 建立` : ""}
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-md bg-surface-soft p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas">
              {result.role === "editor" ? (
                <Pencil size={14} strokeWidth={1.8} />
              ) : (
                <Eye size={14} strokeWidth={1.8} />
              )}
            </div>
            <div>
              <p className="text-body-sm text-ink">
                你已加入為「{result.role === "editor" ? "編輯者" : "唯讀"}」
              </p>
              <p className="text-[11px] text-muted">
                身分：{me.displayName}（自動建立的訪客身份）
              </p>
            </div>
          </div>

          <Link
            href={`/trips/${tripId}`}
            className="mt-5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active"
          >
            進入編輯器
            <ArrowRight size={14} strokeWidth={2} />
          </Link>

          <p className="mt-3 text-center text-[11px] text-muted-soft">
            連結會記住你（cookie）— 之後不用再次貼網址。
          </p>
        </div>
      </main>
    </div>
  );
}

function ErrorCard({ tripId, message }: { tripId: string; message: string }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-hairline-soft bg-canvas">
        <div className="mx-auto flex h-14 max-w-content items-center gap-2 px-lg">
          <Link href="/" className="flex items-center gap-2 text-muted hover:text-ink">
            <SpikeMark size={14} />
            <span className="text-caption">旅遊規劃Z</span>
          </Link>
          <span className="text-muted-soft">/</span>
          <span className="text-title-sm text-ink">加入旅程</span>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-lg py-2xl">
        <div className="rounded-lg border border-error/40 bg-error/5 p-6">
          <div className="flex items-center gap-2 text-error">
            <AlertTriangle size={16} strokeWidth={2} />
            <p className="text-caption-uppercase">無法加入</p>
          </div>
          <h1 className="mt-2 text-title-md text-ink">分享連結無效</h1>
          <p className="mt-2 text-caption text-muted">{message}</p>
          <p className="mt-4 text-[11px] text-muted-soft">
            可能原因：連結被擁有者撤銷、已過期、或網址被截斷。
            請聯絡傳給你連結的人重新產生一個。
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-canvas px-4 text-button text-ink hover:border-ink"
          >
            回到首頁
          </Link>
          <p className="mt-3 text-[10px] text-muted-soft">trip ID: {tripId}</p>
        </div>
      </main>
    </div>
  );
}
